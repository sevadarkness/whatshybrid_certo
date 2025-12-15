const express = require("express");
const router = express.Router();
const { getFlows, saveFlows } = require("../services/flowService");

router.get("/", async (req, res) => {
  try {
    const flows = await getFlows();
    res.json(flows.map((f) => f.config));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/", async (req, res) => {
  try {
    const flows = Array.isArray(req.body) ? req.body : [];
    await saveFlows(flows);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = { router };
