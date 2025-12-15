const mongoose = require('mongoose');
const { EXECUTION_STATUS, STEP_STATUS, FLOW_LIMITS } = require('../constants/flowConstants');

const { Schema } = mongoose;

const StepResultSchema = new Schema(
  {
    stepId: { type: String, required: true },
    stepName: { type: String },
    stepType: { type: String },
    actionType: { type: String },

    status: { type: String, enum: Object.values(STEP_STATUS), required: true },

    startedAt: { type: Date },
    completedAt: { type: Date },
    duration: { type: Number },

    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },

    error: {
      message: { type: String },
      code: { type: String },
      stack: { type: String },
      retryable: { type: Boolean },
    },

    attempt: { type: Number, default: 1 },

    conditionResult: { type: Boolean },
    conditionBranch: { type: String, enum: ['true', 'false'] },
  },
  { _id: false }
);

const ExecutionContextSchema = new Schema(
  {
    contact: {
      id: { type: Schema.Types.ObjectId, ref: 'Contact' },
      phone: { type: String },
      name: { type: String },
      stage: { type: String },
      tags: [{ type: String }],
    },

    message: {
      id: { type: String },
      text: { type: String },
      type: { type: String },
      timestamp: { type: Date },
      fromMe: { type: Boolean },
      mediaUrl: { type: String },
    },

    campaign: {
      id: { type: Schema.Types.ObjectId, ref: 'Campaign' },
      name: { type: String },
      event: { type: String },
    },

    variables: { type: Schema.Types.Mixed, default: {} },
    triggerData: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const FlowExecutionSchema = new Schema(
  {
    executionId: { type: String, required: true, unique: true, index: true },

    flowId: { type: Schema.Types.ObjectId, ref: 'Flow', required: true, index: true },
    flowName: { type: String },
    flowVersion: { type: Number },

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', index: true },

    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', index: true },

    status: { type: String, enum: Object.values(EXECUTION_STATUS), default: EXECUTION_STATUS.PENDING, index: true },

    isTest: { type: Boolean, default: false, index: true },
    isSimulation: { type: Boolean, default: false },

    context: { type: ExecutionContextSchema, default: () => ({}) },

    trigger: {
      type: { type: String },
      stepId: { type: String },
      matchedKeyword: { type: String },
      matchedConditions: { type: Schema.Types.Mixed },
    },

    stepResults: { type: [StepResultSchema], default: [] },

    currentStepId: { type: String },
    currentStepIndex: { type: Number, default: 0 },

    startedAt: { type: Date },
    completedAt: { type: Date },
    scheduledResumeAt: { type: Date, index: true },

    totalDuration: { type: Number },

    error: {
      message: { type: String },
      code: { type: String },
      stepId: { type: String },
      stack: { type: String },
    },

    loopProtection: {
      stepExecutionCounts: { type: Map, of: Number, default: {} },
      totalStepsExecuted: { type: Number, default: 0 },
    },

    parentExecutionId: { type: String },

    result: {
      messagesSent: { type: Number, default: 0 },
      tagsAdded: { type: [String], default: [] },
      tagsRemoved: { type: [String], default: [] },
      stageChanged: { type: Boolean, default: false },
      webhooksCalled: { type: Number, default: 0 },
      aiResponses: { type: Number, default: 0 },
      variablesSet: { type: Map, of: Schema.Types.Mixed, default: {} },
    },

    priority: { type: Number, default: 5 },
  },
  { timestamps: true, collection: 'flow_executions' }
);

FlowExecutionSchema.index({ flowId: 1, status: 1 });
FlowExecutionSchema.index({ userId: 1, createdAt: -1 });
FlowExecutionSchema.index({ contactId: 1, createdAt: -1 });
FlowExecutionSchema.index({ status: 1, scheduledResumeAt: 1 });
FlowExecutionSchema.index({ createdAt: -1 });

FlowExecutionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

FlowExecutionSchema.virtual('isCompleted').get(function () {
  return [EXECUTION_STATUS.COMPLETED, EXECUTION_STATUS.FAILED, EXECUTION_STATUS.CANCELLED, EXECUTION_STATUS.TIMEOUT].includes(this.status);
});

FlowExecutionSchema.virtual('isRunning').get(function () {
  return [EXECUTION_STATUS.RUNNING, EXECUTION_STATUS.WAITING_DELAY].includes(this.status);
});

FlowExecutionSchema.methods.start = async function () {
  this.status = EXECUTION_STATUS.RUNNING;
  this.startedAt = new Date();
  await this.save();
  return this;
};

FlowExecutionSchema.methods.addStepResult = function (stepResult) {
  const prev = this.loopProtection.stepExecutionCounts.get(stepResult.stepId) || 0;
  this.loopProtection.stepExecutionCounts.set(stepResult.stepId, prev + 1);
  this.loopProtection.totalStepsExecuted += 1;

  this.stepResults.push({ ...stepResult, completedAt: stepResult.completedAt || new Date() });

  if (stepResult.actionType === 'send_message' && stepResult.status === STEP_STATUS.SUCCESS) {
    this.result.messagesSent += 1;
  }

  return this;
};

FlowExecutionSchema.methods.checkLoopLimit = function (stepId) {
  const count = this.loopProtection.stepExecutionCounts.get(stepId) || 0;
  const maxIterations = FLOW_LIMITS.MAX_LOOP_ITERATIONS;

  if (count >= maxIterations) return { exceeded: true, count, limit: maxIterations };

  const totalLimit = FLOW_LIMITS.MAX_STEPS_PER_FLOW * 2;
  if (this.loopProtection.totalStepsExecuted >= totalLimit) {
    return { exceeded: true, count: this.loopProtection.totalStepsExecuted, limit: totalLimit, reason: 'total_steps_exceeded' };
  }

  return { exceeded: false };
};

FlowExecutionSchema.methods.waitForDelay = async function (resumeAt, nextStepId) {
  this.status = EXECUTION_STATUS.WAITING_DELAY;
  this.scheduledResumeAt = resumeAt;
  this.currentStepId = nextStepId;
  await this.save();
  return this;
};

FlowExecutionSchema.methods.complete = async function (result = {}) {
  this.status = EXECUTION_STATUS.COMPLETED;
  this.completedAt = new Date();
  this.totalDuration = this.startedAt ? this.completedAt - this.startedAt : 0;
  Object.assign(this.result, result);
  await this.save();
  return this;
};

FlowExecutionSchema.methods.fail = async function (error, stepId = null) {
  this.status = EXECUTION_STATUS.FAILED;
  this.completedAt = new Date();
  this.totalDuration = this.startedAt ? this.completedAt - this.startedAt : 0;
  this.error = {
    message: error?.message || String(error),
    code: error?.code,
    stepId,
    stack: error?.stack,
  };
  await this.save();
  return this;
};

FlowExecutionSchema.methods.cancel = async function (reason = 'manual') {
  this.status = EXECUTION_STATUS.CANCELLED;
  this.completedAt = new Date();
  this.totalDuration = this.startedAt ? this.completedAt - this.startedAt : 0;
  this.error = { message: `Cancelled: ${reason}` };
  await this.save();
  return this;
};

FlowExecutionSchema.methods.timeout = async function () {
  this.status = EXECUTION_STATUS.TIMEOUT;
  this.completedAt = new Date();
  this.totalDuration = FLOW_LIMITS.MAX_EXECUTION_TIME_MS;
  this.error = { message: 'Execution timeout exceeded', code: 'TIMEOUT' };
  await this.save();
  return this;
};

FlowExecutionSchema.methods.setVariable = function (name, value) {
  this.context.variables = this.context.variables || {};
  this.context.variables[name] = value;

  this.result.variablesSet.set(name, value);
  this.markModified('context.variables');
  this.markModified('result.variablesSet');
};

FlowExecutionSchema.methods.getVariable = function (name, defaultValue = null) {
  return this.context?.variables?.[name] ?? defaultValue;
};

FlowExecutionSchema.methods.resume = async function () {
  this.status = EXECUTION_STATUS.RUNNING;
  this.scheduledResumeAt = null;
  await this.save();
  return this;
};

FlowExecutionSchema.statics.countRecentExecutions = function (flowId, contactId, windowMinutes = 60) {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  return this.countDocuments({
    flowId,
    contactId,
    createdAt: { $gte: windowStart },
    isTest: false,
  });
};

FlowExecutionSchema.statics.findPendingResumes = function () {
  return this.find({
    status: EXECUTION_STATUS.WAITING_DELAY,
    scheduledResumeAt: { $lte: new Date() },
  }).sort({ scheduledResumeAt: 1, priority: -1 });
};

module.exports = mongoose.model('FlowExecution', FlowExecutionSchema);