/**
 * @fileoverview Service de integração com Stripe
 * @module billing/services/StripeService
 */

const Stripe = require('stripe');
const config = require('../../config');
const logger = require('../../infra/logging/Logger');
const { PLAN_CONFIG, TRIAL_DAYS, CURRENCY } = require('../constants/billingConstants');

class StripeService {
  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16',
    });
  }

  /**
   * Cria ou obtém customer
   * @param {Object} data - Dados do customer
   * @returns {Promise<Stripe.Customer>}
   */
  async createOrGetCustomer(data) {
    const { email, name, workspaceId, customerId } = data;

    if (customerId) {
      try {
        return await this.stripe.customers.retrieve(customerId);
      } catch (error) {
        // Customer não existe mais, cria novo
      }
    }

    // Busca por email
    const existingCustomers = await this.stripe.customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0];
    }

    // Cria novo customer
    return this.stripe.customers.create({
      email,
      name,
      metadata: {
        workspaceId,
      },
    });
  }

  /**
   * Cria sessão de checkout
   * @param {Object} options - Opções
   * @returns {Promise<Stripe.Checkout.Session>}
   */
  async createCheckoutSession(options) {
    const {
      customerId,
      priceId,
      successUrl,
      cancelUrl,
      workspaceId,
      trialDays = TRIAL_DAYS,
      metadata = {},
    } = options;

    const sessionConfig = {
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card', 'boleto'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        workspaceId,
        ...metadata,
      },
      subscription_data: {
        metadata: {
          workspaceId,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    };

    // Adiciona trial se aplicável
    if (trialDays > 0) {
      sessionConfig.subscription_data.trial_period_days = trialDays;
    }

    return this.stripe.checkout.sessions.create(sessionConfig);
  }

  /**
   * Cria sessão do portal do cliente
   * @param {string} customerId - ID do customer
   * @param {string} returnUrl - URL de retorno
   * @returns {Promise<Stripe.BillingPortal.Session>}
   */
  async createPortalSession(customerId, returnUrl) {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  /**
   * Obtém subscription
   * @param {string} subscriptionId - ID da subscription
   * @returns {Promise<Stripe.Subscription>}
   */
  async getSubscription(subscriptionId) {
    return this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice', 'default_payment_method'],
    });
  }

  /**
   * Atualiza subscription
   * @param {string} subscriptionId - ID da subscription
   * @param {Object} data - Dados para atualizar
   * @returns {Promise<Stripe.Subscription>}
   */
  async updateSubscription(subscriptionId, data) {
    return this.stripe.subscriptions.update(subscriptionId, data);
  }

  /**
   * Cancela subscription
   * @param {string} subscriptionId - ID da subscription
   * @param {Object} options - Opções
   * @returns {Promise<Stripe.Subscription>}
   */
  async cancelSubscription(subscriptionId, options = {}) {
    if (options.immediately) {
      return this.stripe.subscriptions.cancel(subscriptionId);
    }

    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      metadata: {
        cancelReason: options.reason,
        cancelFeedback: options.feedback,
      },
    });
  }

  /**
   * Reativa subscription
   * @param {string} subscriptionId - ID da subscription
   * @returns {Promise<Stripe.Subscription>}
   */
  async reactivateSubscription(subscriptionId) {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  }

  /**
   * Altera plano
   * @param {string} subscriptionId - ID da subscription
   * @param {string} newPriceId - ID do novo preço
   * @returns {Promise<Stripe.Subscription>}
   */
  async changePlan(subscriptionId, newPriceId) {
    const subscription = await this.getSubscription(subscriptionId);
    
    return this.stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    });
  }

  /**
   * Lista invoices do customer
   * @param {string} customerId - ID do customer
   * @param {Object} options - Opções
   * @returns {Promise<Stripe.Invoice[]>}
   */
  async listInvoices(customerId, options = {}) {
    const result = await this.stripe.invoices.list({
      customer: customerId,
      limit: options.limit || 10,
      starting_after: options.startingAfter,
    });

    return result.data;
  }

  /**
   * Obtém invoice
   * @param {string} invoiceId - ID da invoice
   * @returns {Promise<Stripe.Invoice>}
   */
  async getInvoice(invoiceId) {
    return this.stripe.invoices.retrieve(invoiceId);
  }

  /**
   * Obtém próxima invoice
   * @param {string} subscriptionId - ID da subscription
   * @returns {Promise<Stripe.Invoice>}
   */
  async getUpcomingInvoice(subscriptionId) {
    try {
      return await this.stripe.invoices.retrieveUpcoming({
        subscription: subscriptionId,
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Cria usage record
   * @param {string} subscriptionItemId - ID do item da subscription
   * @param {number} quantity - Quantidade
   * @returns {Promise<Stripe.UsageRecord>}
   */
  async createUsageRecord(subscriptionItemId, quantity) {
    return this.stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity,
      timestamp: Math.floor(Date.now() / 1000),
      action: 'increment',
    });
  }

  /**
   * Verifica assinatura do webhook
   * @param {string} payload - Payload do webhook
   * @param {string} signature - Assinatura
   * @returns {Stripe.Event}
   */
  constructWebhookEvent(payload, signature) {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripe.webhookSecret
    );
  }

  /**
   * Obtém preço por ID do plano
   * @param {string} plan - Nome do plano
   * @returns {string|null}
   */
  getPriceIdForPlan(plan) {
    return PLAN_CONFIG[plan]?.priceId || null;
  }
}

module.exports = new StripeService();