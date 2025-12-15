/**
 * @fileoverview Service de Billing
 * @module billing/services/BillingService
 */

const Stripe = require('stripe');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const Workspace = require('../../team/models/Workspace');
const { toObjectId } = require('../../shared/utils/ids');
const AppError = require('../../shared/errors/AppError');
const { PLAN, PLAN_DETAILS, SUBSCRIPTION_STATUS, BILLING_CYCLE } = require('../constants/billingConstants');
const config = require('../../config');
const logger = require('../../infra/logging/Logger');

class BillingService {
  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey);
  }

  /**
   * Obtém ou cria assinatura
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Subscription>}
   */
  async getOrCreateSubscription(workspaceId) {
    let subscription = await Subscription.findOne({ workspaceId: toObjectId(workspaceId) });

    if (!subscription) {
      subscription = new Subscription({
        workspaceId,
        plan: PLAN.FREE,
        status: SUBSCRIPTION_STATUS.ACTIVE,
      });
      await subscription.save();
    }

    return subscription;
  }

  /**
   * Obtém assinatura
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Subscription>}
   */
  async getSubscription(workspaceId) {
    const subscription = await Subscription.findOne({ workspaceId: toObjectId(workspaceId) });
    
    if (!subscription) {
      throw AppError.notFound('Assinatura não encontrada');
    }

    return subscription;
  }

  /**
   * Cria cliente no Stripe
   * @param {string} workspaceId - ID do workspace
   * @param {Object} customerData - Dados do cliente
   * @returns {Promise<string>} Stripe customer ID
   */
  async createStripeCustomer(workspaceId, customerData) {
    const workspace = await Workspace.findById(workspaceId).populate('ownerId');
    
    if (!workspace) {
      throw AppError.notFound('Workspace', workspaceId);
    }

    const customer = await this.stripe.customers.create({
      email: workspace.ownerId.email,
      name: workspace.name,
      metadata: {
        workspaceId: workspaceId.toString(),
      },
      ...customerData,
    });

    // Atualiza assinatura com customer ID
    await Subscription.updateOne(
      { workspaceId: toObjectId(workspaceId) },
      { stripeCustomerId: customer.id }
    );

    logger.info({
      msg: 'Cliente Stripe criado',
      workspaceId,
      customerId: customer.id,
    });

    return customer.id;
  }

  /**
   * Cria assinatura paga
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados da assinatura
   * @returns {Promise<Object>}
   */
  async createPaidSubscription(workspaceId, data) {
    const { plan, billingCycle, paymentMethodId, couponCode } = data;

    const subscription = await this.getOrCreateSubscription(workspaceId);
    const planDetails = PLAN_DETAILS[plan];

    if (!planDetails || !planDetails.stripeProductId) {
      throw AppError.badRequest('Plano inválido');
    }

    // Obtém ou cria customer
    let customerId = subscription.stripeCustomerId;
    if (!customerId) {
      customerId = await this.createStripeCustomer(workspaceId);
    }

    // Anexa método de pagamento
    if (paymentMethodId) {
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      await this.stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    // Determina preço
    const priceId = billingCycle === BILLING_CYCLE.YEARLY
      ? planDetails.stripePriceIdYearly
      : planDetails.stripePriceIdMonthly;

    // Cria assinatura no Stripe
    const stripeSubscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      coupon: couponCode || undefined,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    // Atualiza assinatura local
    subscription.stripeSubscriptionId = stripeSubscription.id;
    subscription.stripePriceId = priceId;
    subscription.plan = plan;
    subscription.billingCycle = billingCycle;
    subscription.status = this.mapStripeStatus(stripeSubscription.status);
    subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    await subscription.save();

    // Atualiza limites do workspace
    await this.updateWorkspaceLimits(workspaceId, plan);

    logger.info({
      msg: 'Assinatura criada',
      workspaceId,
      plan,
      subscriptionId: stripeSubscription.id,
    });

    return {
      subscription: subscription.toPublicJSON(),
      clientSecret: stripeSubscription.latest_invoice?.payment_intent?.client_secret,
    };
  }

  /**
   * Atualiza assinatura (upgrade/downgrade)
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados da atualização
   * @returns {Promise<Subscription>}
   */
  async updateSubscription(workspaceId, data) {
    const { plan, billingCycle } = data;
    const subscription = await this.getSubscription(workspaceId);

    if (!subscription.stripeSubscriptionId) {
      throw AppError.badRequest('Nenhuma assinatura ativa para atualizar');
    }

    const planDetails = PLAN_DETAILS[plan];
    const priceId = billingCycle === BILLING_CYCLE.YEARLY
      ? planDetails.stripePriceIdYearly
      : planDetails.stripePriceIdMonthly;

    // Atualiza no Stripe
    const stripeSubscription = await this.stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{
        id: stripeSubscription.items.data[0].id,
        price: priceId,
      }],
      proration_behavior: 'create_prorations',
    });

    // Atualiza local
    subscription.plan = plan;
    subscription.billingCycle = billingCycle;
    subscription.stripePriceId = priceId;
    await subscription.save();

    // Atualiza limites
    await this.updateWorkspaceLimits(workspaceId, plan);

    logger.info({
      msg: 'Assinatura atualizada',
      workspaceId,
      plan,
    });

    return subscription;
  }

  /**
   * Cancela assinatura
   * @param {string} workspaceId - ID do workspace
   * @param {boolean} immediate - Cancelar imediatamente
   * @returns {Promise<Subscription>}
   */
  async cancelSubscription(workspaceId, immediate = false) {
    const subscription = await this.getSubscription(workspaceId);

    if (!subscription.stripeSubscriptionId) {
      throw AppError.badRequest('Nenhuma assinatura ativa para cancelar');
    }

    if (immediate) {
      await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      subscription.status = SUBSCRIPTION_STATUS.CANCELED;
      subscription.canceledAt = new Date();
    } else {
      await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      subscription.cancelAtPeriodEnd = true;
    }

    await subscription.save();

    // Se cancelamento imediato, volta para free
    if (immediate) {
      await this.updateWorkspaceLimits(workspaceId, PLAN.FREE);
    }

    logger.info({
      msg: 'Assinatura cancelada',
      workspaceId,
      immediate,
    });

    return subscription;
  }

  /**
   * Reativa assinatura
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Subscription>}
   */
  async reactivateSubscription(workspaceId) {
    const subscription = await this.getSubscription(workspaceId);

    if (!subscription.cancelAtPeriodEnd) {
      throw AppError.badRequest('Assinatura não está marcada para cancelamento');
    }

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    subscription.cancelAtPeriodEnd = false;
    await subscription.save();

    logger.info({
      msg: 'Assinatura reativada',
      workspaceId,
    });

    return subscription;
  }

  /**
   * Cria sessão do portal do cliente
   * @param {string} workspaceId - ID do workspace
   * @param {string} returnUrl - URL de retorno
   * @returns {Promise<string>}
   */
  async createCustomerPortalSession(workspaceId, returnUrl) {
    const subscription = await this.getSubscription(workspaceId);

    if (!subscription.stripeCustomerId) {
      throw AppError.badRequest('Nenhum cliente associado');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return session.url;
  }

  /**
   * Lista faturas
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções de paginação
   * @returns {Promise<Invoice[]>}
   */
  async listInvoices(workspaceId, options = {}) {
    const { page = 1, limit = 10 } = options;

    const invoices = await Invoice.find({ workspaceId: toObjectId(workspaceId) })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return invoices;
  }

  /**
   * Processa webhook do Stripe
   * @param {Object} event - Evento do Stripe
   */
  async handleWebhook(event) {
    logger.info({
      msg: 'Webhook Stripe recebido',
      type: event.type,
    });

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdate(event.data.object);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;

      default:
        logger.debug({ msg: 'Webhook não tratado', type: event.type });
    }
  }

  /**
   * Trata atualização de assinatura
   */
  async handleSubscriptionUpdate(stripeSubscription) {
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: stripeSubscription.id,
    });

    if (!subscription) {
      logger.warn({
        msg: 'Assinatura não encontrada para webhook',
        subscriptionId: stripeSubscription.id,
      });
      return;
    }

    subscription.status = this.mapStripeStatus(stripeSubscription.status);
    subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;

    if (stripeSubscription.canceled_at) {
      subscription.canceledAt = new Date(stripeSubscription.canceled_at * 1000);
    }

    await subscription.save();

    // Se cancelado, volta para free
    if (subscription.status === SUBSCRIPTION_STATUS.CANCELED) {
      await this.updateWorkspaceLimits(subscription.workspaceId, PLAN.FREE);
    }
  }

  /**
   * Trata fatura paga
   */
  async handleInvoicePaid(stripeInvoice) {
    const subscription = await Subscription.findOne({
      stripeCustomerId: stripeInvoice.customer,
    });

    if (!subscription) return;

    // Cria ou atualiza fatura local
    let invoice = await Invoice.findOne({ stripeInvoiceId: stripeInvoice.id });

    if (!invoice) {
      invoice = new Invoice({
        workspaceId: subscription.workspaceId,
        subscriptionId: subscription._id,
        stripeInvoiceId: stripeInvoice.id,
      });
    }

    invoice.status = 'paid';
    invoice.subtotal = stripeInvoice.subtotal / 100;
    invoice.tax = stripeInvoice.tax ? stripeInvoice.tax / 100 : 0;
    invoice.total = stripeInvoice.total / 100;
    invoice.currency = stripeInvoice.currency.toUpperCase();
    invoice.periodStart = new Date(stripeInvoice.period_start * 1000);
    invoice.periodEnd = new Date(stripeInvoice.period_end * 1000);
    invoice.paidAt = new Date();
    invoice.hostedInvoiceUrl = stripeInvoice.hosted_invoice_url;
    invoice.invoicePdf = stripeInvoice.invoice_pdf;

    invoice.items = stripeInvoice.lines.data.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unit_amount / 100,
      amount: line.amount / 100,
    }));

    await invoice.save();

    // Reseta uso mensal
    await subscription.resetMonthlyUsage();

    logger.info({
      msg: 'Fatura paga processada',
      invoiceId: invoice._id,
      workspaceId: subscription.workspaceId,
    });
  }

  /**
   * Trata falha de pagamento
   */
  async handlePaymentFailed(stripeInvoice) {
    const subscription = await Subscription.findOne({
      stripeCustomerId: stripeInvoice.customer,
    });

    if (!subscription) return;

    subscription.status = SUBSCRIPTION_STATUS.PAST_DUE;
    await subscription.save();

    // TODO: Enviar email de notificação

    logger.warn({
      msg: 'Falha no pagamento',
      workspaceId: subscription.workspaceId,
    });
  }

  /**
   * Atualiza limites do workspace
   */
  async updateWorkspaceLimits(workspaceId, plan) {
    const features = PLAN_DETAILS[plan].features;

    await Workspace.updateOne(
      { _id: toObjectId(workspaceId) },
      {
        plan,
        limits: {
          members: features.members,
          contacts: features.contacts,
          channels: features.channels,
          messagesPerMonth: features.messagesPerMonth,
          storage: features.storage,
        },
      }
    );
  }

  /**
   * Mapeia status do Stripe
   */
  mapStripeStatus(status) {
    const mapping = {
      active: SUBSCRIPTION_STATUS.ACTIVE,
      past_due: SUBSCRIPTION_STATUS.PAST_DUE,
      canceled: SUBSCRIPTION_STATUS.CANCELED,
      trialing: SUBSCRIPTION_STATUS.TRIALING,
      unpaid: SUBSCRIPTION_STATUS.UNPAID,
      incomplete: SUBSCRIPTION_STATUS.INCOMPLETE,
    };
    return mapping[status] || SUBSCRIPTION_STATUS.ACTIVE;
  }

  /**
   * Verifica uso e limites
   * @param {string} workspaceId - ID do workspace
   * @param {string} resource - Recurso
   * @param {number} amount - Quantidade
   * @returns {Promise<boolean>}
   */
  async checkUsageLimit(workspaceId, resource, amount = 1) {
    const subscription = await this.getOrCreateSubscription(workspaceId);
    const workspace = await Workspace.findById(workspaceId);
    const limit = workspace.limits[resource];

    if (limit === -1) return true; // Ilimitado

    const currentUsage = subscription.usage[resource] || 0;
    return currentUsage + amount <= limit;
  }

  /**
   * Registra uso
   * @param {string} workspaceId - ID do workspace
   * @param {string} resource - Recurso
   * @param {number} amount - Quantidade
   */
  async recordUsage(workspaceId, resource, amount = 1) {
    await Subscription.updateOne(
      { workspaceId: toObjectId(workspaceId) },
      { $inc: { [`usage.${resource}`]: amount } }
    );
  }
}

module.exports = new BillingService();