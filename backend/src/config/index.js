/**
 * Central config loader/aggregator used by the v2 modules.
 *
 * This project has two "layers":
 * - Legacy endpoints (Prisma/SQLite) used by the extension.
 * - v2 modules (Mongo/Redis/advanced services) that were added from the provided .txt.
 *
 * The v2 modules expect `require('../../config')` to resolve to an object with
 * `jwt`, `stripe`, `ai`, etc. This file provides that single source of truth.
 *
 * SECURITY NOTE:
 * Never hardcode real credentials here. Use environment variables.
 */

const crypto = require('crypto');
const env = require('./env');

function deriveRefreshSecret(secret) {
  // deterministic derivation to avoid storing two secrets in dev;
  // in production you SHOULD provide JWT_REFRESH_SECRET.
  return crypto.createHash('sha256').update(String(secret) + ':refresh').digest('hex');
}

const OPENAI_DEFAULT_MODEL = process.env.OPENAI_MODEL || process.env.OPENAI_MODEL_REPLY || 'gpt-4o';

const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.IS_PRODUCTION,
  port: env.PORT,

  baseUrl: process.env.BASE_URL || process.env.APP_URL || `http://localhost:${env.PORT}`,

  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET || deriveRefreshSecret(env.JWT_SECRET),
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  redis: {
    url: env.REDIS_URL,
  },

  mongo: {
    uri: env.MONGO_URI,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    priceId: process.env.STRIPE_PRICE_ID || '',
    successUrl: process.env.STRIPE_SUCCESS_URL || '',
    cancelUrl: process.env.STRIPE_CANCEL_URL || '',
  },

  email: {
    provider: process.env.EMAIL_PROVIDER || 'log', // log | ...
    from: process.env.EMAIL_FROM || 'no-reply@localhost',
    baseUrl: process.env.APP_URL || process.env.BASE_URL || `http://localhost:${env.PORT}`,
  },

  ai: {
    provider: process.env.AI_PROVIDER || env.LLM_PROVIDER || 'openai',

    openai: {
      apiKey: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '',
      models: {
        chat: OPENAI_DEFAULT_MODEL,
        assistant: process.env.OPENAI_MODEL_ASSISTANT || 'gpt-4o',
        embedding: process.env.OPENAI_MODEL_EMBEDDING || 'text-embedding-3-small',
      },
    },

    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      models: {
        chat: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620',
      },
    },

    google: {
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
      models: {
        chat: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
      },
    },

    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
      models: {
        chat: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
      },
    },
  },
};

module.exports = config;
