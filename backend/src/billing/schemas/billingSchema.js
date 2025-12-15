/**
 * @fileoverview Schemas de validação para Billing
 * @module billing/schemas/billingSchema
 */

const Joi = require('joi');
const { PLAN, BILLING_CYCLE } = require('../constants/billingConstants');

/**
 * Schema de criação de assinatura
 */
const createSubscriptionSchema = Joi.object({
  plan: Joi.string()
    .valid(...Object.values(PLAN).filter((p) => p !== PLAN.FREE))
    .required(),
  billingCycle: Joi.string()
    .valid(...Object.values(BILLING_CYCLE))
    .default(BILLING_CYCLE.MONTHLY),
  paymentMethodId: Joi.string(),
  couponCode: Joi.string(),
});

/**
 * Schema de atualização de assinatura
 */
const updateSubscriptionSchema = Joi.object({
  plan: Joi.string()
    .valid(...Object.values(PLAN).filter((p) => p !== PLAN.FREE)),
  billingCycle: Joi.string()
    .valid(...Object.values(BILLING_CYCLE)),
}).min(1);

/**
 * Schema de método de pagamento
 */
const paymentMethodSchema = Joi.object({
  paymentMethodId: Joi.string().required(),
  setAsDefault: Joi.boolean().default(true),
});

/**
 * Schema de portal do cliente
 */
const customerPortalSchema = Joi.object({
  returnUrl: Joi.string().uri().required(),
});

module.exports = {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  paymentMethodSchema,
  customerPortalSchema,
};