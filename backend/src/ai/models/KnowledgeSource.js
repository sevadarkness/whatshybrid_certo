/**
 * @fileoverview Model de KnowledgeSource
 * @module ai/models/KnowledgeSource
 */

const mongoose = require('mongoose');
const { KNOWLEDGE_SOURCE_TYPE, KNOWLEDGE_STATUS } = require('../constants/aiConstants');

const faqItemSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    keywords: [{ type: String }],
    embedding: [{ type: Number }], // Vetor de embedding
  },
  { _id: true }
);

const chunkSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    embedding: [{ type: Number }],
    metadata: {
      page: Number,
      section: String,
      source: String,
    },
  },
  { _id: true }
);

const knowledgeSourceSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    type: {
      type: String,
      enum: Object.values(KNOWLEDGE_SOURCE_TYPE),
      required: true,
    },
    // Conteúdo original
    content: {
      type: String,
      maxlength: 1000000, // 1MB de texto
    },
    url: {
      type: String,
    },
    // Para uploads de arquivo
    file: {
      originalName: String,
      mimeType: String,
      size: Number,
      path: String,
      s3Key: String,
    },
    // FAQs estruturadas
    faqs: [faqItemSchema],
    // Chunks processados para RAG
    chunks: [chunkSchema],
    // Status de processamento
    status: {
      type: String,
      enum: Object.values(KNOWLEDGE_STATUS),
      default: KNOWLEDGE_STATUS.PENDING,
      index: true,
    },
    processingError: {
      type: String,
    },
    processedAt: {
      type: Date,
    },
    // Estatísticas
    stats: {
      totalChunks: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      hitCount: { type: Number, default: 0 }, // Quantas vezes foi usado
    },
    // Metadata
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índices
knowledgeSourceSchema.index({ workspaceId: 1, assistantId: 1 });
knowledgeSourceSchema.index({ assistantId: 1, isActive: 1, status: 1 });

// Métodos
knowledgeSourceSchema.methods.markAsProcessing = async function () {
  this.status = KNOWLEDGE_STATUS.PROCESSING;
  return this.save();
};

knowledgeSourceSchema.methods.markAsReady = async function (chunks) {
  this.status = KNOWLEDGE_STATUS.READY;
  this.chunks = chunks;
  this.processedAt = new Date();
  this.stats.totalChunks = chunks.length;
  this.stats.totalTokens = chunks.reduce((acc, c) => acc + (c.content.length / 4), 0);
  return this.save();
};

knowledgeSourceSchema.methods.markAsError = async function (error) {
  this.status = KNOWLEDGE_STATUS.ERROR;
  this.processingError = error.message || error;
  return this.save();
};

knowledgeSourceSchema.methods.incrementHitCount = async function () {
  return this.updateOne({ $inc: { 'stats.hitCount': 1 } });
};

knowledgeSourceSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    assistantId: this.assistantId,
    name: this.name,
    type: this.type,
    url: this.url,
    file: this.file ? {
      originalName: this.file.originalName,
      mimeType: this.file.mimeType,
      size: this.file.size,
    } : null,
    faqCount: this.faqs?.length || 0,
    status: this.status,
    processingError: this.processingError,
    processedAt: this.processedAt,
    stats: this.stats,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Statics
knowledgeSourceSchema.statics.getReadySources = function (assistantId) {
  return this.find({
    assistantId,
    isActive: true,
    status: KNOWLEDGE_STATUS.READY,
  });
};

const KnowledgeSource = mongoose.model('KnowledgeSource', knowledgeSourceSchema);

module.exports = KnowledgeSource;