/**
 * WhatsHybrid Backend (FULL MODE)
 *
 * This repository contains:
 * 1) Legacy APIs used by the browser extension (Prisma/SQLite)
 * 2) v2 APIs (Mongo/Redis/advanced modules) added from the provided `.txt`
 *
 * In FULL MODE we keep legacy endpoints working, and we ALSO mount the v2 API
 * under `/api/v2`.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const pino = require('pino');
const pinoHttp = require('pino-http');

const { setupUncaughtHandlers, errorMiddleware, notFoundMiddleware } = require('./shared/errors/errorMiddleware');

// Legacy routers (extension)
const { router: licenseRouter } = require('./routes/license');
const { router: crmRouter } = require('./routes/crm');
const { router: aiRouter } = require('./routes/ai');
const { router: campaignsRouter } = require('./routes/campaigns');
const { router: eventsRouter } = require('./routes/events');
const { router: tasksRouter } = require('./routes/tasks');
const { router: usersRouter } = require('./routes/users');
const { router: metricsRouter } = require('./routes/metrics');
const { router: billingRouter } = require('./routes/billing');
const { router: flowsRouter } = require('./routes/flows');
const { router: adminRouter } = require('./routes/admin');

const { startCampaignWorker } = require('./workers/campaignWorker');

// AI Training (autotrain)
const prisma = require('./prisma');
const aiTraining = require('./services/aiTrainingService');


// v2 router + modules
const v2Router = require('./api/routes');
const { connectDB } = require('./config/database');

const HealthCheck = require('./infra/health/HealthCheck');
const CacheManager = require('./infra/cache/CacheManager');
const FeatureFlagManager = require('./infra/feature-flags/Flags');
const QueueManager = require('./infra/queue/QueueManager');

// v2 auth middleware (used by flows v2 API)
const { authenticate, requireWorkspace } = require('./team/middlewares/authenticate');

// Flows engine (advanced)
const { createFlowSystem } = require('./flows');
const { buildDefaultActionHandlers } = require('./flows/actionHandlers/defaultActionHandlers');
const FlowMessageService = require('./flows/services/FlowMessageService');
const FlowContactService = require('./flows/services/FlowContactService');

setupUncaughtHandlers();

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

async function bootstrap() {
  // --- External services (Mongo/Redis)
  await connectDB();

  // --- Infra modules (safe: they will degrade gracefully if Redis isn't available)
  const flags = new FeatureFlagManager();
  const cache = new CacheManager();
  const queue = new QueueManager();
  await Promise.all([
    flags.initialize().catch((e) => logger.warn({ err: e?.message }, 'Feature flags init failed')),
    cache.initialize().catch((e) => logger.warn({ err: e?.message }, 'Cache init failed')),
    queue.initialize().catch((e) => logger.warn({ err: e?.message }, 'Queue init failed')),
  ]);

  // --- Express
  const app = express();

  app.disable('x-powered-by');

  // Request id for logs / errorMiddleware
  app.use((req, _res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    next();
  });

  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Capture raw body (Stripe webhooks use req.rawBody)
  const jsonLimit = process.env.JSON_LIMIT || '10mb';
  app.use(
    express.json({
      limit: jsonLimit,
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: jsonLimit }));

  // HTTP request logging
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    })
  );

  // Expose infra modules
  app.locals.flags = flags;
  app.locals.cache = cache;
  app.locals.queue = queue;

  // Health
  app.get('/health', (_req, res) => res.json({ ok: true, mode: 'full', ts: new Date().toISOString() }));

  // Public legacy route(s)
  app.use('/license', licenseRouter);

  // ---------------------------------------------------------------------------
  // Legacy extension protection (x-extension-key)
  // ---------------------------------------------------------------------------
  const expectedSharedKey = (process.env.EXTENSION_SHARED_KEY || '').trim();

  // In FULL MODE, v2 is authenticated by JWT and MUST NOT be blocked by the extension key.
  const isPublic = (path) =>
    path === '/health' ||
    path.startsWith('/license') ||
    path.startsWith('/api/v2/billing/webhook') ||
    path.startsWith('/api/v2/health');

  app.use((req, res, next) => {
    if (!expectedSharedKey) return next(); // dev-friendly
    if (isPublic(req.path)) return next();
    if (req.path.startsWith('/api/v2')) return next();

    const provided = (req.headers['x-extension-key'] || '').toString().trim();
    if (provided !== expectedSharedKey) {
      return res.status(401).json({ error: 'invalid extension key' });
    }
    return next();
  });

  // ---------------------------------------------------------------------------
  // Legacy APIs (used by the extension)
  // ---------------------------------------------------------------------------
  app.use('/crm', crmRouter);
  app.use('/ai', aiRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/campaigns', campaignsRouter);
  app.use('/events', eventsRouter);
  app.use('/tasks', tasksRouter);
  app.use('/users', usersRouter);
  app.use('/metrics', metricsRouter);
  app.use('/billing', billingRouter);
  app.use('/flows', flowsRouter);
  app.use('/admin', adminRouter);

  // ---------------------------------------------------------------------------
  // v2 API (advanced modules) - mounted under /api/v2
  // ---------------------------------------------------------------------------
  app.use('/api/v2', v2Router);

  // v2 health
  const healthCheck = new HealthCheck();
  app.get('/api/v2/health', async (_req, res) => {
    const status = await healthCheck.checkHealth();
    res.status(status.ok ? 200 : 503).json(status);
  });

  // v2 flows API (advanced)
  try {
    const flowSystem = createFlowSystem({
      logger,
      contactService: new FlowContactService(),
      messageService: new FlowMessageService(),
      actionHandlers: buildDefaultActionHandlers({ logger }),
      enableCron: true,
      enableNoResponse: true,
    });

    // Start schedulers
    flowSystem.start();

    // Build router
    const flowsApi = flowSystem.buildApi({ authMiddleware: [authenticate, requireWorkspace] });
    app.use('/api/v2', flowsApi);
    logger.info('✅ Flows (v2) enabled at /api/v2/flows');
  } catch (e) {
    logger.warn({ err: e?.message }, 'Flows (v2) not initialized');
  }

  // 404 + errors
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  // ---------------------------------------------------------------------------
  // HTTP + Socket.io
  // ---------------------------------------------------------------------------
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });
  app.set('io', io);

  // Start background workers
  try {
    startCampaignWorker(io);
  } catch (e) {
    logger.warn({ err: e?.message }, 'Campaign worker failed to start');
  }



  // ---------------------------------------------------------------------------
  // AI Auto-Train (opcional) — gera sugestões a partir do histórico
  // ---------------------------------------------------------------------------
  // - Desligado por padrão (por licença).
  // - Consome 2 créditos por execução.
  // - Segurança: se falhar, não quebra o backend.
  const AUTOTRAIN_INTERVAL_MS = Number(process.env.AI_AUTOTRAIN_INTERVAL_MS || 6 * 60 * 60 * 1000); // 6h
  const AUTOTRAIN_COST = 2;

  async function runAutoTrainOnce() {
    try {
      const licenses = await prisma.licenseKey.findMany({
        where: { status: 'ACTIVE', aiEnabled: true }
      });

      for (const lic of (licenses || [])) {
        try {
          const enabled = await aiTraining.getSettingValue(`ai_autotrain_enabled::${lic.key}`);
          if (String(enabled || 'false') !== 'true') continue;

          // Reserva créditos (best-effort). Se não tiver, pula.
          const updated = await prisma.licenseKey.updateMany({
            where: {
              id: lic.id,
              status: 'ACTIVE',
              aiEnabled: true,
              aiCredits: { gte: AUTOTRAIN_COST }
            },
            data: { aiCredits: { decrement: AUTOTRAIN_COST } }
          });
          if (!updated || updated.count === 0) continue;

          const lastRun = await aiTraining.getSettingValue(`ai_autotrain_last_run::${lic.key}`);

          await aiTraining.generateSuggestionsFromHistory(lic.key, {
            limit: 40,
            sinceISO: lastRun || null
          });

          await aiTraining.setAutoTrainLastRun(lic.key, new Date().toISOString());

          logger.info({ license: lic.key }, 'AI autotrain executed');
        } catch (e) {
          logger.warn({ err: e?.message, license: lic?.key }, 'AI autotrain failed for a license');
        }
      }
    } catch (e) {
      logger.warn({ err: e?.message }, 'AI autotrain loop failed');
    }
  }

  // Intervalo — roda em background
  setInterval(() => {
    runAutoTrainOnce();
  }, AUTOTRAIN_INTERVAL_MS);

  server.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST, mode: 'full' }, '🚀 Backend running');
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
