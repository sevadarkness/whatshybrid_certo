/**
 * @fileoverview Controller de Analytics
 * @module analytics/controllers/AnalyticsController
 */

const dashboardService = require('../services/DashboardService');
const metricsService = require('../services/MetricsService');
const reportService = require('../services/ReportService');
const { success } = require('../../shared/utils/response');

class AnalyticsController {
  /**
   * Obtém dashboard principal
   * GET /api/analytics/dashboard
   */
  async getDashboard(req, res) {
    const { from, to, compareWith } = req.query;
    
    const data = await dashboardService.getOverview(req.workspace._id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      compareWith,
    });

    return success(res, data);
  }

  /**
   * Obtém métricas de conversas
   * GET /api/analytics/conversations
   */
  async getConversationsMetrics(req, res) {
    const { from, to } = req.query;
    
    const data = await dashboardService.getConversationsMetrics(req.workspace._id, {
      from: new Date(from),
      to: new Date(to),
    });

    return success(res, data);
  }

  /**
   * Obtém métricas de agentes
   * GET /api/analytics/agents
   */
  async getAgentsMetrics(req, res) {
    const { from, to } = req.query;
    
    const data = await dashboardService.getAgentsMetrics(req.workspace._id, {
      from: new Date(from),
      to: new Date(to),
    });

    return success(res, data);
  }

  /**
   * Obtém métricas de CRM
   * GET /api/analytics/crm
   */
  async getCrmMetrics(req, res) {
    const { from, to } = req.query;
    
    const data = await dashboardService.getCrmMetrics(req.workspace._id, {
      from: new Date(from),
      to: new Date(to),
    });

    return success(res, data);
  }

  /**
   * Obtém série temporal
   * GET /api/analytics/timeseries
   */
  async getTimeSeries(req, res) {
    const { from, to, period, metrics, filters } = req.query;
    
    const data = await metricsService.getTimeSeries(req.workspace._id, {
      from,
      to,
      period,
      metrics: metrics ? metrics.split(',') : undefined,
      filters: filters ? JSON.parse(filters) : undefined,
    });

    return success(res, data);
  }

  /**
   * Gera relatório
   * POST /api/analytics/reports
   */
  async generateReport(req, res) {
    const report = await reportService.generate(req.workspace._id, req.body);

    // Se for arquivo, envia como download
    if (report.format && report.content) {
      res.setHeader('Content-Type', this.getContentType(report.format));
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      return res.send(report.content);
    }

    return success(res, report);
  }

  /**
   * Obtém content type por formato
   */
  getContentType(format) {
    const types = {
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      json: 'application/json',
    };
    return types[format] || 'application/octet-stream';
  }
}

module.exports = new AnalyticsController();