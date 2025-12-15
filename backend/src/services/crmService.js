const prisma = require("../prisma");

function normalizeDeal(deal) {
  if (!deal) return deal;
  // Prisma retorna `tags` como join (DealTag) com a entidade Tag em `tag`.
  // Para o frontend, normalizamos para um array simples de Tags ({id,name,color}).
  if (!Array.isArray(deal.tags)) {
    return deal;
  }

  const flatTags = deal.tags
    .map((t) => (t && t.tag ? t.tag : t))
    .filter(Boolean)
    .map((t) => ({ id: t.id, name: t.name, color: t.color }));

  return { ...deal, tags: flatTags };
}

/**
 * Normaliza o payload de tags para um array, preservando a semântica:
 * - undefined => não mexe nas tags
 * - null => limpa tags
 * - string/object => trata como 1 tag
 * - array => usa como está
 */
function normalizeTagsPayload(tagsInput) {
  if (tagsInput === undefined) return undefined;
  if (tagsInput === null) return [];
  if (Array.isArray(tagsInput)) return tagsInput;
  return [tagsInput];
}

async function replaceDealTags(db, dealId, tagsInput) {
  const tagsArr = normalizeTagsPayload(tagsInput);
  if (tagsArr === undefined) return;

  // Sempre limpa vínculos anteriores quando o cliente envia `tags`
  await db.dealTag.deleteMany({ where: { dealId } });

  const normalized = tagsArr
    .map((t) => {
      if (!t) return null;
      if (typeof t === "string") {
        const name = t.trim();
        return name ? { name, color: null } : null;
      }
      if (typeof t === "object") {
        const name = (t.name || t.label || t.tagName || "").toString().trim();
        const color = (t.color || t.hexColor || "").toString().trim() || null;
        return name ? { name, color } : null;
      }
      return null;
    })
    .filter(Boolean);

  if (normalized.length === 0) return;

  // vincula tags pelo nome (cria se não existir) - usando upsert (race-safe)
  const tagRecords = await Promise.all(
    normalized.map(async ({ name, color }) => {
      const finalColor = color || "#ffc107";
      return db.tag.upsert({
        where: { name },
        update: color ? { color: finalColor } : {},
        create: { name, color: finalColor },
      });
    })
  );

  await db.dealTag.createMany({
    data: tagRecords.map((t) => ({ dealId, tagId: t.id })),
    skipDuplicates: true,
  });
}

async function upsertDeal(data) {
  const { externalId, name, phone, stage, notes, tags } = data || {};

  if (!externalId) {
    throw new Error("externalId é obrigatório");
  }

  const deal = await prisma.deal.upsert({
    where: { externalId },
    update: {
      name,
      phone,
      stage,
      notes,
    },
    create: {
      externalId,
      name,
      phone,
      stage,
      notes,
    },
  });

  await replaceDealTags(prisma, deal.id, tags);

  const fullDeal = await prisma.deal.findUnique({
    where: { id: deal.id },
    include: { tags: { include: { tag: true } }, tasks: true },
  });

  return normalizeDeal(fullDeal);
}

async function listDeals() {
  const deals = await prisma.deal.findMany({
    orderBy: { updatedAt: "desc" },
    include: { tags: { include: { tag: true } } },
  });
  return deals.map(normalizeDeal);
}

/**
 * Atualiza um deal por id.
 * Importante: `tags` pode vir no payload (inclusive vazio) e deve substituir
 * os vínculos no banco (permite remover TODAS as tags via PATCH).
 */
async function updateDeal(id, data) {
  if (!id) throw new Error("id é obrigatório");

  const payload = data && typeof data === "object" ? data : {};
  const has = Object.prototype.hasOwnProperty;

  // Só permitimos campos que fazem sentido para update do deal
  const updateData = {};
  if (has.call(payload, "name") && payload.name !== undefined) updateData.name = payload.name;
  if (has.call(payload, "phone") && payload.phone !== undefined) updateData.phone = payload.phone;
  if (has.call(payload, "stage") && payload.stage !== undefined) updateData.stage = payload.stage;
  if (has.call(payload, "notes") && payload.notes !== undefined) updateData.notes = payload.notes;
  if (has.call(payload, "status") && payload.status !== undefined) updateData.status = payload.status;

  const tagsProvided = has.call(payload, "tags");
  const tagsInput = tagsProvided ? payload.tags : undefined;

  const fullDeal = await prisma.$transaction(async (tx) => {
    // Se não há campos escalares para atualizar, ainda assim garantimos que o deal existe.
    if (Object.keys(updateData).length > 0) {
      await tx.deal.update({
        where: { id },
        data: updateData,
      });
    } else {
      const exists = await tx.deal.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new Error("Deal não encontrado");
    }

    // Atualiza tags somente quando o cliente enviou explicitamente o campo `tags`
    if (tagsProvided) {
      await replaceDealTags(tx, id, tagsInput);

      // Toca o deal para atualizar `updatedAt` quando apenas as tags mudam
      if (Object.keys(updateData).length === 0) {
        await tx.deal.update({ where: { id }, data: { updatedAt: new Date() } });
      }
    }

    const out = await tx.deal.findUnique({
      where: { id },
      include: { tags: { include: { tag: true } }, tasks: true },
    });

    return out;
  });

  return normalizeDeal(fullDeal);
}

async function findDealByExternalId(externalId) {
  const deal = await prisma.deal.findUnique({
    where: { externalId },
    include: { tags: { include: { tag: true } }, tasks: true },
  });
  return normalizeDeal(deal);
}

module.exports = {
  upsertDeal,
  listDeals,
  updateDeal,
  findDealByExternalId,
  prisma,
};
