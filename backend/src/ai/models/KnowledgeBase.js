/**
 * @fileoverview Model de Knowledge Base
 * @module ai/models/KnowledgeBase
 */

const mongoose = require('mongoose');
const {
  KNOWLEDGE_STATUS,
  KNOWLEDGE_SOURCE_TYPE,
  AI_DEFAULTS,
} = require('../constants/aiConstants');

const knowledgeSourceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: Object.values(KNOWLEDGE_SOURCE_TYPE),
      required: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: Object.values(KNOWLEDGE_STATUS),
      default: KNOWLEDGE_STATUS.PENDING,
    },
    // Dados da fonte
    content: { type: String }, // Para tipo TEXT
    url: { type: String }, // Para tipo URL
    fileId: { type: String }, // Para tipo FILE
    filePath: { type: String },
    mimeType: { type: String },
    // Métricas
    chunkCount: { type: Number, default: 0 },
    tokenCount: { type: Number, default: 0 },
    characterCount: { type: Number, default: 0 },
    // Metadados
    metadata: { type: mongoose.Schema.Types.Mixed },
    // Processamento
    processedAt: { type: Date },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

const knowledgeBaseSchema = new mongoose.Schema(
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
    sources: [knowledgeSourceSchema],
    settings: {
      chunkSize: { type: Number, default: AI_DEFAULTS.CHUNK_SIZE },
      chunkOverlap: { type: Number, default: AI_DEFAULTS.CHUNK_OVERLAP },
      embeddingModel: { type: String, default: 'text-embedding-3-small' },
    },
    // Métricas agregadas
    stats: {
      totalSources: { type: Number, default: 0 },
      totalChunks: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      lastUpdated: { type: Date },
    },
    // Vector store reference
    vectorStoreId: {
      type: String,
    },
    vectorStoreProvider: {
      type: String,
      enum: ['pinecone', 'qdrant', 'weaviate', 'chroma', 'mongodb'],
      default: 'mongodb',
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
knowledgeBaseSchema.index({ workspaceId: 1, name: 1 });

// Soft delete filter
knowledgeBaseSchema.pre(/^^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});

// Métodos
knowledgeBaseSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    description: this.description,
    sources: this.sources.map((s) => ({
      id: s._id,
      type: s.type,
      name: s.name,
      status: s.status,
      chunkCount: s.chunkCount,
      tokenCount: s.tokenCount,
      processedAt: s.processedAt,
      errorMessage: s.errorMessage,
      createdAt: s.createdAt,
    })),
    settings: this.settings,
    stats: this.stats,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

knowledgeBaseSchema.methods.addSource = async function (sourceData) {
  this.sources.push(sourceData);
  this.stats.totalSources = this.sources.length;
  return this.save();
};

knowledgeBaseSchema.methods.updateSourceStatus = async function (sourceId, status, data = {}) {
  const source = this.sources.id(sourceId);
  if (source) {
    source.status = status;
    if (data.chunkCount !== undefined) source.chunkCount = data.chunkCount;
    if (data.tokenCount !== undefined) source.tokenCount = data.tokenCount;
    if (data.characterCount !== undefined) source.characterCount = data.characterCount;
    if (data.errorMessage) source.errorMessage = data.errorMessage;
    if (status === KNOWLEDGE_STATUS.READY) source.processedAt = new Date();
    
    await this.save();
    await this.recalculateStats();
  }
  return source;
};

knowledgeBaseSchema.methods.removeSource = async function (sourceId) {
  this.sources.pull(sourceId);
  this.stats.totalSources = this.sources.length;
  await this.save();
  await this.recalculateStats();
};

knowledgeBaseSchema.methods.recalculateStats = async function () {
  const readySources = this.sources.filter((s) => s.status === KNOWLEDGE_STATUS.READY);
  
  this.stats.totalSources = this.sources.length;
  this.stats.totalChunks = readySources.reduce((sum, s) => sum + (s.chunkCount || 0), 0);
  this.stats.totalTokens = readySources.reduce((sum, s) => sum + (s.tokenCount || 0), 0);
  this.stats.lastUpdated = new Date();
  
  return this.save();
};

const KnowledgeBase = mongoose.model('KnowledgeBase', knowledgeBaseSchema);

module.exports = KnowledgeBase;