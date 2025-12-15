const prisma = require("../prisma");

async function listTasks() {
  const tasks = await prisma.task.findMany({
    orderBy: { dueAt: "asc" },
    include: {
      deal: true,
      assignee: true,
    },
  });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    dueAt: t.dueAt,
    dealId: t.dealId,
    dealName: t.deal ? t.deal.name : null,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee ? t.assignee.name : null,
  }));
}

async function createTask(data) {
  const { title, description, dealId, dealExternalId, assigneeId, dueAt } = data;
  if (!title) throw new Error("title é obrigatório");
  if (!dealId && !dealExternalId) throw new Error("dealId ou dealExternalId obrigatório");

  let finalDealId = dealId;
  if (!finalDealId && dealExternalId) {
    const deal = await prisma.deal.findUnique({ where: { externalId: dealExternalId } });
    if (!deal) throw new Error("deal não encontrado pelo externalId");
    finalDealId = deal.id;
  }

  const task = await prisma.task.create({
    data: {
      title,
      description,
      status: "OPEN",
      dealId: finalDealId,
      assigneeId: assigneeId || null,
      dueAt: dueAt ? new Date(dueAt) : null,
    },
  });
  return task;
}

async function listDueSoon(minutesAhead = 10) {
  const now = new Date();
  const future = new Date(now.getTime() + minutesAhead * 60000);
  const tasks = await prisma.task.findMany({
    where: {
      status: "OPEN",
      dueAt: {
        gte: now,
        lte: future,
      },
    },
    include: {
      deal: true,
    },
  });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    dueAt: t.dueAt,
    dealName: t.deal ? t.deal.name : null,
  }));
}

module.exports = {
  listTasks,
  createTask,
  listDueSoon,
};
