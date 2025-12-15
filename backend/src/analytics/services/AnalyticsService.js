/**
 * @fileoverview Service de Analytics
 * @module analytics/services/AnalyticsService
 */

const Metric = require('../models/Metric');
const { toObjectId } = require('../../shared/utils/ids');
const { TIME_PERIOD, TIME_GRANULARITY, METRIC_CATEGORY } = require('../constants/analyticsConstants');
const logger = require('../../infra/logging/Logger');

class AnalyticsService {
  /**
   * Obtém dashboard overview
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async getDashboard(workspaceId, options = {}) {
    const { from, to } = this.getPeriodDates(options.period, options.from, options.to);
    const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

    const [current, previous] = await Promise.all([
      this.getOverviewMetrics(workspaceId, from, to),
      this.getOverviewMetrics(workspaceId, previousFrom, from),
    ]);

    // Calcula variações
    const calculateChange = (curr, prev) => {
      if (!prev || prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      period: { from, to },
      metrics: {
        conversations: {
          total: current.conversations,
          change: calculateChange(current.conversations, previous.conversations),
        },
        messages: {
          total: current.messages,
          change: calculateChange(current.messages, previous.messages),
        },
        contacts: {
          total: current.contacts,
          change: calculateChange(current.contacts, previous.contacts),
        },
        deals: {
          total: current.deals,
          value: current.dealsValue,
          change: calculateChange(current.deals, previous.deals),
        },
        avgResponseTime: {
          value: current.avgResponseTime,
          change: calculateChange(current.avgResponseTime, previous.avgResponseTime),
        },
        satisfactionScore: {
          value: current.satisfactionScore,
          change: calculateChange(current.satisfactionScore, previous.satisfactionScore),
        },
      },
    };
  }

  /**
   * Obtém métricas de overview
   */
  async getOverviewMetrics(workspaceId, from, to) {
    const granularity = TIME_GRANULARITY.DAY;

    const results = await Metric.aggregate(workspaceId, {
      from,
      to,
      granularity,
      names: [
        'conversations_created',
        'messages_sent',
        'contacts_created',
        'deals_created',
        'deals_value',
        'avg_response_time',
        'satisfaction_score',
      ],
    });

    const metrics = {};
    results.forEach((r) => {
      metrics[r._id.name] = r.total;
    });

    return {
      conversations: metrics.conversations_created || 0,
      messages: metrics.messages_sent || 0,
      contacts: metrics.contacts_created || 0,
      deals: metrics.deals_created || 0,
      dealsValue: metrics.deals_value || 0,
      avgResponseTime: metrics.avg_response_time || 0,
      satisfactionScore: metrics.satisfaction_score || 0,
    };
  }

  /**
   * Obtém série temporal de uma métrica
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object[]>}
   */
  async getTimeSeries(workspaceId, options) {
    const {
      category,
      metric,
      period,
      from: customFrom,
      to: customTo,
      granularity = TIME_GRANULARITY.DAY,
      dimensions,
    } = options;

    const { from, to } = this.getPeriodDates(period, customFrom, customTo);

    return Metric.getTimeSeries(workspaceId, {
      category,
      name: metric,
      from,
      to,
      granularity,
      dimensions,
    });
  }

  /**
   * Obtém métricas de conversas
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async getConversationMetrics(workspaceId, options = {}) {
    const { from, to } = this.getPeriodDates(options.period, options.from, options.to);
    const granularity = options.granularity || TIME_GRANULARITY.DAY;

    const [timeSeries, byChannel, byStatus] = await Promise.all([
      Metric.getTimeSeries(workspaceId, {
        category: METRIC_CATEGORY.CONVERSATIONS,
        name: 'conversations_created',
        from,
        to,
        granularity,
      }),
      Metric.aggregate(workspaceId, {
        category: METRIC_CATEGORY.CONVERSATIONS,
        names: ['conversations_created'],
        from,
        to,
        granularity,
        groupBy: ['channelId'],
      }),
      this.getConversationsByStatus(workspaceId, from, to),
    ]);

    return {
      period: { from, to },
      timeSeries,
      byChannel,
      byStatus,
    };
  }

  /**
   * Obtém métricas de agentes
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async getAgentMetrics(workspaceId, options = {}) {
    const { from, to } = this.getPeriodDates(options.period, options.from, options.to);

    const agentMetrics = await Metric.aggregate(workspaceId, {
      category: METRIC_CATEGORY.AGENTS,
      from,
      to,
      granularity: TIME_GRANULARITY.DAY,
      groupBy: ['agentId'],
    });

    // Agrupa por agente
    const byAgent = {};
    agentMetrics.forEach((m) => {
      const agentId = m._id.agentId?.toString() || 'unassigned';
      if (!byAgent[agentId]) {
        byAgent[agentId] = {};
      }
      byAgent[agentId][m._id.name] = {
        total: m.total,
        avg: m.avg,
      };
    });

    return {
      period: { from, to },
      byAgent,
    };
  }

  /**
   * Obtém métricas de vendas/deals
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async getSalesMetrics(workspaceId, options = {}) {
    const { from, to } = this.getPeriodDates(options.period, options.from, options.to);

    const [funnel, timeSeries, byStage] = await Promise.all([
      this.getSalesFunnel(workspaceId, from, to, options.pipelineId),
      Metric.getTimeSeries(workspaceId, {
        category: METRIC_CATEGORY.DEALS,
        name: 'deals_won_value',
        from,
        to,
        granularity: TIME_GRANULARITY.DAY,
      }),
      Metric.aggregate(workspaceId, {
        category: METRIC_CATEGORY.DEALS,
        from,
        to,
        granularity: TIME_GRANULARITY.DAY,
        groupBy: ['stageId'],
      }),
    ]);

    return {
      period: { from, to },
      funnel,
      timeSeries,
      byStage,
    };
  }

  /**
   * Obtém funil de vendas
   */
  async getSalesFunnel(workspaceId, from, to, pipelineId) {
    const Deal = require('../../crm/models/Deal');
    const Pipeline = require('../../crm/models/Pipeline');

    const pipeline = pipelineId
      ? await Pipeline.findById(pipelineId)
      : await Pipeline.findOne({ workspaceId, isDefault: true });

    if (!pipeline) return [];

    const stages = pipeline.stages;
    const dealsByStage = await Deal.aggregate([
      {
        $match: {
          workspaceId: toObjectId(workspaceId),
          pipelineId: pipeline._id,
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: '$stageId',
          count: { $sum: 1 },
          value: { $sum: '$value' },
        },
      },
    ]);

    const stageMap = {};
    dealsByStage.forEach((d) => {
      stageMap[d._id.toString()] = d;
    });

    return stages.map((stage, index) => ({
      stageId: stage._id,
      name: stage.name,
      order: index,
      count: stageMap[stage._id.toString()]?.count || 0,
      value: stageMap[stage._id.toString()]?.value || 0,
      conversionRate: index > 0
        ? ((stageMap[stage._id.toString()]?.count || 0) /
            (stageMap[stages[index - 1]._id.toString()]?.count || 1)) *
          100
        : 100,
    }));
  }

  /**
   * Obtém métricas de AI
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async getAIMetrics(workspaceId, options = {}) {
    const { from, to } = this.getPeriodDates(options.period, options.from, options.to);

    const metrics = await Metric.aggregate(workspaceId, {
      category: METRIC_CATEGORY.AI,
      from,
      to,
      granularity: TIME_GRANULARITY.DAY,
    });

    const result = {};
    metrics.forEach((m) => {
      result[m._id.name] = {
        total: m.total,
        avg: m.avg,
      };
    });

    return {
      period: { from, to },
      metrics: result,
    };
  }

  /**
   * Registra métrica
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados da métrica
   */
  async trackMetric(workspaceId, data) {
    const {
      category,
      name,
      value = 1,
      dimensions = {},
      timestamp = new Date(),
    } = data;

    // Registra para múltiplas granularidades
    const granularities = [TIME_GRANULARITY.HOUR, TIME_GRANULARITY.DAY, TIME_GRANULARITY.MONTH];

    await Promise.all(
      granularities.map((granularity) =>
        Metric.upsertMetric({
          workspaceId: toObjectId(workspaceId),
          category,
          name,
          granularity,
          timestamp: this.truncateDate(timestamp, granularity),
          value,
          dimensions,
        })
      )
    );
  }

  /**
   * Converte período em datas
   */
  getPeriodDates(period, customFrom, customTo) {
    const now = new Date();
    let from, to;

    switch (period) {
      case TIME_PERIOD.TODAY:
        from = new Date(now.setHours(0, 0, 0, 0));
        to = new Date();
        break;

      case TIME_PERIOD.YESTERDAY:
        from = new Date(now);
        from.setDate(from.getDate() - 1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setHours(23, 59, 59, 999);
        break;

      case TIME_PERIOD.LAST_7_DAYS:
        from = new Date(now);
        from.setDate(from.getDate() - 7);
        from.setHours(0, 0, 0, 0);
        to = new Date();
        break;

      case TIME_PERIOD.LAST_30_DAYS:
        from = new Date(now);
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);
        to = new Date();
        break;

      case TIME_PERIOD.LAST_90_DAYS:
        from = new Date(now);
        from.setDate(from.getDate() - 90);
        from.setHours(0, 0, 0, 0);
        to = new Date();
        break;

      case TIME_PERIOD.THIS_MONTH:
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date();
        break;

      case TIME_PERIOD.LAST_MONTH:
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;

      case TIME_PERIOD.THIS_YEAR:
        from = new Date(now.getFullYear(), 0, 1);
        to = new Date();
        break;

      case TIME_PERIOD.CUSTOM:
        from = new Date(customFrom);
        to = new Date(customTo);
        break;

      default:
        from = new Date(now);
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);
        to = new Date();
    }

    return { from, to };
  }

  /**
   * Trunca data para granularidade
   */
  truncateDate(date, granularity) {
    const d = new Date(date);

    switch (granularity) {
      case TIME_GRANULARITY.HOUR:
        d.setMinutes(0, 0, 0);
        break;
      case TIME_GRANULARITY.DAY:
        d.setHours(0, 0, 0, 0);
        break;
      case TIME_GRANULARITY.WEEK:
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - d.getDay());
        break;
      case TIME_GRANULARITY.MONTH:
        d.setHours(0, 0, 0, 0);
        d.setDate(1);
        break;
      case TIME_GRANULARITY.YEAR:
        d.setHours(0, 0, 0, 0);
        d.setMonth(0, 1);
        break;
    }

    return d;
  }

  /**
   * Obtém conversas por status
   */
  async getConversationsByStatus(workspaceId, from, to) {
    const Conversation = require('../../chat/models/Conversation');

    return Conversation.aggregate([
      {
        $match: {
          workspaceId: toObjectId(workspaceId),
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);
  }
}

module.exports = new AnalyticsService();