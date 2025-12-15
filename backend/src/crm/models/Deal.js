/**
 * @fileoverview Model de Deal
 * @module crm/models/Deal
 */

const mongoose = require('mongoose');
const { DEAL_STATUS, PRIORITY, LOSS_REASONS } = require('../constants/crmConstants');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false }
);

const dealSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    value: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'BRL',
      uppercase: true,
      maxlength: 3,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: true,
      index: true,
    },
    pipelineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pipeline',
      required: true,
      index: true,
    },
    stageId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(DEAL_STATUS),
      default: DEAL_STATUS.OPEN,
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(PRIORITY),
      default: PRIORITY.MEDIUM,
    },
    probability: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    expectedCloseDate: {
      type: Date,
      index: true,
    },
    closedAt: {
      type: Date,
    },
    actualValue: {
      type: Number,
      min: 0,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
    },
    notes: {
      type: String,
      maxlength: 5000,
    },
    products: {
      type: [productSchema],
      default: [],
    },
    // Dados de perda
    lossReason: {
      type: String,
      enum: Object.values(LOSS_REASONS),
    },
    competitorName: {
      type: String,
      maxlength: 200,
    },
    // Histórico de movimentação
    stageHistory: [
      {
        stageId: mongoose.Schema.Types.ObjectId,
        stageName: String,
        enteredAt: { type: Date, default: Date.now },
        exitedAt: Date,
        duration: Number, // em minutos
        movedBy: mongoose.Schema.Types.ObjectId,
      },
    ],
    // Métricas de tempo
    timeInCurrentStage: {
      type: Number,
      default: 0, // em minutos
    },
    totalCycleTime: {
      type: Number,
      default: 0, // em minutos
    },
    isRotting: {
      type: Boolean,
      default: false,
      index: true,
    },
    rottingAt: {
      type: Date,
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
    deletedAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Índices compostos
dealSchema.index({ workspaceId: 1, status: 1, pipelineId: 1 });
dealSchema.index({ workspaceId: 1, pipelineId: 1, stageId: 1 });
dealSchema.index({ workspaceId: 1, assignedTo: 1, status: 1 });
dealSchema.index({ workspaceId: 1, contactId: 1, status: 1 });
dealSchema.index({ workspaceId: 1, createdAt: -1 });
dealSchema.index({ workspaceId: 1, expectedCloseDate: 1, status: 1 });
dealSchema.index({ workspaceId: 1, isRotting: 1, status: 1 });

// Índice de texto
dealSchema.index(
  { title: 'text', notes: 'text' },
  { weights: { title: 10, notes: 1 }, name: 'deal_text_search' }
);

// Virtual para contato
dealSchema.virtual('contact', {
  ref: 'Contact',
  localField: 'contactId',
  foreignField: '_id',
  justOne: true,
});

// Virtual para atividades
dealSchema.virtual('activities', {
  ref: 'Activity',
  localField: '_id',
  foreignField: 'dealId',
  options: { sort: { createdAt: -1 } },
});

// Virtual para valor calculado dos produtos
dealSchema.virtual('productsTotal').get(function () {
  if (!this.products || this.products.length === 0) return 0;
  
  return this.products.reduce((total, product) => {
    const subtotal = product.quantity * product.unitPrice;
    const discount = subtotal * (product.discount / 100);
    return total + (subtotal - discount);
  }, 0);
});

// Virtual para weighted value (valor ponderado pela probabilidade)
dealSchema.virtual('weightedValue').get(function () {
  return (this.value * this.probability) / 100;
});

// Middleware pre-save
dealSchema.pre('save', function (next) {
  // Inicializa stageHistory se for novo
  if (this.isNew && this.stageId) {
    this.stageHistory = [
      {
        stageId: this.stageId,
        stageName: '', // Será preenchido pelo service
        enteredAt: new Date(),
      },
    ];
  }

  // Atualiza timeInCurrentStage
  if (this.stageHistory && this.stageHistory.length > 0) {
    const currentStageEntry = this.stageHistory[this.stageHistory.length - 1];
    if (currentStageEntry && !currentStageEntry.exitedAt) {
      this.timeInCurrentStage = Math.round(
        (Date.now() - new Date(currentStageEntry.enteredAt).getTime()) / 60000
      );
    }
  }

  next();
});

// Soft delete
dealSchema.pre(/^^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

// Métodos de instância
dealSchema.methods.moveToStage = async function (newStageId, stageName, userId) {
  const now = new Date();

  // Fecha o estágio atual
  if (this.stageHistory.length > 0) {
    const currentStage = this.stageHistory[this.stageHistory.length - 1];
    currentStage.exitedAt = now;
    currentStage.duration = Math.round(
      (now - new Date(currentStage.enteredAt)) / 60000
    );
  }

  // Adiciona novo estágio
  this.stageHistory.push({
    stageId: newStageId,
    stageName,
    enteredAt: now,
    movedBy: userId,
  });

  this.stageId = newStageId;
  this.updatedBy = userId;
  this.isRotting = false;
  this.rottingAt = null;

  return this.save();
};

dealSchema.methods.markAsWon = async function (data = {}, userId) {
  const now = new Date();

  // Fecha estágio atual
  if (this.stageHistory.length > 0) {
    const currentStage = this.stageHistory[this.stageHistory.length - 1];
    currentStage.exitedAt = now;
    currentStage.duration = Math.round(
      (now - new Date(currentStage.enteredAt)) / 60000
    );
  }

  this.status = DEAL_STATUS.WON;
  this.closedAt = data.closedAt || now;
  this.actualValue = data.actualValue ?? this.value;
  this.probability = 100;
  this.updatedBy = userId;

  // Calcula cycle time total
  this.totalCycleTime = Math.round(
    (this.closedAt - this.createdAt) / 60000
  );

  return this.save();
};

dealSchema.methods.markAsLost = async function (data, userId) {
  const now = new Date();

  if (this.stageHistory.length > 0) {
    const currentStage = this.stageHistory[this.stageHistory.length - 1];
    currentStage.exitedAt = now;
    currentStage.duration = Math.round(
      (now - new Date(currentStage.enteredAt)) / 60000
    );
  }

  this.status = DEAL_STATUS.LOST;
  this.closedAt = data.closedAt || now;
  this.lossReason = data.lossReason;
  this.competitorName = data.competitorName;
  this.probability = 0;
  this.updatedBy = userId;

  this.totalCycleTime = Math.round(
    (this.closedAt - this.createdAt) / 60000
  );

  return this.save();
};

dealSchema.methods.reopen = async function (stageId, stageName, userId) {
  this.status = DEAL_STATUS.OPEN;
  this.closedAt = null;
  this.lossReason = null;
  this.competitorName = null;
  this.actualValue = null;

  this.stageHistory.push({
    stageId,
    stageName,
    enteredAt: new Date(),
    movedBy: userId,
  });

  this.stageId = stageId;
  this.updatedBy = userId;

  return this.save();
};

dealSchema.methods.softDelete = async function (userId) {
  this.deletedAt = new Date();
  this.updatedBy = userId;
  return this.save();
};

dealSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  delete obj.deletedAt;
  return obj;
};

// Statics
dealSchema.statics.getByPipeline = function (workspaceId, pipelineId, options = {}) {
  const query = {
    workspaceId,
    pipelineId,
    status: DEAL_STATUS.OPEN,
  };

  if (options.assignedTo) {
    query.assignedTo = options.assignedTo;
  }

  return this.find(query)
    .populate('contactId', 'name email phone avatar')
    .populate('assignedTo', 'name email avatar')
    .sort({ 'stageHistory.enteredAt': -1 });
};

dealSchema.statics.getPipelineStats = async function (workspaceId, pipelineId) {
  return this.aggregate([
    {
      $match: {
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        pipelineId: new mongoose.Types.ObjectId(pipelineId),
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: { stageId: '$stageId', status: '$status' },
        count: { $sum: 1 },
        totalValue: { $sum: '$value' },
        weightedValue: {
          $sum: { $multiply: ['$value', { $divide: ['$probability', 100] }] },
        },
      },
    },
  ]);
};

const Deal = mongoose.model('Deal', dealSchema);

module.exports = Deal;