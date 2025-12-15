/**
 * @fileoverview Rotas do módulo Analytics
 * @module analytics/routes
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
  periodSchema,
  metricsQuerySchema,
  dashboardQuerySchema,
  generateReportSchema,
} = require('../schemas/analyticsSchema');

router.use(authenticate);
router.use(requireWorkspace);

// ===== Métricas =====
router.get(
  '/dashboard',
  validate(dashboardQuerySchema, 'query'),
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  asyncHandler(analyticsController.getDashboard.bind(analyticsController))
);

router.get(
  '/timeseries',
  validate(metricsQuerySchema, 'query'),
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  asyncHandler(analyticsController.getTimeSeries.bind(analyticsController))
);

router.get(
  '/conversations',
  validate(periodSchema, 'query'),
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  asyncHandler(analyticsController.getConversationMetrics.bind(analyticsController))
);

router.get(
  '/agents',
  validate(periodSchema, 'query'),
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  asyncHandler(analyticsController.getAgentMetrics.bind(analyticsController))
);

router.get(
  '/sales',
  validate(periodSchema, 'query'),
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  asyncHandler(analyticsController.getSalesMetrics.bind(analyticsController))
);

router.get(
  '/ai',
  validate(periodSchema, 'query'),
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  asyncHandler(analyticsController.getAIMetrics.bind(analyticsController))
);

// ===== Relatórios =====
router.post(
  '/reports',
  validate(generateReportSchema),
  requirePermission(PERMISSION.ANALYTICS_EXPORT),
  asyncHandler(analyticsController.createReport.bind(analyticsController))
);

router.get(
  '/reports',
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  asyncHandler(analyticsController.listReports.bind(analyticsController))
);

router.get(
  '/reports/:id',
  requirePermission(PERMISSION.ANALYTICS_VIEW),
  asyncHandler(analyticsController.getReport.bind(analyticsController))
);

router.put(
  '/reports/:id',
  requirePermission(PERMISSION.ANALYTICS_EXPORT),
  asyncHandler(analyticsController.updateReport.bind(analyticsController))
);

router.delete(
  '/reports/:id',
  requirePermission(PERMISSION.ANALYTICS_EXPORT),
  asyncHandler(analyticsController.deleteReport.bind(analyticsController))
);

router.post(
  '/reports/:id/execute',
  requirePermission(PERMISSION.ANALYTICS_EXPORT),
  asyncHandler(analyticsController.executeReport.bind(analyticsController))
);

module.exports = router;
