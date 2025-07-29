// /routes/userImages.js

const express = require("express");
const { toggleFavorite, softDeleteImage } = require("../controllers/userImagesController");
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.post("/user-images/:id/favorite",requireAuth, toggleFavorite);
router.post("/user-images/:id/delete",requireAuth, softDeleteImage);

module.exports = router;
