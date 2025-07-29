

const { pool } = require("../config/db");

exports.toggleFavorite = async (req, res) => {
  const userId = req.user.id; // Use your auth middleware to get user id
  const imageId = req.params.id;
  const { favorite } = req.body;

  try {
    // (Optional) Ensure image belongs to user
    const [[img]] = await pool.query(
      "SELECT id FROM user_images WHERE id = ? AND user_id = ?",
      [imageId, userId]
    );
    if (!img) return res.status(404).json({ error: "Image not found" });

    // Update favorite
    await pool.query(
      "UPDATE user_images SET is_favorite = ? WHERE id = ? AND user_id = ?",
      [favorite ? 1 : 0, imageId, userId]
    );
    res.json({ success: true, is_favorite: !!favorite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update favorite" });
  }
};

// /controllers/userImagesController.js

exports.softDeleteImage = async (req, res) => {
  const userId = req.user.id; // Use your auth middleware to get user id
  const imageId = req.params.id;

  try {
    // (Optional) Ensure image belongs to user
    const [[img]] = await pool.query(
      "SELECT id FROM user_images WHERE id = ? AND user_id = ?",
      [imageId, userId]
    );
    if (!img) return res.status(404).json({ error: "Image not found" });

    // Set is_deleted = 1
    await pool.query(
      "UPDATE user_images SET is_deleted = 1 WHERE id = ? AND user_id = ?",
      [imageId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete image" });
  }
};
