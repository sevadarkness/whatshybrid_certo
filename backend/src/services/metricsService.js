const prisma = require("../prisma");

async function getSummary() {
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    dealsCount,
    openTasksCount,
    campaignsCount,
    last7DaysEvents,
    dealsByStageRaw,
    tasksByStatusRaw,
    campaignsByStatusRaw,
    eventsLast7Raw
  ] = await Promise.all([
    prisma.deal.count(),
    prisma.task.count({ where: { status: "OPEN" } }),
    prisma.campaign.count(),
    prisma.messageEvent.count({
      where: {
        createdAt: {
          gte: last7
        }
      }
    }),
    prisma.deal.groupBy({
      by: ["stage"],
      _count: { _all: true }
    }),
    prisma.task.groupBy({
      by: ["status"],
      _count: { _all: true }
    }),
    prisma.campaign.groupBy({
      by: ["status"],
      _count: { _all: true }
    }),
    prisma.messageEvent.findMany({
      where: {
        createdAt: {
          gte: last7
        }
      },
      select: {
        id: true,
        createdAt: true
      }
    })
  ]);

  const dealsByStage = dealsByStageRaw
    .map((d) => ({
      stage: d.stage || "Sem estágio",
      count: d._count._all
    }))
    .sort((a, b) => b.count - a.count);

  const tasksByStatus = tasksByStatusRaw
    .map((t) => ({
      status: t.status || "SEM_STATUS",
      count: t._count._all
    }))
    .sort((a, b) => b.count - a.count);

  const campaignsByStatus = campaignsByStatusRaw
    .map((c) => ({
      status: c.status || "SEM_STATUS",
      count: c._count._all
    }))
    .sort((a, b) => b.count - a.count);

  const eventsPerDay = {};
  for (const ev of eventsLast7Raw) {
    const dayKey = ev.createdAt.toISOString().slice(0, 10);
    eventsPerDay[dayKey] = (eventsPerDay[dayKey] || 0) + 1;
  }

  const eventsLast7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    eventsLast7Days.push({
      date: key,
      count: eventsPerDay[key] || 0
    });
  }

  return {
    dealsCount,
    openTasksCount,
    campaignsCount,
    last7DaysEvents,
    charts: {
      dealsByStage,
      tasksByStatus,
      campaignsByStatus,
      eventsLast7Days
    }
  };
}

module.exports = { getSummary };
