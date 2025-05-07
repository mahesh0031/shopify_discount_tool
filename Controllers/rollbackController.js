const axios = require('axios');
const OriginalPrice = require('../models/OriginalPrice');
const StoreToken = require('../models/StoreToken');

const getBatchInfo = async (req, res) => {
  const { shop, price_updation_name } = req.body;

  try {
    const batch = await OriginalPrice.findOne({
      storeId: shop,
      price_updation_name,
    });

    if (!batch) {
      return res.status(404).json({ exists: false });
    }

    return res.status(200).json({ exists: true, batch });
  } catch (error) {
    return res.status(500).send('Server error while fetching batch info.');
  }
};

const rollbackDiscount = async (req, res) => {
  const { shop, price_updation_name } = req.body;

  try {
    const tokenEntry = await StoreToken.findOne({ storeId: shop });
    if (!tokenEntry) return res.status(400).send('❌ Store token not found.');

    const TOKEN = tokenEntry.token;
    const headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    };

    const variants = await OriginalPrice.find({
      storeId: shop,
      price_updation_name,
    });

    if (!variants.length) return res.status(404).send('❌ No variants found for rollback.');

    const productDataMap = {};

    const productDataPromises = variants.map(async (variant) => {
      const variantId = variant.variantId;

      const query = `
        query {
          productVariant(id: "${variantId}") {
            id
            price
            product {
              id
            }
          }
        }
      `;

      try {
        const response = await axios.post(
          `https://${shop}/admin/api/2023-10/graphql.json`,
          { query },
          { headers, timeout: 10000 }
        );

        const productVariant = response.data?.data?.productVariant;
        if (!productVariant) return null;

        const productId = productVariant.product.id;
        productDataMap[productId] = productDataMap[productId] || [];
        productDataMap[productId].push({
          id: variant.variantId,
          price: variant.originalPrice,
          compareAtPrice: null, // ✅ Explicitly blank out compareAtPrice
        });

        return true;
      } catch (err) {
        return null;
      }
    });

    await Promise.all(productDataPromises);

    if (Object.keys(productDataMap).length === 0) {
      return res.status(400).send('❌ No valid variants found for rollback.');
    }

    for (const [productId, variantsList] of Object.entries(productDataMap)) {
      const mutation = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            product {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        productId,
        variants: variantsList,
      };

      const response = await axios.post(
        `https://${shop}/admin/api/2023-10/graphql.json`,
        { query: mutation, variables },
        { headers, timeout: 10000 }
      );

      const userErrors = response.data?.data?.productVariantsBulkUpdate?.userErrors || [];
      if (userErrors.length > 0) {
        return res.status(400).json({ errors: userErrors });
      }
    }

    await OriginalPrice.deleteMany({
      storeId: shop,
      price_updation_name,
    });

    return res.send('✅ Rollback completed successfully.');
  } catch (error) {
    return res.status(500).send('Server error while rolling back discount.');
  }
};

module.exports = {
  getBatchInfo,
  rollbackDiscount,
};
