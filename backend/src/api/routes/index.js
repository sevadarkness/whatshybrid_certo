/**
 * @fileoverview Agregador principal de rotas (API v2)
 * @module api/routes
 *
 * FULL MODE: inclui CRM v2, Team/Auth/Workspaces, AI v2, Analytics v2,
 * Billing v2 e Flows/Automations v2.
 */

const express = require('express');
const router = express.Router();

// Módulos v2
const teamRoutes = require('../../team/routes');
const crmRoutes = require('../../crm/routes');
const aiRoutes = require('../../ai/routes/aiRoutes');
const analyticsRoutes = require('../../analytics/routes/analyticsRoutes');
const billingRoutes = require('../../billing/routes/billingRoutes');

// Flows v2
const authenticate = require('../../team/middlewares/authenticate');
const flowSystem = require('../../flows/flowSystemInstance');
const { buildFlowsApi } = require('../../flows/api');
const flowsApi = buildFlowsApi({
  authMiddleware: authenticate,
  eventDispatcher: flowSystem.eventDispatcher,
  cronScheduler: flowSystem.cronScheduler,
});

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    modules: {
      team: true,
      crm: true,
      ai: true,
      analytics: true,
      billing: true,
      flows: true,
    },
  });
});

// Rotas de módulos
router.use('/', teamRoutes); // /api/auth, /api/users, /api/workspaces
router.use('/crm', crmRoutes);
router.use('/ai', aiRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/billing', billingRoutes);

// Flows
router.use('/flows', flowsApi.flowRoutes);
router.use('/flows/webhooks', flowsApi.webhookRoutes);

module.exports = router;
