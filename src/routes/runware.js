const express = require("express");
const { pool } = require("../config/db"); // mysql2/promise pool
const { Runware } = require("@runware/sdk-js");

const router = express.Router();

const runware = new Runware({
  apiKey: process.env.RUNWARE_API_KEY,
});

// All sizes multiples of 64 (safe)
const ratioToSize = {
  "1:1":  [1024, 1024],
  "3:2":  [1152, 768],
  "2:3":  [768, 1152],
  "4:3":  [1024, 768],
  "3:4":  [768, 1024],
  "16:9": [1280, 704],
  "9:16": [704, 1280],
};
function getUserFromCookie(req) {
  try {
    if (!req.cookies.user) return null;
    return JSON.parse(req.cookies.user);
  } catch {
    return null;
  }
}

router.post("/txt2img", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    // Extract user from cookie
    const cookieUser = getUserFromCookie(req);
    if (!cookieUser || !cookieUser.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    let {
      prompt,
      aspectRatio = "1:1",
      numImages = 1,
      enhance = true,
      seed = 30,
    } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid prompt" });
    }

    numImages = parseInt(numImages, 10) || 1;
    const steps = parseInt(seed, 10) || 30;

    const ratioToSize = {
      "1:1": [1024, 1024],
      "3:2": [1152, 768],
      "2:3": [768, 1152],
      "4:3": [1024, 768],
      "3:4": [768, 1024],
      "16:9": [1280, 704],
      "9:16": [704, 1280],
    };

    const [width, height] = ratioToSize[aspectRatio] || ratioToSize["1:1"];

    await conn.beginTransaction();

    // Get credits for this user
    const [users] = await conn.query(
      "SELECT credits FROM users WHERE id = ? FOR UPDATE",
      [cookieUser.id]
    );

    if (!users.length) {
      await conn.rollback();
      return res.status(401).json({ error: "User not found" });
    }

    const currentCredits = users[0].credits;

    if (currentCredits < numImages) {
      await conn.rollback();
      return res.status(402).json({
        error: "INSUFFICIENT_CREDITS",
        needed: numImages,
        have: currentCredits,
      });
    }

    const params = {
      positivePrompt: prompt,
      model: "runware:101@1",
      width,
      height,
      steps,
      numberResults: numImages,
      enhancePrompt: !!enhance,
    };

    console.log("Runware request:", params);

   const rw = await runware.requestImages(params);

// Handle both shapes: `[...]` or `{ images: [...] }`
const images = Array.isArray(rw) ? rw : Array.isArray(rw?.images) ? rw.images : [];

console.log("Runware response:", rw);

    if (images.length > 0) {
      const insertValues = images.map((img) => [cookieUser.id, img.imageURL]);
      await conn.query(
        "INSERT INTO user_images (user_id, image_url) VALUES ?",
        [insertValues]
      );
    }

    await conn.query(
      "UPDATE users SET credits = credits - ? WHERE id = ?",
      [images.length, cookieUser.id]
    );

    await conn.commit();
    return res.json({ images });
  } catch (err) {
    await conn.rollback();
    console.error("Runware error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  } finally {
    conn.release();
  }
});

router.get("/mine", async (req, res) => {
  try {
    const cookieUser = getUserFromCookie(req);
    if (!cookieUser || !cookieUser.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [rows] = await pool.query(
      "SELECT id,is_deleted, is_favorite, image_url AS imageURL, created_at AS createdAt FROM user_images  WHERE user_id = ? AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY created_at DESC",
      [cookieUser.id]
    );

    res.json({ images: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


module.exports = router;
