/**
 * @fileoverview Rotas do módulo Billing
 * @module billing/routes/billingRoutes
 */

const express = require('express');
const router = express.Router();
const billingController = require('../controllers/BillingController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const { authenticate, requireWorkspace } = require('../../team/middlewares/authenticate');
const { requirePermission } = require('../../team/middlewares/authorize');
const { PERMISSION } = require('../../team/constants/teamConstants');
const {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  customerPortalSchema,
} = require('../schemas/billingSchema');

// Webhook (sem autenticação)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(billingController.handleWebhook.bind(billingController))
);

// Planos (público)
router.get(
  '/plans',
  asyncHandler(billingController.getPlans.bind(billingController))
);

// Rotas autenticadas
router.use(authenticate, requireWorkspace);

router.get(
  '/subscription',
  requirePermission(PERMISSION.BILLING_VIEW),
  asyncHandler(billingController.getSubscription.bind(billingController))
);

router.post(
  '/subscription',
  requirePermission(PERMISSION.BILLING_MANAGE),
  validate(createSubscriptionSchema),
  asyncHandler(billingController.createSubscription.bind(billingController))
);

router.put(
  '/subscription',
  requirePermission(PERMISSION.BILLING_MANAGE),
  validate(updateSubscriptionSchema),
  asyncHandler(billingController.updateSubscription.bind(billingController))
);

router.delete(
  '/subscription',
  requirePermission(PERMISSION.BILLING_MANAGE),
  asyncHandler(billingController.cancelSubscription.bind(billingController))
);

router.post(
  '/subscription/reactivate',
  requirePermission(PERMISSION.BILLING_MANAGE),
  asyncHandler(billingController.reactivateSubscription.bind(billingController))
);

router.post(
  '/portal',
  requirePermission(PERMISSION.BILLING_MANAGE),
  validate(customerPortalSchema),
  asyncHandler(billingController.createPortalSession.bind(billingController))
);

router.get(
  '/invoices',
  requirePermission(PERMISSION.BILLING_VIEW),
  asyncHandler(billingController.listInvoices.bind(billingController))
);

router.get(
  '/usage',
  requirePermission(PERMISSION.BILLING_VIEW),
  asyncHandler(billingController.getUsage.bind(billingController))
);

module.exports = router;
