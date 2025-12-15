const express = require('express');
const prisma = require('../prisma');
const { ensureMasterLicenseRecord, MASTER_KEY } = require('../services/licenseService');

const router = express.Router();

/**
 * Resgata um voucher (TopupCode) e adiciona créditos na licença.
 *
 * Requer:
 * - x-license-key (ou body.licenseKey)
 * - body.code
 */
router.post('/redeem', async (req, res) => {
  try {
    const code = (req.body?.code || '').toString().trim().toUpperCase();
    const licenseKey = (req.headers['x-license-key'] || req.body?.licenseKey || '').toString().trim();

    if (!code) {
      return res.status(400).json({ error: 'code é obrigatório' });
    }

    if (!licenseKey) {
      return res.status(401).json({ error: 'x-license-key é obrigatório' });
    }

    // Master key: garantir registro e permitir fluxo (ainda que não seja necessário resgatar créditos)
    if (licenseKey === MASTER_KEY) {
      await ensureMasterLicenseRecord().catch(() => {});
    }

    const license = await prisma.licenseKey.findUnique({ where: { key: licenseKey } });
    if (!license || license.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Licença inválida ou inativa' });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const voucher = await tx.topupCode.findUnique({ where: { code } });
      if (!voucher) {
        throw new Error('Código inválido');
      }

      if (voucher.status !== 'ACTIVE') {
        throw new Error('Código já utilizado ou inativo');
      }

      if (voucher.expiresAt && voucher.expiresAt.getTime() < now.getTime()) {
        // marcar como expirado (best-effort)
        await tx.topupCode.update({ where: { code }, data: { status: 'EXPIRED' } });
        throw new Error('Código expirado');
      }

      // marca como resgatado de forma "atomic-ish" (evita duplo resgate)
      const updated = await tx.topupCode.updateMany({
        where: { code, status: 'ACTIVE' },
        data: {
          status: 'REDEEMED',
          redeemedAt: now,
          redeemedByKey: license.key,
        }
      });

      if (!updated || updated.count === 0) {
        throw new Error('Código já utilizado');
      }

      const updatedLicense = await tx.licenseKey.update({
        where: { id: license.id },
        data: { aiCredits: { increment: voucher.credits } }
      });

      return {
        added: voucher.credits,
        aiCredits: updatedLicense.aiCredits,
        code: voucher.code,
      };
    });

    // Compatibilidade: alguns clientes/UI esperam `creditsTotal/creditsAdded`
    // enquanto versões anteriores retornavam `aiCredits/added`.
    res.json({
      ok: true,
      code: result.code,
      // novos nomes (UI)
      creditsAdded: result.added,
      creditsTotal: result.aiCredits,
      // nomes legados
      added: result.added,
      aiCredits: result.aiCredits,
    });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Erro ao resgatar código' });
  }
});

module.exports = { router };
