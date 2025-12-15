/**
 * @fileoverview Model de Report
 * @module analytics/models/Report
 */

const mongoose = require('mongoose');
const { REPORT_TYPE, EXPORT_FORMAT } = require('../constants/analyticsConstants');

const reportSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 100,
    },
    type: {
      type: String,
      enum: Object.values(REPORT_TYPE),
      required: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    // Configuração do relatório
    config: {
      period: { type: String },
      from: { type: Date },
      to: { type: Date },
      filters: { type: mongoose.Schema.Types.Mixed },
      metrics: [{ type: String }],
      groupBy: [{ type: String }],
      sortBy: { type: String },
      sortOrder: { type: String, enum: ['asc', 'desc'] },
    },
    // Agendamento
    schedule: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly'] },
      dayOfWeek: { type: Number, min: 0, max: 6 },
      dayOfMonth: { type: Number, min: 1, max: 31 },
      time: { type: String },
      timezone: { type: String, default: 'America/Sao_Paulo' },
      recipients: [{ type: String }],
      format: { type: String, enum: Object.values(EXPORT_FORMAT), default: EXPORT_FORMAT.PDF },
      lastRunAt: { type: Date },
      nextRunAt: { type: Date },
    },
    // Execuções
    executions: [{
      startedAt: { type: Date },
      completedAt: { type: Date },
      status: { type: String, enum: ['running', 'completed', 'failed'] },
      fileUrl: { type: String },
      error: { type: String },
    }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Índices
reportSchema.index({ workspaceId: 1, type: 1 });
reportSchema.index({ 'schedule.enabled': 1, 'schedule.nextRunAt': 1 });

// Métodos
reportSchema.methods.addExecution = async function (execution) {
  this.executions.push(execution);
  
  // Mantém apenas últimas 10 execuções
  if (this.executions.length > 10) {
    this.executions = this.executions.slice(-10);
  }

  if (this.schedule.enabled) {
    this.schedule.lastRunAt = execution.startedAt;
    this.schedule.nextRunAt = this.calculateNextRun();
  }

  return this.save();
};

reportSchema.methods.calculateNextRun = function () {
  if (!this.schedule.enabled) return null;

  const now = new Date();
  let next = new Date();
  const [hours, minutes] = this.schedule.time.split(':').map(Number);

  next.setHours(hours, minutes, 0, 0);

  switch (this.schedule.frequency) {
    case 'daily':
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      break;

    case 'weekly':
      next.setDate(next.getDate() + ((7 + this.schedule.dayOfWeek - next.getDay()) % 7 || 7));
      if (next <= now) {
        next.setDate(next.getDate() + 7);
      }
      break;

    case 'monthly':
      next.setDate(this.schedule.dayOfMonth);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }
      break;
  }

  return next;
};

// Statics
reportSchema.statics.getScheduledReports = function () {
  return this.find({
    'schedule.enabled': true,
    'schedule.nextRunAt': { $lte: new Date() },
  });
};

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;