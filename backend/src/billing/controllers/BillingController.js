/**
 * @fileoverview Controller de Billing
 * @module billing/controllers/BillingController
 */

const billingService = require('../services/BillingService');
const { PLAN_DETAILS } = require('../constants/billingConstants');
const { success, created } = require('../../shared/utils/response');

class BillingController {
  /**
   * Obtém planos disponíveis
   * GET /api/billing/plans
   */
  async getPlans(req, res) {
    const plans = Object.entries(PLAN_DETAILS).map(([key, value]) => ({
      id: key,
      ...value,
    }));
    return success(res, plans);
  }

  /**
   * Obtém assinatura atual
   * GET /api/billing/subscription
   */
  async getSubscription(req, res) {
    const subscription = await billingService.getOrCreateSubscription(req.workspace._id);
    return success(res, subscription.toPublicJSON());
  }

  /**
   * Cria assinatura
   * POST /api/billing/subscription
   */
  async createSubscription(req, res) {
    const result = await billingService.createPaidSubscription(
      req.workspace._id,
      req.body
    );
    return created(res, result, 'Assinatura criada com sucesso');
  }

  /**
   * Atualiza assinatura
   * PUT /api/billing/subscription
   */
  async updateSubscription(req, res) {
    const subscription = await billingService.updateSubscription(
      req.workspace._id,
      req.body
    );
    return success(res, subscription.toPublicJSON(), 'Assinatura atualizada');
  }

  /**
   * Cancela assinatura
   * DELETE /api/billing/subscription
   */
  async cancelSubscription(req, res) {
    const { immediate } = req.query;
    const subscription = await billingService.cancelSubscription(
      req.workspace._id,
      immediate === 'true'
    );
    return success(res, subscription.toPublicJSON(), 'Assinatura cancelada');
  }

  /**
   * Reativa assinatura
   * POST /api/billing/subscription/reactivate
   */
  async reactivateSubscription(req, res) {
    const subscription = await billingService.reactivateSubscription(req.workspace._id);
    return success(res, subscription.toPublicJSON(), 'Assinatura reativada');
  }

  /**
   * Cria sessão do portal
   * POST /api/billing/portal
   */
  async createPortalSession(req, res) {
    const { returnUrl } = req.body;
    const url = await billingService.createCustomerPortalSession(
      req.workspace._id,
      returnUrl
    );
    return success(res, { url });
  }

  /**
   * Lista faturas
   * GET /api/billing/invoices
   */
  async listInvoices(req, res) {
    const { page, limit } = req.query;
    const invoices = await billingService.listInvoices(req.workspace._id, { page, limit });
    return success(res, invoices.map((i) => i.toPublicJSON()));
  }

  /**
   * Obtém uso atual
   * GET /api/billing/usage
   */
  async getUsage(req, res) {
    const subscription = await billingService.getSubscription(req.workspace._id);
    const Workspace = require('../../team/models/Workspace');
    const workspace = await Workspace.findById(req.workspace._id);

    return success(res, {
      usage: subscription.usage,
      limits: workspace.limits,
      plan: subscription.plan,
    });
  }

  /**
   * Webhook do Stripe
   * POST /api/billing/webhook
   */
  async handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const config = require('../../config');

    let event;
    try {
      const stripe = require('stripe')(config.stripe.secretKey);
      // `express.raw()` populates `req.body` (Buffer).
      // Some setups also store a copy in `req.rawBody`.
      const raw = req.rawBody || req.body;
      event = stripe.webhooks.constructEvent(raw, sig, config.stripe.webhookSecret);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    await billingService.handleWebhook(event);
    res.json({ received: true });
  }
}

module.exports = new BillingController();