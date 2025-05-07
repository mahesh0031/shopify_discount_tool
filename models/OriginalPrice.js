// models/OriginalPrice.js
const mongoose = require('mongoose');

const OriginalPriceSchema = new mongoose.Schema({
  storeId: String,
  variantId: String,
  originalPrice: String,
  price_updation_name: String,
  collectionId: String,
  percentage: Number,
});

// Ensure index is created for unique combination of storeId, variantId, and price_updation_name
OriginalPriceSchema.index({ storeId: 1, variantId: 1, price_updation_name: 1 }, { unique: true });

module.exports = mongoose.model('OriginalPrice', OriginalPriceSchema);
