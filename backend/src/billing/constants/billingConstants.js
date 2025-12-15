/**
 * @fileoverview Constantes do módulo Billing
 * @module billing/constants/billingConstants
 */

/**
 * Planos disponíveis
 */
const PLAN = Object.freeze({
  FREE: 'free',
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
});

/**
 * Detalhes dos planos
 */
const PLAN_DETAILS = Object.freeze({
  [PLAN.FREE]: {
    name: 'Free',
    price: 0,
    priceYearly: 0,
    currency: 'BRL',
    features: {
      members: 2,
      contacts: 500,
      channels: 1,
      messagesPerMonth: 1000,
      storage: 500 * 1024 * 1024, // 500MB
      aiMessages: 50,
      aiAssistants: 1,
      customFields: 5,
      pipelines: 1,
      integrations: 0,
      support: 'community',
      analytics: 'basic',
      whiteLabel: false,
      api: false,
    },
  },
  [PLAN.STARTER]: {
    name: 'Starter',
    price: 97,
    priceYearly: 970,
    currency: 'BRL',
    stripeProductId: 'prod_starter',
    stripePriceIdMonthly: 'price_starter_monthly',
    stripePriceIdYearly: 'price_starter_yearly',
    features: {
      members: 5,
      contacts: 5000,
      channels: 3,
      messagesPerMonth: 10000,
      storage: 5 * 1024 * 1024 * 1024, // 5GB
      aiMessages: 500,
      aiAssistants: 3,
      customFields: 20,
      pipelines: 3,
      integrations: 5,
      support: 'email',
      analytics: 'standard',
      whiteLabel: false,
      api: true,
    },
  },
  [PLAN.PROFESSIONAL]: {
    name: 'Professional',
    price: 297,
    priceYearly: 2970,
    currency: 'BRL',
    stripeProductId: 'prod_professional',
    stripePriceIdMonthly: 'price_professional_monthly',
    stripePriceIdYearly: 'price_professional_yearly',
    features: {
      members: 15,
      contacts: 25000,
      channels: 10,
      messagesPerMonth: 50000,
      storage: 25 * 1024 * 1024 * 1024, // 25GB
      aiMessages: 5000,
      aiAssistants: 10,
      customFields: 50,
      pipelines: 10,
      integrations: -1, // ilimitado
      support: 'priority',
      analytics: 'advanced',
      whiteLabel: true,
      api: true,
    },
  },
  [PLAN.ENTERPRISE]: {
    name: 'Enterprise',
    price: null, // Personalizado
    priceYearly: null,
    currency: 'BRL',
    features: {
      members: -1,
      contacts: -1,
      channels: -1,
      messagesPerMonth: -1,
      storage: -1,
      aiMessages: -1,
      aiAssistants: -1,
      customFields: -1,
      pipelines: -1,
      integrations: -1,
      support: 'dedicated',
      analytics: 'custom',
      whiteLabel: true,
      api: true,
      sla: true,
      onboarding: true,
    },
  },
});

/**
 * Status de assinatura
 */
const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  TRIALING: 'trialing',
  UNPAID: 'unpaid',
  INCOMPLETE: 'incomplete',
});

/**
 * Ciclos de cobrança
 */
const BILLING_CYCLE = Object.freeze({
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
});

/**
 * Status de fatura
 */
const INVOICE_STATUS = Object.freeze({
  DRAFT: 'draft',
  OPEN: 'open',
  PAID: 'paid',
  VOID: 'void',
  UNCOLLECTIBLE: 'uncollectible',
});

/**
 * Tipos de evento de uso
 */
const USAGE_EVENT = Object.freeze({
  MESSAGE_SENT: 'message_sent',
  AI_MESSAGE: 'ai_message',
  CONTACT_CREATED: 'contact_created',
  STORAGE_USED: 'storage_used',
});

module.exports = {
  PLAN,
  PLAN_DETAILS,
  SUBSCRIPTION_STATUS,
  BILLING_CYCLE,
  INVOICE_STATUS,
  USAGE_EVENT,
};