const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const routes = require('./routes'); // Import routes from the routes folder

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect MongoDB
// change the db url as per your requirement
mongoose.connect('mongodb://localhost:27017/ShopifyDiscounts', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
console.log('✅ Connected to MongoDB');

// Use routes from the routes folder
app.use(routes); // This will handle all route definitions

// Start server
app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
