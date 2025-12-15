/**
 * @fileoverview Model de Pipeline
 * @module crm/models/Pipeline
 */

const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    color: {
      type: String,
      default: '#6B7280',
      match: /^^#[0-9A-Fa-f]{6}$/,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
    },
    probability: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    rottingDays: {
      type: Number,
      min: 0,
      max: 365,
    },
    isWinStage: {
      type: Boolean,
      default: false,
    },
    isLossStage: {
      type: Boolean,
      default: false,
    },
    automations: {
      onEnter: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Flow' }],
      onExit: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Flow' }],
    },
  },
  { _id: true }
);

const pipelineSchema = new mongoose.Schema(
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
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    currency: {
      type: String,
      default: 'BRL',
      uppercase: true,
      maxlength: 3,
    },
    stages: {
      type: [stageSchema],
      required: true,
      validate: {
        validator: function (stages) {
          return stages.length >= 1 && stages.length <= 20;
        },
        message: 'Pipeline deve ter entre 1 e 20 estágios',
      },
    },
    settings: {
      allowMultipleDealsPerContact: { type: Boolean, default: true },
      requireValue: { type: Boolean, default: false },
      requireProducts: { type: Boolean, default: false },
      defaultProbabilityByStage: { type: Boolean, default: true },
    },
    // Métricas agregadas
    metrics: {
      totalDeals: { type: Number, default: 0 },
      openDeals: { type: Number, default: 0 },
      wonDeals: { type: Number, default: 0 },
      lostDeals: { type: Number, default: 0 },
      totalValue: { type: Number, default: 0 },
      wonValue: { type: Number, default: 0 },
      avgCycleTime: { type: Number, default: 0 }, // em dias
      conversionRate: { type: Number, default: 0 }, // percentual
    },
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

// Índices
pipelineSchema.index({ workspaceId: 1, isDefault: 1 });
pipelineSchema.index({ workspaceId: 1, isActive: 1 });
pipelineSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

// Soft delete
pipelineSchema.pre(/^^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

// Middleware para garantir apenas um default
pipelineSchema.pre('save', async function (next) {
  if (this.isModified('isDefault') && this.isDefault) {
    await this.constructor.updateMany(
      { workspaceId: this.workspaceId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }

  // Ordena stages se necessário
  if (this.isModified('stages')) {
    this.stages.forEach((stage, index) => {
      if (stage.order === undefined) {
        stage.order = index;
      }
    });
    this.stages.sort((a, b) => a.order - b.order);
  }

  next();
});

// Métodos de instância
pipelineSchema.methods.getStageById = function (stageId) {
  return this.stages.find((s) => s._id.equals(stageId));
};

pipelineSchema.methods.getStageByOrder = function (order) {
  return this.stages.find((s) => s.order === order);
};

pipelineSchema.methods.getFirstStage = function () {
  return this.stages.reduce((min, stage) =>
    stage.order < min.order ? stage : min
  );
};

pipelineSchema.methods.getWinStage = function () {
  return this.stages.find((s) => s.isWinStage);
};

pipelineSchema.methods.getLossStage = function () {
  return this.stages.find((s) => s.isLossStage);
};

pipelineSchema.methods.addStage = async function (stageData, userId) {
  const maxOrder = Math.max(...this.stages.map((s) => s.order), -1);
  
  const newStage = {
    ...stageData,
    order: stageData.order ?? maxOrder + 1,
  };

  this.stages.push(newStage);
  this.stages.sort((a, b) => a.order - b.order);
  this.updatedBy = userId;

  await this.save();
  return this.stages[this.stages.length - 1];
};

pipelineSchema.methods.updateStage = async function (stageId, stageData, userId) {
  const stage = this.getStageById(stageId);
  if (!stage) return null;

  Object.assign(stage, stageData);
  this.updatedBy = userId;

  await this.save();
  return stage;
};

pipelineSchema.methods.removeStage = async function (stageId, userId) {
  const index = this.stages.findIndex((s) => s._id.equals(stageId));
  if (index === -1) return false;

  this.stages.splice(index, 1);
  
  // Reordena
  this.stages.forEach((stage, i) => {
    stage.order = i;
  });

  this.updatedBy = userId;
  await this.save();
  return true;
};

pipelineSchema.methods.reorderStages = async function (stageIds, userId) {
  const stageMap = new Map(this.stages.map((s) => [s._id.toString(), s]));

  this.stages = stageIds.map((id, index) => {
    const stage = stageMap.get(id.toString());
    if (stage) {
      stage.order = index;
    }
    return stage;
  }).filter(Boolean);

  this.updatedBy = userId;
  await this.save();
};

pipelineSchema.methods.softDelete = async function (userId) {
  this.deletedAt = new Date();
  this.updatedBy = userId;
  return this.save();
};

pipelineSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  delete obj.deletedAt;
  return obj;
};

// Statics
pipelineSchema.statics.getDefault = function (workspaceId) {
  return this.findOne({ workspaceId, isDefault: true, isActive: true });
};

pipelineSchema.statics.getActive = function (workspaceId) {
  return this.find({ workspaceId, isActive: true }).sort({ isDefault: -1, name: 1 });
};

const Pipeline = mongoose.model('Pipeline', pipelineSchema);

module.exports = Pipeline;