const express = require('express');
const router = express.Router();
const path = require('path');

const discountController = require('../Controllers/discountController');
const rollbackController = require('../Controllers/rollbackController');

// Serve the main page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Serve the rollback page
router.get('/rollback.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'rollback.html'));
});

// Discount routes
router.post('/check-existing-batch', discountController.checkExistingBatch);
router.post('/apply-discount', discountController.applyDiscount);

// Rollback routes
router.post('/get-batch-info', rollbackController.getBatchInfo);
router.post('/rollback-discount', rollbackController.rollbackDiscount);

module.exports = router;
