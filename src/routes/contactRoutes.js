const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

router.post('/', contactController.saveContactRequest);
router.get('/', contactController.getContactRequests);

module.exports = router;
