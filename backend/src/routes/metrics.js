const express = require("express");
const router = express.Router();
const { getSummary } = require("../services/metricsService");

router.get("/summary", async (req, res) => {
  try {
    const summary = await getSummary();
    res.json(summary);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router };
