// models/StoreToken.js
const mongoose = require('mongoose');

const StoreTokenSchema = new mongoose.Schema({
  storeId: { type: String, unique: true },
  token: String,
});

// Check if the model already exists to prevent overwriting
module.exports = mongoose.models.StoreToken || mongoose.model('StoreToken', StoreTokenSchema);
