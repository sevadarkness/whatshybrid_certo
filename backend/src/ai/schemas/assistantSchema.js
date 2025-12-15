/**
 * @fileoverview Schemas de validação para Assistant
 * @module ai/schemas/assistantSchema
 */

const Joi = require('joi');
const {
  AI_PROVIDER,
  ASSISTANT_TYPE,
  RESPONSE_MODE,
  KNOWLEDGE_SOURCE_TYPE,
} = require('../constants/aiConstants');

/**
 * Schema de criação de assistente
 */
const createAssistantSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().max(500),
  type: Joi.string()
    .valid(...Object.values(ASSISTANT_TYPE))
    .default(ASSISTANT_TYPE.GENERAL),
  provider: Joi.string()
    .valid(...Object.values(AI_PROVIDER))
    .default(AI_PROVIDER.OPENAI),
  model: Joi.string().required(),
  systemPrompt: Joi.string().max(10000).required(),
  responseMode: Joi.string()
    .valid(...Object.values(RESPONSE_MODE))
    .default(RESPONSE_MODE.AUTOMATIC),
  config: Joi.object({
    temperature: Joi.number().min(0).max(2).default(0.7),
    maxTokens: Joi.number().min(1).max(128000).default(1024),
    topP: Joi.number().min(0).max(1).default(1),
    frequencyPenalty: Joi.number().min(-2).max(2).default(0),
    presencePenalty: Joi.number().min(-2).max(2).default(0),
  }),
  personality: Joi.object({
    tone: Joi.string().valid('formal', 'casual', 'friendly', 'professional').default('professional'),
    language: Joi.string().default('pt-BR'),
    emoji: Joi.boolean().default(false),
  }),
  capabilities: Joi.object({
    canTransferToHuman: Joi.boolean().default(true),
    canScheduleMeeting: Joi.boolean().default(false),
    canCollectLead: Joi.boolean().default(true),
    canAccessKnowledge: Joi.boolean().default(true),
  }),
  channels: Joi.array().items(Joi.string().hex().length(24)),
  fallbackMessage: Joi.string().max(1000),
  isActive: Joi.boolean().default(true),
});

/**
 * Schema de atualização de assistente
 */
const updateAssistantSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  description: Joi.string().max(500).allow(''),
  type: Joi.string().valid(...Object.values(ASSISTANT_TYPE)),
  provider: Joi.string().valid(...Object.values(AI_PROVIDER)),
  model: Joi.string(),
  systemPrompt: Joi.string().max(10000),
  responseMode: Joi.string().valid(...Object.values(RESPONSE_MODE)),
  config: Joi.object({
    temperature: Joi.number().min(0).max(2),
    maxTokens: Joi.number().min(1).max(128000),
    topP: Joi.number().min(0).max(1),
    frequencyPenalty: Joi.number().min(-2).max(2),
    presencePenalty: Joi.number().min(-2).max(2),
  }),
  personality: Joi.object({
    tone: Joi.string().valid('formal', 'casual', 'friendly', 'professional'),
    language: Joi.string(),
    emoji: Joi.boolean(),
  }),
  capabilities: Joi.object({
    canTransferToHuman: Joi.boolean(),
    canScheduleMeeting: Joi.boolean(),
    canCollectLead: Joi.boolean(),
    canAccessKnowledge: Joi.boolean(),
  }),
  channels: Joi.array().items(Joi.string().hex().length(24)),
  fallbackMessage: Joi.string().max(1000).allow(''),
  isActive: Joi.boolean(),
}).min(1);

/**
 * Schema de fonte de conhecimento
 */
const createKnowledgeSourceSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  type: Joi.string()
    .valid(...Object.values(KNOWLEDGE_SOURCE_TYPE))
    .required(),
  content: Joi.when('type', {
    is: KNOWLEDGE_SOURCE_TYPE.TEXT,
    then: Joi.string().max(100000).required(),
    otherwise: Joi.string().allow(''),
  }),
  url: Joi.when('type', {
    is: KNOWLEDGE_SOURCE_TYPE.URL,
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().allow(''),
  }),
  faqs: Joi.when('type', {
    is: KNOWLEDGE_SOURCE_TYPE.FAQ,
    then: Joi.array().items(
      Joi.object({
        question: Joi.string().required(),
        answer: Joi.string().required(),
        keywords: Joi.array().items(Joi.string()),
      })
    ).min(1).required(),
    otherwise: Joi.array(),
  }),
  metadata: Joi.object(),
});

/**
 * Schema de chat com assistente
 */
const chatSchema = Joi.object({
  message: Joi.string().max(10000).required(),
  conversationId: Joi.string().hex().length(24),
  contactId: Joi.string().hex().length(24),
  context: Joi.object({
    previousMessages: Joi.array().items(
      Joi.object({
        role: Joi.string().valid('user', 'assistant').required(),
        content: Joi.string().required(),
      })
    ),
    contactInfo: Joi.object(),
    dealInfo: Joi.object(),
  }),
});

/**
 * Schema de params
 */
const assistantIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const knowledgeIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
  knowledgeId: Joi.string().hex().length(24).required(),
});

module.exports = {
  createAssistantSchema,
  updateAssistantSchema,
  createKnowledgeSourceSchema,
  chatSchema,
  assistantIdParamSchema,
  knowledgeIdParamSchema,
};