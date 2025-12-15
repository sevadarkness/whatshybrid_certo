const Joi = require('joi');
const {
  TRIGGER_TYPES,
  ACTION_TYPES,
  STEP_TYPES,
  CONDITION_OPERATORS,
  DELAY_UNITS,
  CAMPAIGN_EVENTS,
  FLOW_LIMITS,
} = require('../constants/flowConstants');

const stringId = Joi.string().min(3).max(120);

const triggerMessageReceived = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.MESSAGE_RECEIVED).required(),
  config: Joi.object({
    fromAnyContact: Joi.boolean().default(true),
    fromContactIds: Joi.array().items(stringId).optional(),
    fromStages: Joi.array().items(Joi.string()).optional(),
    fromTags: Joi.array().items(Joi.string()).optional(),
    excludeTags: Joi.array().items(Joi.string()).optional(),
    messageTypes: Joi.array()
      .items(Joi.string().valid('text', 'image', 'video', 'audio', 'document', 'sticker', 'location'))
      .default(['text']),
  }).default({}),
});

const triggerKeywordMatch = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.KEYWORD_MATCH).required(),
  config: Joi.object({
    keywords: Joi.array().items(Joi.string().min(1).max(120)).min(1).required(),
    matchMode: Joi.string().valid('exact', 'contains', 'starts_with', 'ends_with', 'regex', 'word').default('contains'),
    caseSensitive: Joi.boolean().default(false),
    fromStages: Joi.array().items(Joi.string()).optional(),
    fromTags: Joi.array().items(Joi.string()).optional(),
  }).required(),
});

const triggerNoResponseTimeout = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.NO_RESPONSE_TIMEOUT).required(),
  config: Joi.object({
    timeout: Joi.number().min(1).required(),
    timeoutUnit: Joi.string().valid(...Object.values(DELAY_UNITS)).default(DELAY_UNITS.HOURS),
    fromStages: Joi.array().items(Joi.string()).optional(),
    onlyIfLastMessageFromUs: Joi.boolean().default(true),
  }).required(),
});

const triggerStageChanged = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.STAGE_CHANGED).required(),
  config: Joi.object({
    fromStage: Joi.string().optional().allow(null),
    toStage: Joi.string().required(),
    includeManualChanges: Joi.boolean().default(true),
    includeAutomatedChanges: Joi.boolean().default(true),
  }).required(),
});

const triggerTagAdded = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.TAG_ADDED).required(),
  config: Joi.object({
    tagIds: Joi.array().items(Joi.string().min(1)).min(1).required(),
    matchMode: Joi.string().valid('any', 'all').default('any'),
  }).required(),
});

const triggerTagRemoved = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.TAG_REMOVED).required(),
  config: Joi.object({
    tagIds: Joi.array().items(Joi.string().min(1)).min(1).required(),
    matchMode: Joi.string().valid('any', 'all').default('any'),
  }).required(),
});

const triggerCampaignEvent = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.CAMPAIGN_EVENT).required(),
  config: Joi.object({
    event: Joi.string().valid(...Object.values(CAMPAIGN_EVENTS)).required(),
    campaignIds: Joi.array().items(stringId).optional(),
  }).required(),
});

const triggerContactCreated = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.CONTACT_CREATED).required(),
  config: Joi.object({
    source: Joi.string().valid('manual', 'import', 'whatsapp', 'api', 'any').default('any'),
  }).default({}),
});

const triggerWebhookReceived = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.WEBHOOK_RECEIVED).required(),
  config: Joi.object({
    webhookId: Joi.string().required(),
    validatePayload: Joi.boolean().default(false),
    payloadSchema: Joi.object().unknown(true).optional(),
  }).required(),
});

const triggerScheduled = Joi.object({
  type: Joi.string().valid(TRIGGER_TYPES.SCHEDULED).required(),
  config: Joi.object({
    cron: Joi.string().required(),
    timezone: Joi.string().default('America/Sao_Paulo'),
    filterContacts: Joi.object({
      stages: Joi.array().items(Joi.string()).optional(),
      tags: Joi.array().items(Joi.string()).optional(),
      excludeTags: Joi.array().items(Joi.string()).optional(),
    }).optional(),
  }).required(),
});

const triggerSchema = Joi.alternatives().try(
  triggerMessageReceived,
  triggerKeywordMatch,
  triggerNoResponseTimeout,
  triggerStageChanged,
  triggerTagAdded,
  triggerTagRemoved,
  triggerCampaignEvent,
  triggerContactCreated,
  triggerWebhookReceived,
  triggerScheduled
);

const actionSendMessage = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.SEND_MESSAGE).required(),
  config: Joi.object({
    message: Joi.string().max(4096).required(),
    parseVariables: Joi.boolean().default(true),
    simulateTyping: Joi.boolean().default(true),
    typingDuration: Joi.number().min(0).max(10000).default(1500),
  }).required(),
});

const actionSendMedia = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.SEND_MEDIA).required(),
  config: Joi.object({
    mediaType: Joi.string().valid('image', 'video', 'audio', 'document').required(),
    mediaUrl: Joi.string().uri().optional(),
    mediaId: Joi.string().optional(),
    caption: Joi.string().max(1024).optional(),
    filename: Joi.string().max(160).optional(),
    parseVariables: Joi.boolean().default(true),
  }).required(),
});

const actionAddTag = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.ADD_TAG).required(),
  config: Joi.object({ tagIds: Joi.array().items(Joi.string()).min(1).required() }).required(),
});

const actionRemoveTag = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.REMOVE_TAG).required(),
  config: Joi.object({ tagIds: Joi.array().items(Joi.string()).min(1).required() }).required(),
});

const actionMoveStage = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.MOVE_STAGE).required(),
  config: Joi.object({
    stageId: Joi.string().required(),
    reason: Joi.string().max(200).optional(),
  }).required(),
});

const actionCallWebhook = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.CALL_WEBHOOK).required(),
  config: Joi.object({
    url: Joi.string().uri().required(),
    method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').default('POST'),
    headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    body: Joi.alternatives().try(Joi.object().unknown(true), Joi.string()).optional(),
    bodyTemplate: Joi.string().optional(),
    timeout: Joi.number().min(1000).max(FLOW_LIMITS.MAX_WEBHOOK_TIMEOUT_MS).default(10000),
    retries: Joi.number().min(0).max(3).default(1),
    saveResponseAs: Joi.string().optional(),
  }).required(),
});

const actionCallAI = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.CALL_AI).required(),
  config: Joi.object({
    prompt: Joi.string().max(4096).optional(),
    systemPrompt: Joi.string().max(4096).optional(),
    model: Joi.string().optional(),
    temperature: Joi.number().min(0).max(2).default(0.7),
    maxTokens: Joi.number().min(1).max(4096).default(500),
    saveResponseAs: Joi.string().default('aiResponse'),
    sendResponse: Joi.boolean().default(true),
    context: Joi.object({
      includeContactInfo: Joi.boolean().default(true),
      includeRecentMessages: Joi.number().min(0).max(20).default(5),
      customContext: Joi.string().max(2000).optional(),
    }).optional(),
  }).required(),
});

const actionSetVariable = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.SET_VARIABLE).required(),
  config: Joi.object({
    variableName: Joi.string().min(1).max(120).required(),
    value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean(), Joi.object().unknown(true)).required(),
    scope: Joi.string().valid('execution', 'contact', 'global').default('execution'),
  }).required(),
});

const actionWaitDelay = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.WAIT_DELAY).required(),
  config: Joi.object({
    duration: Joi.number().min(1).required(),
    unit: Joi.string().valid(...Object.values(DELAY_UNITS)).default(DELAY_UNITS.SECONDS),
    maxWaitSeconds: Joi.number().min(1).optional(),
  }).required(),
});

const conditionRule = Joi.object({
  field: Joi.string().required(),
  operator: Joi.string().valid(...Object.values(CONDITION_OPERATORS)).required(),
  value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean(), Joi.array()).optional(),
});

const conditionGroup = Joi.object({
  logic: Joi.string().valid('and', 'or').default('and'),
  rules: Joi.array()
    .items(Joi.alternatives().try(conditionRule, Joi.lazy(() => conditionGroup)))
    .min(1)
    .required(),
});

const actionCondition = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.CONDITION).required(),
  config: Joi.object({
    conditions: conditionGroup.required(),
    onTrue: Joi.object({
      goToStep: Joi.string().optional(),
      executeSteps: Joi.array().items(Joi.string()).optional(),
    }).required(),
    onFalse: Joi.object({
      goToStep: Joi.string().optional(),
      executeSteps: Joi.array().items(Joi.string()).optional(),
      endFlow: Joi.boolean().default(false),
    }).optional(),
  }).required(),
});

const actionGoToStep = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.GO_TO_STEP).required(),
  config: Joi.object({
    stepId: Joi.string().required(),
    maxJumps: Joi.number().min(1).max(FLOW_LIMITS.MAX_LOOP_ITERATIONS).default(3),
  }).required(),
});

const actionEndFlow = Joi.object({
  type: Joi.string().valid(ACTION_TYPES.END_FLOW).required(),
  config: Joi.object({
    reason: Joi.string().max(200).optional(),
    status: Joi.string().valid('completed', 'cancelled').default('completed'),
  }).default({}),
});

const actionSchema = Joi.alternatives().try(
  actionSendMessage,
  actionSendMedia,
  actionAddTag,
  actionRemoveTag,
  actionMoveStage,
  actionCallWebhook,
  actionCallAI,
  actionSetVariable,
  actionWaitDelay,
  actionCondition,
  actionGoToStep,
  actionEndFlow
);

const stepSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().max(100).required(),
  description: Joi.string().max(500).optional(),
  type: Joi.string().valid(...Object.values(STEP_TYPES)).required(),
  enabled: Joi.boolean().default(true),

  trigger: triggerSchema.when('type', { is: STEP_TYPES.TRIGGER, then: Joi.required(), otherwise: Joi.forbidden() }),
  action: actionSchema.when('type', { is: STEP_TYPES.ACTION, then: Joi.required(), otherwise: Joi.forbidden() }),

  nextStepId: Joi.string().optional().allow(null),

  position: Joi.object({ x: Joi.number().default(0), y: Joi.number().default(0) }).optional(),

  retry: Joi.object({
    enabled: Joi.boolean().default(false),
    maxAttempts: Joi.number().min(1).max(5).default(3),
    delayBetweenRetries: Joi.number().min(500).default(2000),
  }).optional(),

  timeout: Joi.number().min(500).optional(),
});

const flowSchema = Joi.object({
  name: Joi.string().max(100).required(),
  description: Joi.string().max(1000).optional(),

  enabled: Joi.boolean().default(false),
  isTemplate: Joi.boolean().default(false),

  settings: Joi.object({
    maxExecutionsPerContact: Joi.number().min(1).max(100).default(FLOW_LIMITS.MAX_EXECUTIONS_PER_CONTACT_PER_HOUR),
    executionWindowMinutes: Joi.number().min(1).default(60),

    maxExecutionTime: Joi.number().min(1000).max(FLOW_LIMITS.MAX_EXECUTION_TIME_MS).default(FLOW_LIMITS.MAX_EXECUTION_TIME_MS),

    continueOnError: Joi.boolean().default(false),
    logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),

    allowedDaysOfWeek: Joi.array().items(Joi.number().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
    allowedHoursStart: Joi.number().min(0).max(23).default(0),
    allowedHoursEnd: Joi.number().min(0).max(23).default(23),
    timezone: Joi.string().default('America/Sao_Paulo'),

    priority: Joi.number().min(1).max(10).default(5),
  }).default({}),

  steps: Joi.array().items(stepSchema).min(1).max(FLOW_LIMITS.MAX_STEPS_PER_FLOW).required(),
  entryStepId: Joi.string().required(),

  variables: Joi.object().unknown(true).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  metadata: Joi.object({
    color: Joi.string().optional(),
    icon: Joi.string().optional(),
    category: Joi.string().optional(),
    version: Joi.number().default(1),
  }).optional(),
});

function validateFlowLogic(flow) {
  const errors = [];
  const stepIds = new Set(flow.steps.map((s) => s.id));

  if (!stepIds.has(flow.entryStepId)) {
    errors.push({ path: 'entryStepId', message: `Entry step "${flow.entryStepId}" not found`, type: 'reference.invalid' });
  }

  const entry = flow.steps.find((s) => s.id === flow.entryStepId);
  if (entry && entry.type !== STEP_TYPES.TRIGGER) {
    errors.push({ path: 'entryStepId', message: 'Entry step must be a trigger', type: 'logic.invalid' });
  }

  const idCounts = new Map();
  for (const s of flow.steps) idCounts.set(s.id, (idCounts.get(s.id) || 0) + 1);
  for (const [id, count] of idCounts.entries()) {
    if (count > 1) errors.push({ path: 'steps', message: `Duplicate step ID: "${id}"`, type: 'id.duplicate' });
  }

  for (const step of flow.steps) {
    if (step.nextStepId && !stepIds.has(step.nextStepId)) {
      errors.push({ path: `steps[${step.id}].nextStepId`, message: `Next step "${step.nextStepId}" not found`, type: 'reference.invalid' });
    }

    if (step.type === STEP_TYPES.ACTION && step.action?.type === ACTION_TYPES.CONDITION) {
      const cfg = step.action.config;

      if (cfg.onTrue?.goToStep && !stepIds.has(cfg.onTrue.goToStep)) {
        errors.push({ path: `steps[${step.id}].action.config.onTrue.goToStep`, message: `Step "${cfg.onTrue.goToStep}" not found`, type: 'reference.invalid' });
      }
      if (cfg.onFalse?.goToStep && !stepIds.has(cfg.onFalse.goToStep)) {
        errors.push({ path: `steps[${step.id}].action.config.onFalse.goToStep`, message: `Step "${cfg.onFalse.goToStep}" not found`, type: 'reference.invalid' });
      }
    }

    if (step.type === STEP_TYPES.ACTION && step.action?.type === ACTION_TYPES.GO_TO_STEP) {
      if (!stepIds.has(step.action.config.stepId)) {
        errors.push({ path: `steps[${step.id}].action.config.stepId`, message: `Step "${step.action.config.stepId}" not found`, type: 'reference.invalid' });
      }
    }
  }

  const hasTrigger = flow.steps.some((s) => s.type === STEP_TYPES.TRIGGER);
  if (!hasTrigger) errors.push({ path: 'steps', message: 'Flow must have at least one trigger', type: 'logic.invalid' });

  return errors;
}

function validateFlow(flowData) {
  const { error, value } = flowSchema.validate(flowData, { abortEarly: false, stripUnknown: true });
  if (error) {
    return {
      valid: false,
      errors: error.details.map((d) => ({ path: d.path.join('.'), message: d.message, type: d.type })),
      value: null,
    };
  }

  const extra = validateFlowLogic(value);
  if (extra.length) return { valid: false, errors: extra, value: null };

  return { valid: true, errors: [], value };
}

module.exports = {
  flowSchema,
  validateFlow,
  validateFlowLogic,
};
