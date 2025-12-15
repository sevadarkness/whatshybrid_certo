/**
 * @fileoverview Rotas do módulo Billing
 * @module billing/routes
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
  createCheckoutSchema,
  cancelSubscriptionSchema,
  createPortalSessionSchema,
} = require('../schemas/billingSchema');

// Webhook (sem autenticação, usa assinatura do Stripe)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(billingController.handleWebhook.bind(billingController))
);

// Rotas públicas
router.get('/plans', asyncHandler(billingController.getPlans.bind(billingController)));

// Rotas autenticadas
router.use(authenticate);
router.use(requireWorkspace);

router.get(
  '/subscription',
  requirePermission(PERMISSION.BILLING_VIEW),
  asyncHandler(billingController.getSubscription.bind(billingController))
);

router.post(
  '/checkout',
  validate(createCheckoutSchema),
  requirePermission(PERMISSION.BILLING_MANAGE),
  asyncHandler(billingController.createCheckout.bind(billingController))
);

router.post(
  '/portal',
  validate(createPortalSessionSchema),
  requirePermission(PERMISSION.BILLING_MANAGE),
  asyncHandler(billingController.createPortal.bind(billingController))
);

router.post(
  '/cancel',
  validate(cancelSubscriptionSchema),
  requirePermission(PERMISSION.BILLING_MANAGE),
  asyncHandler(billingController.cancel.bind(billingController))
);

router.post(
  '/reactivate',
  requirePermission(PERMISSION.BILLING_MANAGE),
  asyncHandler(billingController.reactivate.bind(billingController))
);

router.get(
  '/invoices',
  requirePermission(PERMISSION.BILLING_VIEW),
  asyncHandler(billingController.getInvoices.bind(billingController))
);

router.get(
  '/usage',
  requirePermission(PERMISSION.BILLING_VIEW),
  asyncHandler(billingController.getUsage.bind(billingController))
);

module.exports = router;
