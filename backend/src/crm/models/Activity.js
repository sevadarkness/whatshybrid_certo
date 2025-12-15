/**
 * @fileoverview Model de Activity
 * @module crm/models/Activity
 */

const mongoose = require('mongoose');
const { ACTIVITY_TYPE } = require('../constants/crmConstants');

const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    type: String,
    size: Number,
  },
  { _id: false }
);

const activitySchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(ACTIVITY_TYPE),
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    description: {
      type: String,
      maxlength: 5000,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      index: true,
    },
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
      index: true,
    },
    dueDate: {
      type: Date,
      index: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    completedAt: {
      type: Date,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Metadados específicos por tipo
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    // Para atividades automáticas
    isAutomatic: {
      type: Boolean,
      default: false,
    },
    triggeredBy: {
      type: String, // flow, system, webhook, etc
    },
    // Controle
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índices compostos
activitySchema.index({ workspaceId: 1, contactId: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, dealId: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, type: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, createdBy: 1, createdAt: -1 });
activitySchema.index({ workspaceId: 1, dueDate: 1, isCompleted: 1 });
activitySchema.index({ workspaceId: 1, isCompleted: 1, dueDate: 1 });

// Virtual para contato
activitySchema.virtual('contact', {
  ref: 'Contact',
  localField: 'contactId',
  foreignField: '_id',
  justOne: true,
});

// Virtual para deal
activitySchema.virtual('deal', {
  ref: 'Deal',
  localField: 'dealId',
  foreignField: '_id',
  justOne: true,
});

// Virtual para criador
activitySchema.virtual('creator', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true,
});

// Middleware pre-save
activitySchema.pre('save', function (next) {
  // Gera título automático se não fornecido
  if (!this.title && this.type) {
    this.title = generateDefaultTitle(this.type, this.metadata);
  }

  // Se marcou como completo, define completedAt
  if (this.isModified('isCompleted') && this.isCompleted && !this.completedAt) {
    this.completedAt = new Date();
  }

  // Se desmarcou completo, limpa completedAt
  if (this.isModified('isCompleted') && !this.isCompleted) {
    this.completedAt = null;
    this.completedBy = null;
  }

  next();
});

/**
 * Gera título padrão baseado no tipo
 */
function generateDefaultTitle(type, metadata) {
  const titles = {
    [ACTIVITY_TYPE.NOTE]: 'Nota adicionada',
    [ACTIVITY_TYPE.CALL]: 'Ligação realizada',
    [ACTIVITY_TYPE.EMAIL]: 'Email enviado',
    [ACTIVITY_TYPE.MEETING]: 'Reunião agendada',
    [ACTIVITY_TYPE.TASK]: 'Tarefa criada',
    [ACTIVITY_TYPE.WHATSAPP]: 'Mensagem WhatsApp',
    [ACTIVITY_TYPE.STAGE_CHANGE]: metadata?.get?.('stageName')
      ? `Movido para ${metadata.get('stageName')}`
      : 'Estágio alterado',
    [ACTIVITY_TYPE.DEAL_CREATED]: 'Negócio criado',
    [ACTIVITY_TYPE.DEAL_WON]: 'Negócio ganho',
    [ACTIVITY_TYPE.DEAL_LOST]: 'Negócio perdido',
    [ACTIVITY_TYPE.TAG_ADDED]: 'Tag adicionada',
    [ACTIVITY_TYPE.TAG_REMOVED]: 'Tag removida',
    [ACTIVITY_TYPE.ASSIGNED]: 'Atribuído',
    [ACTIVITY_TYPE.SCORE_CHANGED]: 'Score alterado',
  };

  return titles[type] || 'Atividade';
}

// Métodos de instância
activitySchema.methods.markComplete = async function (userId) {
  this.isCompleted = true;
  this.completedAt = new Date();
  this.completedBy = userId;
  this.updatedBy = userId;
  return this.save();
};

activitySchema.methods.markIncomplete = async function (userId) {
  this.isCompleted = false;
  this.completedAt = null;
  this.completedBy = null;
  this.updatedBy = userId;
  return this.save();
};

activitySchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

// Statics
activitySchema.statics.getTimeline = function (workspaceId, options = {}) {
  const { contactId, dealId, limit = 50, before } = options;

  const query = { workspaceId };

  if (contactId) query.contactId = contactId;
  if (dealId) query.dealId = dealId;
  if (before) query.createdAt = { $lt: before };

  return this.find(query)
    .populate('createdBy', 'name email avatar')
    .sort({ createdAt: -1 })
    .limit(limit);
};

activitySchema.statics.getPendingTasks = function (workspaceId, options = {}) {
  const { assignedTo, dueBefore } = options;

  const query = {
    workspaceId,
    type: { $in: [ACTIVITY_TYPE.TASK, ACTIVITY_TYPE.MEETING, ACTIVITY_TYPE.CALL] },
    isCompleted: false,
  };

  if (assignedTo) query.createdBy = assignedTo;
  if (dueBefore) query.dueDate = { $lte: dueBefore };

  return this.find(query)
    .populate('contactId', 'name')
    .populate('dealId', 'title')
    .sort({ dueDate: 1 });
};

activitySchema.statics.createSystemActivity = function (data) {
  return this.create({
    ...data,
    isAutomatic: true,
    triggeredBy: 'system',
  });
};

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;