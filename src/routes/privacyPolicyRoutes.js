const express = require('express');
const router = express.Router();
const privacyPolicyController = require('../controllers/privacyPolicyController');

// GET all policy sections
router.get('/', privacyPolicyController.getPrivacyPolicy);

// POST/PUT (replace all sections)
router.post('/', privacyPolicyController.savePrivacyPolicy);

module.exports = router;
