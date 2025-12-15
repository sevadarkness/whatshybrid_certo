const express = require('express');
const crypto = require('crypto');
const prisma = require('../prisma');
const { setOpenAIKey, getOpenAIStatus } = require('../services/settingsService');

const router = express.Router();

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.adminToken;
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_TOKEN não configurado no backend' });
  }

  if (!token || token !== expected) {
    return res.status(401).json({ error: 'Unauthorized (admin token)' });
  }

  next();
}

// Todas as rotas deste arquivo exigem admin
router.use(requireAdmin);

// =============================
// CONFIG / SETTINGS
// =============================

router.get('/settings/openai', async (req, res) => {
  try {
    const status = await getOpenAIStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/settings/openai', async (req, res) => {
  try {
    const { apiKey } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'apiKey é obrigatório' });
    }
    await setOpenAIKey(apiKey);
    const status = await getOpenAIStatus();
    res.json({ ok: true, ...status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================
// LICENÇAS / CRÉDITOS
// =============================

router.get('/licenses', async (req, res) => {
  try {
    const take = Math.min(200, Math.max(1, parseInt(req.query.take || '50', 10)));
    const skip = Math.max(0, parseInt(req.query.skip || '0', 10));

    const licenses = await prisma.licenseKey.findMany({
      take,
      skip,
      orderBy: { createdAt: 'desc' },
      select: {
        key: true,
        userEmail: true,
        status: true,
        plan: true,
        trial: true,
        trialEndsAt: true,
        boundClientId: true,
        activatedAt: true,
        aiEnabled: true,
        aiCredits: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    res.json({ items: licenses, take, skip });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/licenses/topup', async (req, res) => {
  try {
    const { key, credits } = req.body || {};
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'key é obrigatório' });
    }
    const amount = parseInt(credits, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'credits deve ser > 0' });
    }

    const updated = await prisma.licenseKey.update({
      where: { key },
      data: { aiCredits: { increment: amount } }
    });

    res.json({ ok: true, key: updated.key, aiCredits: updated.aiCredits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================
// CÓDIGOS DE RECARGA (vouchers)
// =============================

function generateVoucherCode() {
  // Ex: QCRED-AB12-CD34-EF56
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12 chars
  return `QCRED-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;
}

router.post('/topup-codes', async (req, res) => {
  try {
    const { credits, quantity, expiresAt } = req.body || {};
    const amount = parseInt(credits, 10);
    const qty = Math.min(500, Math.max(1, parseInt(quantity || '1', 10)));

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'credits deve ser > 0' });
    }

    let exp = null;
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'expiresAt inválido' });
      }
      exp = d;
    }

    const created = [];

    // Criar individualmente para evitar colisões de unique
    for (let i = 0; i < qty; i++) {
      let code = generateVoucherCode();
      let tries = 0;
      while (tries < 5) {
        try {
          const row = await prisma.topupCode.create({
            data: {
              code,
              credits: amount,
              expiresAt: exp,
              status: 'ACTIVE'
            }
          });
          created.push({ code: row.code, credits: row.credits, expiresAt: row.expiresAt });
          break;
        } catch (e) {
          // se colidir, gera outro
          code = generateVoucherCode();
          tries++;
        }
      }
    }

    res.json({ ok: true, items: created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/topup-codes', async (req, res) => {
  try {
    const take = Math.min(200, Math.max(1, parseInt(req.query.take || '50', 10)));
    const skip = Math.max(0, parseInt(req.query.skip || '0', 10));
    const status = req.query.status;

    const where = {};
    if (status) where.status = String(status).toUpperCase();

    const codes = await prisma.topupCode.findMany({
      take,
      skip,
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        code: true,
        credits: true,
        status: true,
        expiresAt: true,
        redeemedAt: true,
        redeemedByKey: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    res.json({ items: codes, take, skip });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router };
