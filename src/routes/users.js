const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');

router.get('/', usersController.getUsers);
router.get('/:id/details', usersController.getUserDetails);
router.get('/:id/transactions', usersController.getUserTransactions);
router.post('/:id/block', usersController.blockUser);

// Unblock user
router.post('/:id/unblock', usersController.unblockUser);
module.exports = router;
