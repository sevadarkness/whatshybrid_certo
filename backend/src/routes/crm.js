const express = require("express");
const router = express.Router();
const { upsertDeal, listDeals, updateDeal, findDealByExternalId } = require("../services/crmService");

router.get("/deals", async (req, res) => {
  try {
    const deals = await listDeals();
    res.json(deals);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/deals/by-external/:externalId", async (req, res) => {
  try {
    const deal = await findDealByExternalId(req.params.externalId);
    if (!deal) return res.status(404).json({ error: "not found" });
    res.json(deal);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/deals", async (req, res) => {
  try {
    const deal = await upsertDeal(req.body || {});
    res.json(deal);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch("/deals/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updated = await updateDeal(id, req.body || {});
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = { router };
