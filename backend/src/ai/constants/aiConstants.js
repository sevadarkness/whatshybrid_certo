/**
 * @fileoverview Constantes do módulo AI
 * @module ai/constants/aiConstants
 */

/**
 * Providers de LLM suportados
 */
const AI_PROVIDER = Object.freeze({
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  GROQ: 'groq',
  OLLAMA: 'ollama',
  CUSTOM: 'custom',
});

/**
 * Modelos disponíveis por provider
 */
const AI_MODELS = Object.freeze({
  [AI_PROVIDER.OPENAI]: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, costPer1kInput: 0.005, costPer1kOutput: 0.015 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006 },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, costPer1kInput: 0.01, costPer1kOutput: 0.03 },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextWindow: 16385, costPer1kInput: 0.0005, costPer1kOutput: 0.0015 },
  ],
  [AI_PROVIDER.ANTHROPIC]: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015 },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.075 },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000, costPer1kInput: 0.00025, costPer1kOutput: 0.00125 },
  ],
  [AI_PROVIDER.GOOGLE]: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 1000000, costPer1kInput: 0.00125, costPer1kOutput: 0.005 },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1000000, costPer1kInput: 0.000075, costPer1kOutput: 0.0003 },
  ],
  [AI_PROVIDER.GROQ]: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 128000, costPer1kInput: 0.00059, costPer1kOutput: 0.00079 },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', contextWindow: 128000, costPer1kInput: 0.00005, costPer1kOutput: 0.00008 },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', contextWindow: 32768, costPer1kInput: 0.00024, costPer1kOutput: 0.00024 },
  ],
});

/**
 * Tipos de assistente
 */
const ASSISTANT_TYPE = Object.freeze({
  GENERAL: 'general',
  SALES: 'sales',
  SUPPORT: 'support',
  ONBOARDING: 'onboarding',
  FAQ: 'faq',
  CUSTOM: 'custom',
});

/**
 * Modos de resposta do assistente
 */
const RESPONSE_MODE = Object.freeze({
  AUTOMATIC: 'automatic', // Responde automaticamente
  SUGGESTION: 'suggestion', // Sugere resposta para agente
  HYBRID: 'hybrid', // Automático fora do horário, sugestão durante
});

/**
 * Status do assistente
 */
const ASSISTANT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  TRAINING: 'training',
  ERROR: 'error',
});

/**
 * Tipos de fonte de conhecimento
 */
const KNOWLEDGE_SOURCE_TYPE = Object.freeze({
  FILE: 'file',
  URL: 'url',
  TEXT: 'text',
  FAQ: 'faq',
  API: 'api',
});

/**
 * Status de processamento de fonte
 */
const KNOWLEDGE_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  READY: 'ready',
  ERROR: 'error',
});

/**
 * Configurações padrão
 */
const DEFAULT_AI_CONFIG = Object.freeze({
  temperature: 0.7,
  maxTokens: 1024,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
});

/**
 * Limites por plano
 */
const AI_LIMITS = Object.freeze({
  free: {
    assistants: 1,
    messagesPerMonth: 100,
    knowledgeSources: 3,
    knowledgeSizeMB: 10,
  },
  starter: {
    assistants: 3,
    messagesPerMonth: 1000,
    knowledgeSources: 10,
    knowledgeSizeMB: 50,
  },
  professional: {
    assistants: 10,
    messagesPerMonth: 10000,
    knowledgeSources: 50,
    knowledgeSizeMB: 500,
  },
  enterprise: {
    assistants: -1, // ilimitado
    messagesPerMonth: -1,
    knowledgeSources: -1,
    knowledgeSizeMB: 5000,
  },
});

module.exports = {
  AI_PROVIDER,
  AI_MODELS,
  ASSISTANT_TYPE,
  RESPONSE_MODE,
  ASSISTANT_STATUS,
  KNOWLEDGE_SOURCE_TYPE,
  KNOWLEDGE_STATUS,
  DEFAULT_AI_CONFIG,
  AI_LIMITS,
};