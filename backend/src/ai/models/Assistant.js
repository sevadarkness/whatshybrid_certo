/**
 * @fileoverview Model de Assistant
 * @module ai/models/Assistant
 */

const mongoose = require('mongoose');
const {
  AI_PROVIDER,
  ASSISTANT_TYPE,
  RESPONSE_MODE,
  ASSISTANT_STATUS,
  DEFAULT_AI_CONFIG,
} = require('../constants/aiConstants');

const assistantSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: Object.values(ASSISTANT_TYPE),
      default: ASSISTANT_TYPE.GENERAL,
    },
    // Configuração do modelo
    provider: {
      type: String,
      enum: Object.values(AI_PROVIDER),
      default: AI_PROVIDER.OPENAI,
    },
    model: {
      type: String,
      required: true,
    },
    systemPrompt: {
      type: String,
      required: true,
      maxlength: 10000,
    },
    // Modo de resposta
    responseMode: {
      type: String,
      enum: Object.values(RESPONSE_MODE),
      default: RESPONSE_MODE.AUTOMATIC,
    },
    // Configurações do modelo
    config: {
      temperature: { type: Number, default: DEFAULT_AI_CONFIG.temperature },
      maxTokens: { type: Number, default: DEFAULT_AI_CONFIG.maxTokens },
      topP: { type: Number, default: DEFAULT_AI_CONFIG.topP },
      frequencyPenalty: { type: Number, default: DEFAULT_AI_CONFIG.frequencyPenalty },
      presencePenalty: { type: Number, default: DEFAULT_AI_CONFIG.presencePenalty },
    },
    // Personalidade
    personality: {
      tone: {
        type: String,
        enum: ['formal', 'casual', 'friendly', 'professional'],
        default: 'professional',
      },
      language: { type: String, default: 'pt-BR' },
      emoji: { type: Boolean, default: false },
    },
    // Capacidades
    capabilities: {
      canTransferToHuman: { type: Boolean, default: true },
      canScheduleMeeting: { type: Boolean, default: false },
      canCollectLead: { type: Boolean, default: true },
      canAccessKnowledge: { type: Boolean, default: true },
    },
    // Canais onde está ativo
    channels: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
    }],
    // Mensagem de fallback
    fallbackMessage: {
      type: String,
      default: 'Desculpe, não consegui entender sua mensagem. Posso transferir você para um atendente humano?',
    },
    // Status
    status: {
      type: String,
      enum: Object.values(ASSISTANT_STATUS),
      default: ASSISTANT_STATUS.ACTIVE,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Estatísticas
    stats: {
      totalConversations: { type: Number, default: 0 },
      totalMessages: { type: Number, default: 0 },
      avgResponseTime: { type: Number, default: 0 }, // ms
      satisfactionScore: { type: Number, default: 0 },
      transferRate: { type: Number, default: 0 }, // percentual
    },
    // Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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

// Índices
assistantSchema.index({ workspaceId: 1, name: 1 }, { unique: true });
assistantSchema.index({ workspaceId: 1, isActive: 1 });
assistantSchema.index({ workspaceId: 1, channels: 1 });

// Virtual para fontes de conhecimento
assistantSchema.virtual('knowledgeSources', {
  ref: 'KnowledgeSource',
  localField: '_id',
  foreignField: 'assistantId',
});

// Métodos
assistantSchema.methods.incrementStats = async function (field, value = 1) {
  const update = {};
  update[`stats.${field}`] = value;
  return this.updateOne({ $inc: update });
};

assistantSchema.methods.updateAvgResponseTime = async function (newTime) {
  const total = this.stats.totalMessages || 1;
  const currentAvg = this.stats.avgResponseTime || 0;
  const newAvg = ((currentAvg * (total - 1)) + newTime) / total;
  
  this.stats.avgResponseTime = Math.round(newAvg);
  return this.save();
};

assistantSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    description: this.description,
    type: this.type,
    provider: this.provider,
    model: this.model,
    responseMode: this.responseMode,
    config: this.config,
    personality: this.personality,
    capabilities: this.capabilities,
    channels: this.channels,
    fallbackMessage: this.fallbackMessage,
    status: this.status,
    isActive: this.isActive,
    stats: this.stats,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Statics
assistantSchema.statics.findByChannel = function (workspaceId, channelId) {
  return this.findOne({
    workspaceId,
    channels: channelId,
    isActive: true,
    status: ASSISTANT_STATUS.ACTIVE,
  });
};

assistantSchema.statics.getActiveAssistants = function (workspaceId) {
  return this.find({
    workspaceId,
    isActive: true,
    status: ASSISTANT_STATUS.ACTIVE,
  }).sort({ name: 1 });
};

const Assistant = mongoose.model('Assistant', assistantSchema);

module.exports = Assistant;