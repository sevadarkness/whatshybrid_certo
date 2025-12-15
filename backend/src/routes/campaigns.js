const express = require("express");
const router = express.Router();
const {
  createCampaign,
  listCampaigns,
  getCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
} = require("../services/campaignService");

function truthy(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

router.get("/", async (req, res) => {
  try {
    const includeItems = truthy(req.query.includeItems);
    const campaigns = await listCampaigns({ includeItems });
    res.json(campaigns);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const includeItems = truthy(req.query.includeItems ?? "1");
    const campaign = await getCampaign(req.params.id, { includeItems });
    res.json(campaign);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    // Backwards compatibility: accept a single attachment payload and convert to media[]
    if (body.attachment && !body.media) {
      const att = body.attachment;
      let dataUrl = att.dataUrl;
      if (!dataUrl && att.base64 && att.mimeType) {
        // If the client sends only the raw base64, rebuild a data URL.
        const raw = String(att.base64).includes("data:")
          ? String(att.base64)
          : `data:${att.mimeType};base64,${att.base64}`;
        dataUrl = raw;
      }

      body.media = [
        {
          name: att.filename || att.name || "anexo",
          type: att.mimeType || att.type || "application/octet-stream",
          size: att.size || 0,
          base64: dataUrl,
        },
      ];

      delete body.attachment;
    }

    // Normalize media: allow sending a single object
    if (body.media && !Array.isArray(body.media)) {
      body.media = [body.media];
    }

    const campaign = await createCampaign(body);
    res.json(campaign);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/:id/pause", async (req, res) => {
  try {
    const updated = await pauseCampaign(req.params.id);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/:id/resume", async (req, res) => {
  try {
    const updated = await resumeCampaign(req.params.id);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    const updated = await cancelCampaign(req.params.id);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = { router };
