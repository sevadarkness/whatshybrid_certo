const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { TRIGGER_TYPES, ACTION_TYPES, STEP_TYPES, FLOW_LIMITS } = require('../constants/flowConstants');

const { Schema } = mongoose;

const PositionSchema = new Schema({ x: { type: Number, default: 0 }, y: { type: Number, default: 0 } }, { _id: false });

const RetryConfigSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    maxAttempts: { type: Number, default: 3, min: 1, max: 5 },
    delayBetweenRetries: { type: Number, default: 2000, min: 500 },
  },
  { _id: false }
);

const StepSchema = new Schema(
  {
    id: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    type: { type: String, required: true, enum: Object.values(STEP_TYPES) },
    enabled: { type: Boolean, default: true },

    trigger: {
      type: { type: String, enum: Object.values(TRIGGER_TYPES) },
      config: { type: Schema.Types.Mixed },
    },

    action: {
      type: { type: String, enum: Object.values(ACTION_TYPES) },
      config: { type: Schema.Types.Mixed },
    },

    nextStepId: { type: String, default: null },
    position: { type: PositionSchema, default: () => ({}) },
    retry: { type: RetryConfigSchema, default: () => ({}) },
    timeout: { type: Number },
  },
  { _id: false }
);

const FlowSettingsSchema = new Schema(
  {
    maxExecutionsPerContact: { type: Number, default: FLOW_LIMITS.MAX_EXECUTIONS_PER_CONTACT_PER_HOUR, min: 1, max: 100 },
    executionWindowMinutes: { type: Number, default: 60, min: 1 },

    maxExecutionTime: { type: Number, default: FLOW_LIMITS.MAX_EXECUTION_TIME_MS, min: 1000, max: FLOW_LIMITS.MAX_EXECUTION_TIME_MS },

    continueOnError: { type: Boolean, default: false },
    logLevel: { type: String, enum: ['debug', 'info', 'warn', 'error'], default: 'info' },

    allowedDaysOfWeek: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    allowedHoursStart: { type: Number, default: 0, min: 0, max: 23 },
    allowedHoursEnd: { type: Number, default: 23, min: 0, max: 23 },
    timezone: { type: String, default: 'America/Sao_Paulo' },

    priority: { type: Number, default: 5, min: 1, max: 10 },
  },
  { _id: false }
);

const FlowMetadataSchema = new Schema(
  { color: String, icon: String, category: String, version: { type: Number, default: 1 } },
  { _id: false }
);

const FlowSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 100, index: true },
    description: { type: String, maxlength: 1000 },

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', index: true },

    enabled: { type: Boolean, default: false, index: true },
    isTemplate: { type: Boolean, default: false, index: true },

    settings: { type: FlowSettingsSchema, default: () => ({}) },

    steps: {
      type: [StepSchema],
      required: true,
      validate: {
        validator(steps) {
          return steps.length >= 1 && steps.length <= FLOW_LIMITS.MAX_STEPS_PER_FLOW;
        },
        message: `Flow must have between 1 and ${FLOW_LIMITS.MAX_STEPS_PER_FLOW} steps`,
      },
    },

    entryStepId: { type: String, required: true },

    variables: { type: Schema.Types.Mixed, default: {} },
    tags: [{ type: String }],
    metadata: { type: FlowMetadataSchema, default: () => ({}) },

    stats: {
      totalExecutions: { type: Number, default: 0 },
      successfulExecutions: { type: Number, default: 0 },
      failedExecutions: { type: Number, default: 0 },
      lastExecutedAt: { type: Date },
      averageExecutionTime: { type: Number, default: 0 },
    },

    version: { type: Number, default: 1 },
    publishedVersion: { type: Number, default: null },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'flows' }
);

FlowSchema.index({ userId: 1, enabled: 1 });
FlowSchema.index({ userId: 1, name: 1 }, { unique: true });
FlowSchema.index({ 'steps.trigger.type': 1, enabled: 1 });
FlowSchema.index({ tags: 1 });
FlowSchema.index({ createdAt: -1 });
FlowSchema.index({ deletedAt: 1 });

FlowSchema.methods.getStepById = function (stepId) {
  return this.steps.find((s) => s.id === stepId);
};

FlowSchema.methods.getTriggerStep = function () {
  return this.getStepById(this.entryStepId);
};

FlowSchema.methods.canExecuteNow = function () {
  const tz = this.settings?.timezone || 'America/Sao_Paulo';
  const now = DateTime.now().setZone(tz);

  // Luxon weekday: 1..7 (Mon..Sun) -> 0..6 (Sun..Sat)
  const dayOfWeek = now.weekday % 7;
  const hour = now.hour;

  const days = this.settings.allowedDaysOfWeek || [0, 1, 2, 3, 4, 5, 6];

  if (!days.includes(dayOfWeek)) return { allowed: false, reason: 'day_not_allowed' };
  if (hour < this.settings.allowedHoursStart || hour > this.settings.allowedHoursEnd) return { allowed: false, reason: 'hour_not_allowed' };
  return { allowed: true };
};

FlowSchema.methods.incrementStats = async function (success, executionTimeMs) {
  this.stats.totalExecutions += 1;
  if (success) this.stats.successfulExecutions += 1;
  else this.stats.failedExecutions += 1;
  this.stats.lastExecutedAt = new Date();

  if (success && typeof executionTimeMs === 'number' && executionTimeMs >= 0) {
    const n = this.stats.totalExecutions;
    const prevAvg = this.stats.averageExecutionTime || 0;
    const newAvg = n <= 1 ? executionTimeMs : Math.round((prevAvg * (n - 1) + executionTimeMs) / n);
    this.stats.averageExecutionTime = newAvg;
  }

  await this.save();
};

FlowSchema.methods.toExportJSON = function () {
  const obj = this.toObject();
  delete obj._id;
  delete obj.userId;
  delete obj.workspaceId;
  delete obj.createdAt;
  delete obj.updatedAt;
  delete obj.stats;
  delete obj.deletedAt;
  delete obj.__v;
  return obj;
};

FlowSchema.statics.findByTriggerType = function (triggerType, userId) {
  return this.find({
    userId,
    enabled: true,
    deletedAt: null,
    'steps.trigger.type': triggerType,
  }).sort({ 'settings.priority': -1 });
};

FlowSchema.statics.findExecutableFlows = function (triggerType, userId) {
  const now = DateTime.now();
  const dayOfWeek = now.weekday % 7;
  const hour = now.hour;

  return this.find({
    userId,
    enabled: true,
    deletedAt: null,
    'steps.trigger.type': triggerType,
    'settings.allowedDaysOfWeek': dayOfWeek,
    'settings.allowedHoursStart': { $lte: hour },
    'settings.allowedHoursEnd': { $gte: hour },
  }).sort({ 'settings.priority': -1 });
};

FlowSchema.pre('save', function (next) {
  if (this.isModified('steps') && !this.isNew) this.version += 1;
  next();
});

FlowSchema.pre(/^find/, function (next) {
  if (this.getQuery().includeDeleted !== true) {
    this.where({ deletedAt: null });
  }
  next();
});

module.exports = mongoose.model('Flow', FlowSchema);