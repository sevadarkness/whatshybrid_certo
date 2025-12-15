/**
 * @fileoverview Schemas de validação para Knowledge Base
 * @module ai/schemas/knowledgeBaseSchema
 */

const Joi = require('joi');
const { KNOWLEDGE_SOURCE_TYPE } = require('../constants/aiConstants');

/**
 * Schema de criação de knowledge base
 */
const createKnowledgeBaseSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().max(500),
  settings: Joi.object({
    chunkSize: Joi.number().min(100).max(5000).default(1000),
    chunkOverlap: Joi.number().min(0).max(1000).default(200),
    embeddingModel: Joi.string().default('text-embedding-3-small'),
  }),
});

/**
 * Schema de atualização de knowledge base
 */
const updateKnowledgeBaseSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  description: Joi.string().max(500),
  settings: Joi.object({
    chunkSize: Joi.number().min(100).max(5000),
    chunkOverlap: Joi.number().min(0).max(1000),
    embeddingModel: Joi.string(),
  }),
  isActive: Joi.boolean(),
}).min(1);

/**
 * Schema de adição de fonte
 */
const addSourceSchema = Joi.object({
  type: Joi.string()
    .valid(...Object.values(KNOWLEDGE_SOURCE_TYPE))
    .required(),
  name: Joi.string().trim().max(200).required(),
  content: Joi.when('type', {
    is: KNOWLEDGE_SOURCE_TYPE.TEXT,
    then: Joi.string().max(100000).required(),
    otherwise: Joi.forbidden(),
  }),
  url: Joi.when('type', {
    is: KNOWLEDGE_SOURCE_TYPE.URL,
    then: Joi.string().uri().required(),
    otherwise: Joi.forbidden(),
  }),
  fileId: Joi.when('type', {
    is: KNOWLEDGE_SOURCE_TYPE.FILE,
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
  faqs: Joi.when('type', {
    is: KNOWLEDGE_SOURCE_TYPE.FAQ,
    then: Joi.array()
      .items(
        Joi.object({
          question: Joi.string().required(),
          answer: Joi.string().required(),
        })
      )
      .min(1)
      .required(),
    otherwise: Joi.forbidden(),
  }),
  metadata: Joi.object(),
});

/**
 * Schema de busca
 */
const searchSchema = Joi.object({
  query: Joi.string().max(1000).required(),
  topK: Joi.number().min(1).max(50).default(5),
  scoreThreshold: Joi.number().min(0).max(1).default(0.7),
  filter: Joi.object({
    sourceIds: Joi.array().items(Joi.string()),
    metadata: Joi.object(),
  }),
});

/**
 * Schema de params
 */
const knowledgeBaseIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const sourceIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
  sourceId: Joi.string().hex().length(24).required(),
});

module.exports = {
  createKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
  addSourceSchema,
  searchSchema,
  knowledgeBaseIdParamSchema,
  sourceIdParamSchema,
};