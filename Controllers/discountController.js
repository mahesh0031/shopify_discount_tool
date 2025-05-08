const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const xml2js = require('xml2js');
const path = require('path');
const OriginalPrice = require('../models/OriginalPrice');
const StoreToken = require('../models/StoreToken');
const util = require('util');

// Promisify xml2js.parseString method
const parseStringAsync = util.promisify(xml2js.parseString);

const checkExistingBatch = async (req, res) => {
  const { shop, collection_id } = req.body;

  const existing = await OriginalPrice.findOne({
    storeId: shop,
    collectionId: collection_id,
  });

  if (existing) {
    return res.status(200).json({ exists: true, percentage: existing.percentage });
  }

  return res.status(200).json({ exists: false });
};

async function getStagedUploadPath(xml) {
  try {
    const result = await parseStringAsync(xml);
    const stagedUploadPath = result?.PostResponse?.Key?.[0];
    return stagedUploadPath;
  } catch (err) {
    return null;
  }
}

const applyDiscount = async (req, res) => {
  const { shop, token, collection_id, percentage, price_updation_name } = req.body;

  if (!shop) {
    return res.status(400).send('Shop Url is required.');
  }
  if (!token) {
    return res.status(400).send('Token is required.');
  }
  if (!collection_id) {
    return res.status(400).send('Collection id is required.');
  }
  if (!percentage) {
    return res.status(400).send('Percentage is required.');
  }
  if (!price_updation_name) {
    return res.status(400).send('Batch name is required.');
  }
  

  const SHOP = shop;
  const TOKEN = token;
  const COLLECTION_ID = collection_id;
  const COLLECTION_GID = `gid://shopify/Collection/${COLLECTION_ID}`;
  const DISCOUNT_PERCENT = parseFloat(percentage);
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': TOKEN,
  };

  // ✅ Prevent duplicate batch name per store
  const existingBatch = await OriginalPrice.findOne({
    storeId: SHOP,
    price_updation_name,
  });

  if (existingBatch) {
    return res.status(400).send('❌ Batch name already exists.');
  }

  // ✅ Prevent duplicate discount for the same collection per store
  const existingCollectionDiscount = await OriginalPrice.findOne({
    storeId: SHOP,
    collectionId: COLLECTION_ID,
  });

  

  // ✅ Save token if not already saved
  const existingStore = await StoreToken.findOne({ storeId: SHOP });
  if (!existingStore) {
    await StoreToken.create({ storeId: SHOP, token: TOKEN });
  }

  // Step 1: Start Bulk Query
  const bulkQuery = `mutation {
    bulkOperationRunQuery(
      query: """
      {
        collection(id: "${COLLECTION_GID}") {
          products(first: 100) {
            edges {
              node {
                id
                title
                variants(first: 100) {
                  edges {
                    node {
                      id
                      price
                    }
                  }
                }
              }
            }
          }
        }
      }
      """
    ) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }`;

  const bulkResponse = await axios.post(
    `https://${SHOP}/admin/api/2023-10/graphql.json`,
    { query: bulkQuery },
    { headers }
  );

  const bulkOpData = bulkResponse.data?.data?.bulkOperationRunQuery?.bulkOperation;
  if (!bulkOpData?.id) {
    return res.status(500).send('❌ Failed to start bulk operation.');
  }

  // Step 2: Poll for completion
  let bulkOperationUrl = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const statusQuery = `{ currentBulkOperation { id status url errorCode } }`;
    const statusRes = await axios.post(
      `https://${SHOP}/admin/api/2023-10/graphql.json`,
      { query: statusQuery },
      { headers }
    );
    const current = statusRes.data?.data?.currentBulkOperation;
    if (current?.status === 'COMPLETED') {
      bulkOperationUrl = current.url;
      break;
    } else if (current?.status === 'FAILED') {
      return res.status(500).send(`❌ Bulk operation failed: ${current.errorCode}`);
    }
  }

  if (!bulkOperationUrl) {
    return res.status(500).send('❌ Bulk operation did not complete in time.');
  }

  // Step 3: Process products and variants
  const response = await axios.get(bulkOperationUrl);
  const lines = response.data.split('\n').filter(Boolean);

  const parsedLines = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);

  const productMap = {};
  const variantList = [];

  parsedLines.forEach(item => {
    if (item.__parentId) {
      variantList.push(item);
    } else {
      productMap[item.id] = {
        ...item,
        variants: [],
      };
    }
  });

  variantList.forEach(variant => {
    const parentId = variant.__parentId;
    if (productMap[parentId]) {
      productMap[parentId].variants.push(variant);
    }
  });

  const productsWithVariants = Object.values(productMap);
  const variantUpdates = [];

  for (const product of productsWithVariants) {
    for (const variant of product.variants) {
      const variantId = variant.id;
      const originalPrice = parseFloat(variant.price);
      const discountedPrice = (originalPrice * (1 - DISCOUNT_PERCENT / 100)).toFixed(2);

      // Set current price as "compare at price" and apply the discount to the price
      await OriginalPrice.create({
        storeId: SHOP,
        variantId,
        originalPrice: originalPrice.toFixed(2),
        price_updation_name,
        collectionId: COLLECTION_ID,
        percentage: DISCOUNT_PERCENT,
      });

      variantUpdates.push({
        variantId,
        discountedPrice,
        compareAtPrice: originalPrice.toFixed(2), // Set the original price as compare_at_price
      });
    }
  }

  if (variantUpdates.length === 0) {
    return res.status(400).send('⚠️ No variants found to update.');
  }

  // Step 4: Stage Upload
  const mutationPayload = variantUpdates.map(v =>
    JSON.stringify({
      input: {
        id: v.variantId,
        price: v.discountedPrice,
        compareAtPrice: v.compareAtPrice,
      }
    })
  ).join('\n');

  const stagedUpload = await axios.post(
    `https://${SHOP}/admin/api/2023-10/graphql.json`,
    {
      query: `mutation {
        stagedUploadsCreate(input: [{
          resource: BULK_MUTATION_VARIABLES,
          filename: "variants_update.jsonl",
          mimeType: "text/jsonl",
          httpMethod: POST
        }]) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`
    },
    { headers }
  );

  const target = stagedUpload.data.data.stagedUploadsCreate.stagedTargets[0];

  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }

  const tmpFilePath = path.join(__dirname, 'variants_update.jsonl');
  fs.writeFileSync(tmpFilePath, mutationPayload);
  formData.append('file', fs.createReadStream(tmpFilePath));

  try {
    const uploadResponse = await axios.post(target.url, formData, {
      headers: formData.getHeaders(),
    });

    // Step 5: Parse the XML response to get stagedUploadPath
    const xml = uploadResponse.data;
    const stagedUploadPath = await getStagedUploadPath(xml);

    if (!stagedUploadPath) {
      return res.status(500).send('❌ Failed to get stagedUploadPath.');
    }

    if (uploadResponse.status !== 201) {
      return res.status(500).send('❌ Failed to upload file.');
    }

    // Step 6: Run Mutation using Bulk Operation
    const mutationRun = `
    mutation bulkOperationRunMutation($stagedUploadPath: String!) {
      bulkOperationRunMutation(
        mutation: "mutation call($input: ProductVariantInput!) {
          productVariantUpdate(input: $input) {
            product {
              id
            }
            userErrors {
              field
              message
            }
          }
        }",
        stagedUploadPath: $stagedUploadPath
      ) {
        bulkOperation {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
    `;

    const finalResult = await axios.post(
      `https://${SHOP}/admin/api/2023-10/graphql.json`,
      {
        query: mutationRun,
        variables: { stagedUploadPath }
      },
      { headers }
    );

    const statusQuery = `{ 
      currentBulkOperation { 
        id 
        status 
        url 
        errorCode 
      } 
    }`;

    const statusRes = await axios.post(
      `https://${SHOP}/admin/api/2023-10/graphql.json`,
      { query: statusQuery },
      { headers }
    );

    return res.status(200).send(`✅ ${variantUpdates.length} variants have been updated with a ${DISCOUNT_PERCENT}% discount.`);

  } catch (error) {
    return res.status(500).send('❌ File upload failed.');
  }
};


module.exports = { checkExistingBatch, applyDiscount };
