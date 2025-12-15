/**
 * @fileoverview Model de Knowledge Chunk (vetores)
 * @module ai/models/KnowledgeChunk
 */

const mongoose = require('mongoose');

const knowledgeChunkSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    knowledgeBaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeBase',
      required: true,
      index: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
    metadata: {
      sourceName: String,
      sourceType: String,
      chunkIndex: Number,
      startChar: Number,
      endChar: Number,
      custom: mongoose.Schema.Types.Mixed,
    },
    tokenCount: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Índice para busca vetorial (MongoDB Atlas Vector Search)
knowledgeChunkSchema.index(
  { embedding: 'vectorSearch' },
  {
    name: 'vector_index',
    vectorSearchOptions: {
      type: 'vector',
      path: 'embedding',
      numDimensions: 1536,
      similarity: 'cosine',
    },
  }
);

// Índice composto
knowledgeChunkSchema.index({ knowledgeBaseId: 1, sourceId: 1 });

// Statics
knowledgeChunkSchema.statics.vectorSearch = async function (
  workspaceId,
  knowledgeBaseIds,
  queryEmbedding,
  options = {}
) {
  const { topK = 5, scoreThreshold = 0.7 } = options;

  // Pipeline de agregação para vector search
  const pipeline = [
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: topK * 10,
        limit: topK,
        filter: {
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
          knowledgeBaseId: { $in: knowledgeBaseIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
    },
    {
      $project: {
        content: 1,
        metadata: 1,
        knowledgeBaseId: 1,
        sourceId: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
    {
      $match: {
        score: { $gte: scoreThreshold },
      },
    },
  ];

  return this.aggregate(pipeline);
};

knowledgeChunkSchema.statics.deleteBySource = function (knowledgeBaseId, sourceId) {
  return this.deleteMany({ knowledgeBaseId, sourceId });
};

knowledgeChunkSchema.statics.deleteByKnowledgeBase = function (knowledgeBaseId) {
  return this.deleteMany({ knowledgeBaseId });
};

const KnowledgeChunk = mongoose.model('KnowledgeChunk', knowledgeChunkSchema);

module.exports = KnowledgeChunk;