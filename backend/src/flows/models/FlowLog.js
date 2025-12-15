const mongoose = require('mongoose');
const { LOG_LEVELS } = require('../constants/flowConstants');

const { Schema } = mongoose;

const FlowLogSchema = new Schema(
  {
    executionId: { type: String, required: true, index: true },
    flowId: { type: Schema.Types.ObjectId, ref: 'Flow', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', index: true },

    stepId: { type: String, index: true },
    stepName: { type: String },
    actionType: { type: String },

    level: { type: String, enum: Object.values(LOG_LEVELS), default: LOG_LEVELS.INFO, index: true },
    message: { type: String, required: true },

    data: { type: Schema.Types.Mixed },

    error: {
      name: { type: String },
      message: { type: String },
      code: { type: String },
      stack: { type: String },
    },

    timestamp: { type: Date, default: Date.now, index: true },
    duration: { type: Number },

    tags: [{ type: String }],

    metadata: {
      environment: { type: String },
      version: { type: String },
      source: { type: String },
    },
  },
  { timestamps: false, collection: 'flow_logs' }
);

FlowLogSchema.index({ executionId: 1, timestamp: 1 });
FlowLogSchema.index({ flowId: 1, timestamp: -1 });
FlowLogSchema.index({ level: 1, timestamp: -1 });
FlowLogSchema.index({ timestamp: -1 });

FlowLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

FlowLogSchema.statics.log = function (executionId, level, message, options = {}) {
  const { flowId, userId, workspaceId, stepId, stepName, actionType, data, error, tags = [], executionStartTime } = options;

  return this.create({
    executionId,
    flowId,
    userId,
    workspaceId,
    stepId,
    stepName,
    actionType,
    level,
    message,
    data,
    error: error
      ? { name: error.name, message: error.message, code: error.code, stack: error.stack }
      : undefined,
    tags,
    duration: executionStartTime ? Date.now() - executionStartTime : undefined,
    metadata: { environment: process.env.NODE_ENV, version: process.env.APP_VERSION },
  });
};

FlowLogSchema.statics.debug = function (executionId, message, options = {}) {
  return this.log(executionId, LOG_LEVELS.DEBUG, message, options);
};
FlowLogSchema.statics.info = function (executionId, message, options = {}) {
  return this.log(executionId, LOG_LEVELS.INFO, message, options);
};
FlowLogSchema.statics.warn = function (executionId, message, options = {}) {
  return this.log(executionId, LOG_LEVELS.WARN, message, options);
};
FlowLogSchema.statics.error = function (executionId, message, options = {}) {
  return this.log(executionId, LOG_LEVELS.ERROR, message, options);
};

module.exports = mongoose.model('FlowLog', FlowLogSchema);
