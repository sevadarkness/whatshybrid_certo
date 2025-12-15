
const express = require("express");
const router = express.Router();
const { validateLicense, issueLicense } = require("../services/licenseService");

/**
 * Endpoint chamado pela extensão para validar uma chave de acesso.
 * body: { key: string, clientId: string }
 */
router.post("/validate", async (req, res) => {
  try {
    const { key, clientId } = req.body || {};
    const result = await validateLicense({ key, clientId });
    res.json(result);
  } catch (e) {
    console.error("Erro em /license/validate:", e);
    res.status(500).json({ valid: false, message: "Erro interno ao validar licença." });
  }
});

/**
 * Endpoint opcional para emissão de licenças pelo painel / site.
 * Em um ambiente de produção, deve ser protegido por autenticação própria (JWT, API key, etc).
 */
router.post("/issue", async (req, res) => {
  try {
    // Segurança (versão paga): por padrão, exige ADMIN_TOKEN.
    // Para liberar em ambiente de testes, defina ALLOW_PUBLIC_LICENSE_ISSUE=true
    const allowPublic = (process.env.ALLOW_PUBLIC_LICENSE_ISSUE || "").toString().toLowerCase() === "true";
    if (!allowPublic) {
      const adminToken = (process.env.ADMIN_TOKEN || "").toString();
      const provided = (req.headers["x-admin-token"] || "").toString();

      if (!adminToken) {
        return res.status(500).json({ error: "ADMIN_TOKEN não configurado no servidor" });
      }

      if (provided !== adminToken) {
        return res.status(401).json({ error: "x-admin-token inválido" });
      }
    }

    const { email, plan, trial, trialDays } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "Email é obrigatório para emitir licença." });
    }
    const license = await issueLicense({ email, plan, trial, trialDays });
    res.json({ key: license.key, plan: license.plan, trial: license.trial, trialEndsAt: license.trialEndsAt });
  } catch (e) {
    console.error("Erro em /license/issue:", e);
    res.status(500).json({ error: "Erro interno ao emitir licença." });
  }
});

module.exports = {
  router
};
