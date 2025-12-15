const createFlowRoutes = require('./routes/flowRoutes');
const createWebhookRoutes = require('./routes/webhookRoutes');

const FlowController = require('./controllers/FlowController');
const WebhookController = require('./controllers/WebhookController');

function buildFlowsApi({ authMiddleware, eventDispatcher, cronScheduler }) {
  const flowController = new FlowController({ eventDispatcher, cronScheduler });
  const webhookController = new WebhookController({ eventDispatcher });

  return {
    flowRoutes: createFlowRoutes({ controller: flowController, authMiddleware }),
    webhookRoutes: createWebhookRoutes({ controller: webhookController }),
  };
}

module.exports = { buildFlowsApi };
