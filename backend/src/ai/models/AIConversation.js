/**
 * @fileoverview Model de AIConversation
 * @module ai/models/AIConversation
 */

const mongoose = require('mongoose');

const aiMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    // Metadata da resposta
    metadata: {
      model: String,
      provider: String,
      tokensUsed: {
        prompt: Number,
        completion: Number,
        total: Number,
      },
      responseTime: Number, // ms
      knowledgeUsed: [{
        sourceId: mongoose.Schema.Types.ObjectId,
        sourceName: String,
        relevance: Number,
      }],
      confidence: Number,
    },
    // Feedback do usuário
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      helpful: Boolean,
      comment: String,
      givenAt: Date,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const aiConversationSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    assistantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assistant',
      required: true,
      index: true,
    },
    // Referências opcionais
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      index: true,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      index: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
    },
    // Mensagens
    messages: [aiMessageSchema],
    // Status
    status: {
      type: String,
      enum: ['active', 'completed', 'transferred', 'abandoned'],
      default: 'active',
      index: true,
    },
    // Resultado
    outcome: {
      type: String,
      enum: ['resolved', 'transferred', 'abandoned', 'lead_collected', 'meeting_scheduled', null],
    },
    transferredTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    transferReason: String,
    // Dados coletados
    collectedData: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    // Estatísticas
    stats: {
      messageCount: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      avgResponseTime: { type: Number, default: 0 },
      duration: { type: Number, default: 0 }, // segundos
    },
    // Custo
    cost: {
      total: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Índices
aiConversationSchema.index({ workspaceId: 1, createdAt: -1 });
aiConversationSchema.index({ assistantId: 1, createdAt: -1 });
aiConversationSchema.index({ contactId: 1, createdAt: -1 });

// Métodos
aiConversationSchema.methods.addMessage = async function (message) {
  this.messages.push(message);
  this.stats.messageCount = this.messages.length;
  
  if (message.metadata?.tokensUsed) {
    this.stats.totalTokens += message.metadata.tokensUsed.total || 0;
  }

  return this.save();
};

aiConversationSchema.methods.complete = async function (outcome) {
  this.status = 'completed';
  this.outcome = outcome;
  this.endedAt = new Date();
  this.stats.duration = Math.round((this.endedAt - this.startedAt) / 1000);
  return this.save();
};

aiConversationSchema.methods.transfer = async function (userId, reason) {
  this.status = 'transferred';
  this.outcome = 'transferred';
  this.transferredTo = userId;
  this.transferReason = reason;
  this.endedAt = new Date();
  this.stats.duration = Math.round((this.endedAt - this.startedAt) / 1000);
  return this.save();
};

aiConversationSchema.methods.addFeedback = async function (messageId, feedback) {
  const message = this.messages.id(messageId);
  if (message) {
    message.feedback = {
      ...feedback,
      givenAt: new Date(),
    };
    return this.save();
  }
  return null;
};

aiConversationSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    assistantId: this.assistantId,
    conversationId: this.conversationId,
    contactId: this.contactId,
    messages: this.messages,
    status: this.status,
    outcome: this.outcome,
    collectedData: this.collectedData ? Object.fromEntries(this.collectedData) : {},
    stats: this.stats,
    cost: this.cost,
    startedAt: this.startedAt,
    endedAt: this.endedAt,
    createdAt: this.createdAt,
  };
};

const AIConversation = mongoose.model('AIConversation', aiConversationSchema);

module.exports = AIConversation;