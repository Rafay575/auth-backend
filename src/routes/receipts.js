const express = require("express");
const router = express.Router();
const { downloadReceiptsPdf } = require("../controllers/receiptsController");

// Require authentication middleware to set req.user
const {requireAuth} = require("../middleware/auth"); // adapt to your project

router.get("/receipts", requireAuth, downloadReceiptsPdf);

module.exports = router;
