const express = require("express");
const router = express.Router();
const { pool } = require("../config/db"); // your MySQL pool

const grantToken = require("../functions/grant_tocken");
const createPayment = require("../functions/create_payment");
const executePayment = require("../functions/execute_payment");
function getUserFromCookie(req) {
  try {
    if (!req.cookies.user) return null;
    return JSON.parse(req.cookies.user);
  } catch {
    return null;
  }
}
// 1) PREVIEW (existing)
router.post("/credits/preview", (req, res) => {
  const user = getUserFromCookie?.(req);
  const { amountUSD } = req.body;

  const finalAmount = Math.max(1, Number(amountUSD) || 0);
  const credits = finalAmount * 100;

  console.log("Credits preview request:", {
    user,
    rawAmountUSD: amountUSD,
    finalAmountUSD: finalAmount,
    credits,
  });

  return res.json({
    amountUSD: finalAmount,
    credits,
    message: "Logged on the server 👍",
  });
});

// 2) INITIATE PAYMENT (creates bKash payment & stores pending record)
router.post("/credits/initiate", async (req, res) => {
  const user = getUserFromCookie?.(req);
  if (!user || !user.id) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    // Fetch exchange rate and credits per dollar from app_settings table
    const [settingsRows] = await pool.query(
      "SELECT `key`, `value` FROM app_settings WHERE `key` IN ('usdToBdt', 'creditsPerDollar')"
    );
    const settings = {};
    settingsRows.forEach(row => { settings[row.key] = Number(row.value); });
    const usdToBdt = settings.usdToBdt || 110;
    const creditsPerDollar = settings.creditsPerDollar || 100;

    const { amountUSD } = req.body;
    const amountBDT = (Number(amountUSD) || 1) * usdToBdt;
    const credits = (Number(amountUSD) || 1) * creditsPerDollar;

    const id_token = await grantToken();
    const paymentBody = {
      mode: "0011",
      payerReference: " ",
      callbackURL: process.env.BKASH_CALLBACK_URL,
      amount: amountBDT.toFixed(2),
      currency: "BDT",
      intent:  "sale",
      merchantInvoiceNumber: `INV-${Date.now()}-${user.id}`,
    };

    const bkashRes = await createPayment(id_token, paymentBody);

    if (!bkashRes.paymentID) {
      return res.status(500).json({ error: "Failed to create payment" });
    }

    // Save record
    await pool.query(
      `INSERT INTO credit_payments (user_id, payment_id, amount_bdt, credits, token, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [user.id, bkashRes.paymentID, amountBDT, credits, id_token]
    );

    return res.json({
      paymentID: bkashRes.paymentID,
      bkashURL: bkashRes.bkashURL,
    });
  } catch (err) {
    console.error("Initiate payment error:", err);
    return res.status(500).json({ error: "Failed to initiate payment" });
  }
});


// 3) EXECUTE PAYMENT (finalizes payment and updates credits)
router.post("/credits/execute", async (req, res) => {
  const user = getUserFromCookie?.(req);
  if (!user || !user.id) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  const { paymentID } = req.body;
  if (!paymentID) return res.status(400).json({ error: "paymentID required" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT * FROM credit_payments WHERE payment_id = ? AND user_id = ? FOR UPDATE",
      [paymentID, user.id]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Payment not found" });
    }

    const payment = rows[0];
    if (payment.status !== "PENDING") {
      await conn.rollback();
      return res.status(409).json({ error: `Already ${payment.status}` });
    }

    const id_token = payment.token || (await grantToken());

    const execRes = await executePayment(paymentID, id_token);

    if (execRes?.transactionStatus === "Completed") {
      await conn.query(
        "UPDATE credit_payments SET status='SUCCESS', trx_id=? WHERE id=?",
        [execRes.trxID || null, payment.id]
      );
      await conn.query(
        "UPDATE users SET credits = credits + ? WHERE id = ?",
        [payment.credits, user.id]
      );

      await conn.commit();
      return res.json({
        success: true,
        creditsAdded: payment.credits,
        trxID: execRes.trxID,
      });
    }

    await conn.query(
      "UPDATE credit_payments SET status='FAILED' WHERE id=?",
      [payment.id]
    );
    await conn.commit();
    return res.status(400).json({ error: "Payment not completed", execRes });
  } catch (err) {
    await conn.rollback();
    console.error("execute error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to execute payment" });
  } finally {
    conn.release();
  }
});

// Get settings for credits and conversion
router.get("/settings/credits", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT `key`, `value` FROM app_settings WHERE `key` IN ('usdToBdt', 'creditsPerDollar')"
    );
    const settings = {};
    rows.forEach(row => { settings[row.key] = Number(row.value); });
    res.json({
      usdToBdt: settings.usdToBdt || 110,
      creditsPerDollar: settings.creditsPerDollar || 100
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

module.exports = router;
