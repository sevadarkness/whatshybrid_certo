/**
 * @fileoverview Model de Metric (dados agregados)
 * @module analytics/models/Metric
 */

const mongoose = require('mongoose');
const { AGGREGATION_PERIOD } = require('../constants/analyticsConstants');

const metricSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    // Identificador da métrica
    name: {
      type: String,
      required: true,
      index: true,
    },
    // Período de agregação
    period: {
      type: String,
      enum: Object.values(AGGREGATION_PERIOD),
      required: true,
      index: true,
    },
    // Data/hora do período
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    // Valor da métrica
    value: {
      type: Number,
      required: true,
      default: 0,
    },
    // Contagem (para médias)
    count: {
      type: Number,
      default: 1,
    },
    // Dimensões opcionais
    dimensions: {
      channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
      agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      pipelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline' },
      stageId: { type: mongoose.Schema.Types.ObjectId },
      tag: String,
      source: String,
    },
  },
  {
    timestamps: true,
  }
);

// Índice composto para queries eficientes
metricSchema.index({ workspaceId: 1, name: 1, period: 1, timestamp: 1 });
metricSchema.index({ workspaceId: 1, name: 1, timestamp: 1, 'dimensions.channelId': 1 });
metricSchema.index({ workspaceId: 1, name: 1, timestamp: 1, 'dimensions.agentId': 1 });

// TTL para limpeza automática (dados horários por 90 dias)
metricSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { period: 'hour' },
  }
);

// Statics
metricSchema.statics.increment = async function (workspaceId, name, period, timestamp, value = 1, dimensions = {}) {
  const normalizedTimestamp = this.normalizeTimestamp(timestamp, period);
  
  return this.findOneAndUpdate(
    {
      workspaceId,
      name,
      period,
      timestamp: normalizedTimestamp,
      ...Object.entries(dimensions).reduce((acc, [key, val]) => {
        if (val) acc[`dimensions.${key}`] = val;
        return acc;
      }, {}),
    },
    {
      $inc: { value, count: 1 },
    },
    { upsert: true, new: true }
  );
};

metricSchema.statics.set = async function (workspaceId, name, period, timestamp, value, dimensions = {}) {
  const normalizedTimestamp = this.normalizeTimestamp(timestamp, period);
  
  return this.findOneAndUpdate(
    {
      workspaceId,
      name,
      period,
      timestamp: normalizedTimestamp,
      ...Object.entries(dimensions).reduce((acc, [key, val]) => {
        if (val) acc[`dimensions.${key}`] = val;
        return acc;
      }, {}),
    },
    { $set: { value } },
    { upsert: true, new: true }
  );
};

metricSchema.statics.normalizeTimestamp = function (date, period) {
  const d = new Date(date);
  
  switch (period) {
    case 'hour':
      d.setMinutes(0, 0, 0);
      break;
    case 'day':
      d.setHours(0, 0, 0, 0);
      break;
    case 'week':
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay()); // Início da semana
      break;
    case 'month':
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      break;
    case 'year':
      d.setHours(0, 0, 0, 0);
      d.setMonth(0, 1);
      break;
  }
  
  return d;
};

metricSchema.statics.getTimeSeries = async function (workspaceId, name, period, from, to, dimensions = {}) {
  const match = {
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    name,
    period,
    timestamp: { $gte: from, $lte: to },
  };

  Object.entries(dimensions).forEach(([key, val]) => {
    if (val) match[`dimensions.${key}`] = new mongoose.Types.ObjectId(val);
  });

  return this.find(match)
    .sort({ timestamp: 1 })
    .lean();
};

const Metric = mongoose.model('Metric', metricSchema);

module.exports = Metric;