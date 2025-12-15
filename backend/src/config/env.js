/**
 * @fileoverview Configuração e validação de variáveis de ambiente
 * @module config/env
 *
 * ✅ Full-mode build:
 * - Não bloqueia o boot quando o usuário ainda não preencheu chaves.
 * - Usa defaults seguros/"CHANGE_ME" (o usuário substitui depois no .env).
 * - Evita validações que rejeitam esquemas como mongodb:// e redis://.
 */

const Joi = require('joi');

// Helpers
const DEFAULT_JWT_SECRET = 'CHANGE_ME__JWT_SECRET_MIN_32_CHARS__CHANGE_ME';
const DEFAULT_JWT_REFRESH_SECRET = 'CHANGE_ME__JWT_REFRESH_SECRET_MIN_32_CHARS__CHANGE_ME';
const DEFAULT_ENCRYPTION_KEY = '0'.repeat(64); // 64 hex chars placeholder

/**
 * Schema de validação das variáveis de ambiente.
 *
 * Observação: a validação aqui é "leniente" por design, para permitir
 * placeholders e garantir que o projeto suba sem precisar expor credenciais.
 */
const envSchema = Joi.object({
  // Ambiente
  NODE_ENV: Joi.string().valid('development', 'production', 'test', 'staging').default('development'),

  // Servidor
  PORT: Joi.number().integer().min(1).max(65535).default(4000),
  HOST: Joi.string().default('0.0.0.0'),
  JSON_LIMIT: Joi.string().default('50mb'),

  // Database (Mongo/Mongoose) - não exige uri() para aceitar mongodb://
  MONGO_URI: Joi.string().allow('').default('mongodb://127.0.0.1:27017/whatsHybrid'),
  MONGO_DB_NAME: Joi.string().default('whatsHybrid'),

  // Redis
  REDIS_URL: Joi.string().allow('').default('redis://127.0.0.1:6379'),
  REDIS_PREFIX: Joi.string().default('whcrm:'),

  // Autenticação
  JWT_SECRET: Joi.string().min(32).default(DEFAULT_JWT_SECRET),
  JWT_REFRESH_SECRET: Joi.string().min(32).default(DEFAULT_JWT_REFRESH_SECRET),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  // Criptografia (hex 64)
  ENCRYPTION_KEY: Joi.string().length(64).default(DEFAULT_ENCRYPTION_KEY),

  // IA / LLM (modo genérico)
  LLM_PROVIDER: Joi.string().valid('openai', 'anthropic', 'venice', 'custom').default('openai'),
  LLM_API_KEY: Joi.string().allow('').default('COLE_SUA_CHAVE_LLM_AQUI'),
  LLM_BASE_URL: Joi.string().allow('').default(''),
  LLM_MODEL: Joi.string().default('gpt-4o'),
  LLM_TIMEOUT: Joi.number().integer().min(1000).default(30000),

  // OpenAI (modo específico - usado no v1 e v2)
  OPENAI_API_KEY: Joi.string().allow('').default('COLE_SUA_OPENAI_API_KEY_AQUI'),
  OPENAI_MODEL: Joi.string().default('gpt-4o'),
  OPENAI_ORG_ID: Joi.string().allow('').default(''),
  OPENAI_PROJECT_ID: Joi.string().allow('').default(''),

  // Anthropic (opcional)
  ANTHROPIC_API_KEY: Joi.string().allow('').default(''),

  // Google / Gemini (opcional)
  GOOGLE_API_KEY: Joi.string().allow('').default(''),

  // Groq (opcional)
  GROQ_API_KEY: Joi.string().allow('').default(''),

  // Stripe
  STRIPE_SECRET_KEY: Joi.string().allow('').default('sk_test_COLE_SUA_CHAVE_AQUI'),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default('whsec_COLE_SUA_CHAVE_AQUI'),
  STRIPE_PUBLISHABLE_KEY: Joi.string().allow('').default('pk_test_COLE_SUA_CHAVE_AQUI'),

  // WhatsApp (Cloud API)
  WHATSAPP_API_BASE_URL: Joi.string().allow('').default('https://graph.facebook.com/v19.0'),
  WHATSAPP_BUSINESS_PHONE_ID: Joi.string().allow('').default('SEU_WHATSAPP_PHONE_NUMBER_ID_AQUI'),
  WHATSAPP_ACCESS_TOKEN: Joi.string().allow('').default('SEU_WHATSAPP_ACCESS_TOKEN_AQUI'),

  // WhatsApp (Evolution/Baileys) - opcional
  WHATSAPP_API_URL: Joi.string().allow('').default(''),
  WHATSAPP_API_KEY: Joi.string().allow('').default(''),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'pretty').default('json'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(60000),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(100),

  // Feature Flags
  ENABLE_AI: Joi.boolean().default(true),
  ENABLE_WEBHOOKS: Joi.boolean().default(true),
  ENABLE_V2: Joi.boolean().default(true),
  MAINTENANCE_MODE: Joi.boolean().default(false),

  // App
  APP_NAME: Joi.string().default('WhatsApp Hybrid CRM'),
  APP_URL: Joi.string().allow('').default('http://localhost:4000'),
  CORS_ORIGINS: Joi.string().default('*'),

  // Email (opcional)
  EMAIL_FROM: Joi.string().allow('').default('no-reply@SEU-DOMINIO.com'),
  EMAIL_PROVIDER: Joi.string().valid('log', 'smtp', 'resend', 'sendgrid').default('log'),
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().integer().allow(null).default(587),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),

  // Segurança/Extensão
  EXTENSION_SHARED_KEY: Joi.string().allow('').default('COLE_SUA_EXTENSION_SHARED_KEY_AQUI'),
  ADMIN_TOKEN: Joi.string().allow('').default('COLE_SEU_ADMIN_TOKEN_AQUI'),

}).unknown(true);

function getLLMBaseUrl(provider) {
  const urls = {
    venice: 'https://api.venice.ai/api/v1',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    custom: '',
  };
  return urls[provider] || urls.openai;
}

/**
 * Valida e retorna as variáveis de ambiente
 *
 * Nota: mantém throw em caso de erro de validação, mas como os campos são
 * lenientes e possuem defaults, isso tende a acontecer só se valores
 * explicitamente inválidos forem informados.
 */
function validateEnv() {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    const messages = error.details.map((d) => d.message).join(', ');
    throw new Error(`Configuração inválida: ${messages}`);
  }

  return value;
}

const env = validateEnv();

module.exports = {
  // Ambiente
  NODE_ENV: env.NODE_ENV,
  IS_PRODUCTION: env.NODE_ENV === 'production',
  IS_DEVELOPMENT: env.NODE_ENV === 'development',
  IS_TEST: env.NODE_ENV === 'test',

  // Servidor
  PORT: env.PORT,
  HOST: env.HOST,
  JSON_LIMIT: env.JSON_LIMIT,

  // Database
  MONGO_URI: env.MONGO_URI,
  MONGO_DB_NAME: env.MONGO_DB_NAME,

  // Redis
  REDIS_URL: env.REDIS_URL || null,
  REDIS_PREFIX: env.REDIS_PREFIX,

  // Auth
  JWT_SECRET: env.JWT_SECRET,
  JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN: env.JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN: env.JWT_REFRESH_EXPIRES_IN,

  // Encryption
  ENCRYPTION_KEY: env.ENCRYPTION_KEY || null,

  // LLM (genérico)
  LLM: {
    PROVIDER: env.LLM_PROVIDER,
    API_KEY: env.LLM_API_KEY,
    BASE_URL: env.LLM_BASE_URL || getLLMBaseUrl(env.LLM_PROVIDER),
    MODEL: env.LLM_MODEL,
    TIMEOUT: env.LLM_TIMEOUT,
  },

  // OpenAI (específico)
  OPENAI: {
    API_KEY: env.OPENAI_API_KEY,
    MODEL: env.OPENAI_MODEL,
    ORG_ID: env.OPENAI_ORG_ID,
    PROJECT_ID: env.OPENAI_PROJECT_ID,
  },

  // Anthropic
  ANTHROPIC: {
    API_KEY: env.ANTHROPIC_API_KEY,
  },

  // Google
  GOOGLE: {
    API_KEY: env.GOOGLE_API_KEY,
  },

  // Groq
  GROQ: {
    API_KEY: env.GROQ_API_KEY,
  },

  // Stripe
  STRIPE: {
    SECRET_KEY: env.STRIPE_SECRET_KEY,
    WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY,
  },

  // WhatsApp
  WHATSAPP: {
    API_BASE_URL: env.WHATSAPP_API_BASE_URL,
    BUSINESS_PHONE_ID: env.WHATSAPP_BUSINESS_PHONE_ID,
    ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN,
    API_URL: env.WHATSAPP_API_URL,
    API_KEY: env.WHATSAPP_API_KEY,
  },

  // Logging
  LOG_LEVEL: env.LOG_LEVEL,
  LOG_FORMAT: env.LOG_FORMAT,

  // Rate limiting
  RATE_LIMIT: {
    WINDOW_MS: env.RATE_LIMIT_WINDOW_MS,
    MAX: env.RATE_LIMIT_MAX,
  },

  // Features
  FEATURES: {
    AI: env.ENABLE_AI,
    WEBHOOKS: env.ENABLE_WEBHOOKS,
    V2: env.ENABLE_V2,
    MAINTENANCE: env.MAINTENANCE_MODE,
  },

  // App
  APP: {
    NAME: env.APP_NAME,
    URL: env.APP_URL,
    CORS_ORIGINS: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  },

  // Email
  EMAIL: {
    FROM: env.EMAIL_FROM,
    PROVIDER: env.EMAIL_PROVIDER,
    SMTP: {
      HOST: env.SMTP_HOST,
      PORT: env.SMTP_PORT,
      USER: env.SMTP_USER,
      PASS: env.SMTP_PASS,
    },
  },

  // Security / extension
  EXTENSION_SHARED_KEY: env.EXTENSION_SHARED_KEY,
  ADMIN_TOKEN: env.ADMIN_TOKEN,
};
