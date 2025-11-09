const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const xml2js = require("xml2js");
const path = require("path");
const util = require("util");
const OriginalPrice = require("../models/OriginalPrice");
const StoreToken = require("../models/StoreToken");

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

// ✅ Helper: Parse XML upload response
async function getStagedUploadPath(xml) {
  try {
    const result = await parseStringAsync(xml);
    return result?.PostResponse?.Key?.[0];
  } catch (err) {
    console.error("❌ XML parse error:", err.message);
    return null;
  }
}

const applyDiscount = async (req, res) => {
  const { shop, token, collection_id, percentage, price_updation_name } = req.body;

  if (!shop) return res.status(400).send("Shop URL is required.");
  if (!token) return res.status(400).send("Token is required.");
  if (!collection_id) return res.status(400).send("Collection ID is required.");
  if (!percentage) return res.status(400).send("Percentage is required.");
  if (!price_updation_name) return res.status(400).send("Batch name is required.");

  const SHOP = shop;
  const TOKEN = token;
  const COLLECTION_ID = collection_id;
  const COLLECTION_GID = `gid://shopify/Collection/${COLLECTION_ID}`;
  const DISCOUNT_PERCENT = parseFloat(percentage);
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": TOKEN,
  };

  // ✅ Prevent duplicate batch names
  const existingBatch = await OriginalPrice.findOne({
    storeId: SHOP,
    price_updation_name,
  });
  if (existingBatch) return res.status(400).send("❌ Batch name already exists.");

  // ✅ Save store token if missing
  const existingStore = await StoreToken.findOne({ storeId: SHOP });
  if (!existingStore) await StoreToken.create({ storeId: SHOP, token: TOKEN });

  // ✅ Step 1: Start Bulk Query to get variants from collection
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
      bulkOperation { id status }
      userErrors { field message }
    }
  }`;

  const bulkResponse = await axios.post(
    `https://${SHOP}/admin/api/2025-01/graphql.json`,
    { query: bulkQuery },
    { headers }
  );

  const bulkOpData = bulkResponse.data?.data?.bulkOperationRunQuery?.bulkOperation;
  if (!bulkOpData?.id) {
    console.error("❌ Failed to start bulk operation:", bulkResponse.data);
    return res.status(500).send("❌ Failed to start bulk operation.");
  }
  console.log("🚀 Bulk operation started:", bulkOpData.id);

  // ✅ Step 2: Poll for completion
  let bulkOperationUrl = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const statusRes = await axios.post(
      `https://${SHOP}/admin/api/2025-01/graphql.json`,
      { query: `{ currentBulkOperation { id status url errorCode } }` },
      { headers }
    );
    const current = statusRes.data?.data?.currentBulkOperation;
    if (current?.status === "COMPLETED") {
      console.log("✅ Bulk status: COMPLETED");
      bulkOperationUrl = current.url;
      break;
    } else if (current?.status === "FAILED") {
      console.error("❌ Bulk query failed:", current.errorCode);
      return res.status(500).send(`❌ Bulk operation failed: ${current.errorCode}`);
    }
  }

  if (!bulkOperationUrl) return res.status(500).send("❌ Bulk operation did not complete in time.");

  // ✅ Step 3: Download and parse variants
  const response = await axios.get(bulkOperationUrl);
  const parsedLines = response.data
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Group variants by product
  const productMap = {};
  parsedLines.forEach((item) => {
    if (item?.id && item?.__parentId) {
      const productId = item.__parentId;
      if (!productMap[productId]) productMap[productId] = [];
      const originalPrice = parseFloat(item.price);
      const discountedPrice = (originalPrice * (1 - DISCOUNT_PERCENT / 100)).toFixed(2);
      productMap[productId].push({
        id: item.id,
        price: discountedPrice,
        compareAtPrice: originalPrice.toFixed(2),
      });
    }
  });

  if (Object.keys(productMap).length === 0)
    return res.status(400).send("⚠️ No variants found to update.");

  // ✅ Save original prices
  for (const productId in productMap) {
    for (const v of productMap[productId]) {
      await OriginalPrice.create({
        storeId: SHOP,
        variantId: v.id,
        originalPrice: v.compareAtPrice,
        price_updation_name,
        collectionId: COLLECTION_ID,
        percentage: DISCOUNT_PERCENT,
      });
    }
  }

  // ✅ Step 4: Update variants product-by-product
  for (const [productId, variants] of Object.entries(productMap)) {
    const updateMutation = `
      mutation {
        productVariantsBulkUpdate(
          productId: "${productId}",
          variants: ${JSON.stringify(variants).replace(/"([^"]+)":/g, "$1:")}
        ) {
          product { id }
          productVariants { id price compareAtPrice }
          userErrors { field message }
        }
      }
    `;

    try {
      const updateRes = await axios.post(
        `https://${SHOP}/admin/api/2025-01/graphql.json`,
        { query: updateMutation },
        { headers }
      );

      const result = updateRes.data.data.productVariantsBulkUpdate;
      if (result.userErrors?.length) {
        console.error("⚠️ Errors for product:", productId, result.userErrors);
      } else {
        console.log(`✅ Updated ${variants.length} variants for product ${productId}`);
      }
    } catch (err) {
      console.error(`❌ Failed to update product ${productId}:`, err.response?.data || err.message);
    }
  }

  return res.status(200).json({
    message: `✅ Discount applied to ${Object.keys(productMap).length} products.`,
    discount: DISCOUNT_PERCENT,
  });
};

module.exports = { checkExistingBatch, applyDiscount };
