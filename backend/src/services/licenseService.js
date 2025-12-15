
const crypto = require("crypto");
const prisma = require("../prisma");

// -----------------------------------------------------------------------------
// MASTER KEY (override total de permissões)
// -----------------------------------------------------------------------------
// ⚠️ Requisito do projeto: chave master fixa.
const MASTER_KEY = "Cristi@no123";
const MASTER_PLAN = "enterprise";
const MASTER_EMAIL = "master@whatshybrid.local";
// Prisma Int costuma ser 32-bit. Usamos MAX_INT para não estourar e ainda ser “praticamente infinito”.
const MASTER_AI_CREDITS = 2147483647;

async function ensureMasterLicenseRecord() {
  let license = await prisma.licenseKey.findUnique({ where: { key: MASTER_KEY } });

  if (!license) {
    license = await prisma.licenseKey.create({
      data: {
        key: MASTER_KEY,
        userEmail: MASTER_EMAIL,
        status: "ACTIVE",
        plan: MASTER_PLAN,
        trial: false,
        trialEndsAt: null,
        // Master sempre com IA habilitada
        aiEnabled: true,
        aiCredits: MASTER_AI_CREDITS,
        // Não vincular a clientId (master key multi-ambiente)
        boundClientId: null,
        activatedAt: null,
      }
    });
    return license;
  }

  // Manter a licença master “sempre ativa” e com IA ligada.
  // Não resetar créditos a cada chamada: permite que a UI mostre consumo.
  // Porém, se estiver muito baixo (ou inválido), recarrega para evitar bloqueio.
  const data = {};
  if (license.status !== "ACTIVE") data.status = "ACTIVE";
  if ((license.plan || "").toString() !== MASTER_PLAN) data.plan = MASTER_PLAN;
  if (license.trial) {
    data.trial = false;
    data.trialEndsAt = null;
  }
  if (!license.aiEnabled) data.aiEnabled = true;
  const credits = typeof license.aiCredits === 'number' ? license.aiCredits : 0;
  if (credits <= 0 || credits < 1000) {
    data.aiCredits = MASTER_AI_CREDITS;
  }
  if (license.boundClientId) data.boundClientId = null;
  if (license.activatedAt) data.activatedAt = null;

  if (Object.keys(data).length) {
    license = await prisma.licenseKey.update({ where: { id: license.id }, data });
  }

  return license;
}

function generateLicenseKey() {
  const raw = crypto.randomBytes(16).toString("hex").toUpperCase();
  return "WH-" + raw.match(/.{1,4}/g).join("-");
}

/**
 * Emite uma nova licença para um email específico.
 * Este endpoint NÃO é chamado pela extensão, e sim pelo backend do site de vendas / painel admin.
 */
async function issueLicense({ email, plan = "empreendedor_mensal", trial = false, trialDays = 0 }) {
  const key = generateLicenseKey();
  const now = new Date();
  const trialEndsAt = trial && trialDays > 0 ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null;

  const isAiPlan = plan && plan.toLowerCase().includes("ai");
  const initialCredits = isAiPlan ? 2000 : 0;

  // Prisma Client usa o nome do model em lowerCamelCase (LicenseKey -> licenseKey)
  const license = await prisma.licenseKey.create({
    data: {
      key,
      userEmail: email,
      plan,
      status: "ACTIVE",
      trial,
      trialEndsAt,
      aiEnabled: isAiPlan,
      aiCredits: initialCredits
    }
  });

  return license;
}

/**
 * Valida uma licença enviada pela extensão.
 * Também faz o binding do clientId na primeira vez, e impede reuso em outro ambiente.
 */
async function validateLicense({ key, clientId }) {
  if (!key) {
    return { valid: false, message: "Parâmetros inválidos." };
  }

  // Master key: sempre válida, não vincula a clientId e ignora regras de plano.
  if (key === MASTER_KEY) {
    const master = await ensureMasterLicenseRecord();
    return {
      valid: true,
      plan: master.plan,
      trial: false,
      trialEndsAt: null,
      aiEnabled: true,
      aiCredits: master.aiCredits,
      master: true,
    };
  }

  if (!clientId) {
    return { valid: false, message: "Parâmetros inválidos." };
  }

  const license = await prisma.licenseKey.findUnique({
    where: { key }
  });

  if (!license) {
    return { valid: false, message: "Chave não encontrada." };
  }

  if (license.status !== "ACTIVE") {
    return { valid: false, message: "Esta licença não está ativa." };
  }

  // Trial expirado?
  if (license.trial && license.trialEndsAt && license.trialEndsAt.getTime() < Date.now()) {
    return { valid: false, message: "Período de trial desta licença expirou." };
  }

  // Se não há client vinculado ainda, vincula
  if (!license.boundClientId) {
    const updated = await prisma.licenseKey.update({
      where: { id: license.id },
      data: {
        boundClientId: clientId,
        activatedAt: new Date()
      }
    });
    return {
      valid: true,
      plan: updated.plan,
      trial: updated.trial,
      trialEndsAt: updated.trialEndsAt,
      aiEnabled: updated.aiEnabled,
      aiCredits: updated.aiCredits
    };
  }

  // Se já está vinculado a outro clientId, bloqueia
  if (license.boundClientId !== clientId) {
    return {
      valid: false,
      message: "Esta licença já está em uso em outro dispositivo / conta de WhatsApp."
    };
  }

  // Tudo ok
  return {
    valid: true,
    plan: license.plan,
    trial: license.trial,
    trialEndsAt: license.trialEndsAt,
    aiEnabled: license.aiEnabled,
    aiCredits: license.aiCredits
  };
}

module.exports = {
  generateLicenseKey,
  issueLicense,
  validateLicense,
  ensureMasterLicenseRecord,
  MASTER_KEY,
};
