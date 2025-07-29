const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');

router.get('/', usersController.getUsers);
router.get('/:id/details', usersController.getUserDetails);
router.get('/:id/transactions', usersController.getUserTransactions);
module.exports = router;
