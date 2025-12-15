const Flow = require('./models/Flow');
const FlowExecution = require('./models/FlowExecution');
const FlowLog = require('./models/FlowLog');

const { FlowEngine } = require('./engine');
const EventDispatcher = require('./services/EventDispatcher');
const QueueService = require('./services/QueueService');
const CronScheduler = require('./services/CronScheduler');
const NoResponseScheduler = require('./services/NoResponseScheduler');

const { validateFlow, flowSchema } = require('./schemas/flowSchema');
const constants = require('./constants/flowConstants');
const IdGenerator = require('./utils/idGenerator');
const { buildFlowsApi } = require('./api');

function createFlowSystem(options = {}) {
  const logger = options.logger || console;

  // Queue (Bull) opcional
  const delayQueue = options.delayQueue || null;

  const engine = new FlowEngine({
    logger,
    delayQueue,
    maxConcurrentExecutions: options.maxConcurrentExecutions || 100,
    enableLogs: options.enableLogs !== false,
    logLevel: options.logLevel || 'info',
  });

  if (options.actionHandlers) engine.registerActionHandlers(options.actionHandlers);

  const dispatcher = new EventDispatcher({ flowEngine: engine, logger });

  const cronScheduler = options.enableCron
    ? new CronScheduler({ eventDispatcher: dispatcher, contactService: options.contactService, logger })
    : null;

  const noResponseScheduler = options.enableNoResponse
    ? new NoResponseScheduler({
        eventDispatcher: dispatcher,
        contactService: options.contactService,
        messageService: options.messageService,
        logger,
      })
    : null;

  return {
    engine,
    dispatcher,
    cronScheduler,
    noResponseScheduler,

    models: { Flow, FlowExecution, FlowLog },
    validateFlow,
    flowSchema,
    constants,
    IdGenerator,

    buildApi: ({ authMiddleware }) => buildFlowsApi({ authMiddleware, eventDispatcher: dispatcher, cronScheduler }),
  };
}

module.exports = {
  createFlowSystem,
  Flow,
  FlowExecution,
  FlowLog,
  validateFlow,
  flowSchema,
  ...constants,
  IdGenerator,
};