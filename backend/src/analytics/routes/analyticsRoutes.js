/**
 * @fileoverview Rotas do módulo Analytics
 * @module analytics/routes/analyticsRoutes
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/AnalyticsController');
const { validate } = require('../../shared/middlewares/validate');
const { asyncHandler } = require('../../shared/middlewares/asyncHandler');
const { authenticate, requireWorkspace } = require('../../team/middlewares/authenticate');
const { requirePermission } = require('../../team/middlewares/authorize');
const { PERMISSION } = require('../../team/constants/teamConstants');
const {
  metricsQuerySchema,
  reportQuerySchema,
  dashboardQuerySchema,
} = require('../schemas/analyticsSchema');

router.use(authenticate, requireWorkspace);

// Dashboard
router.get(
  '/dashboard',
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  validate(dashboardQuerySchema, 'query'),
  asyncHandler(analyticsController.getDashboard.bind(analyticsController))
);

// Métricas específicas
router.get(
  '/conversations',
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  validate(metricsQuerySchema, 'query'),
  asyncHandler(analyticsController.getConversationsMetrics.bind(analyticsController))
);

router.get(
  '/agents',
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  validate(metricsQuerySchema, 'query'),
  asyncHandler(analyticsController.getAgentsMetrics.bind(analyticsController))
);

router.get(
  '/crm',
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  validate(metricsQuerySchema, 'query'),
  asyncHandler(analyticsController.getCrmMetrics.bind(analyticsController))
);

// Série temporal
router.get(
  '/timeseries',
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  validate(metricsQuerySchema, 'query'),
  asyncHandler(analyticsController.getTimeSeries.bind(analyticsController))
);

// Relatórios
router.post(
  '/reports',
  requirePermission(PERMISSION.ANALYTICS_EXPORT),
  validate(reportQuerySchema),
  asyncHandler(analyticsController.generateReport.bind(analyticsController))
);

module.exports = router;
