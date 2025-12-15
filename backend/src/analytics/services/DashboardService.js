/**
 * @fileoverview Service de Dashboard
 * @module analytics/services/DashboardService
 */

const metricsService = require('./MetricsService');
const { METRIC_TYPE } = require('../constants/analyticsConstants');
const { toObjectId } = require('../../shared/utils/ids');

class DashboardService {
  /**
   * Obtém dados do dashboard principal
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async getOverview(workspaceId, options = {}) {
    const {
      from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      to = new Date(),
      compareWith,
    } = options;

    const [
      conversations,
      messages,
      contacts,
      deals,
      responseTime,
    ] = await Promise.all([
      metricsService.getComparison(workspaceId, METRIC_TYPE.CONVERSATIONS_STARTED, from, to),
      metricsService.getComparison(workspaceId, METRIC_TYPE.MESSAGES_TOTAL, from, to),
      metricsService.getComparison(workspaceId, METRIC_TYPE.CONTACTS_CREATED, from, to),
      metricsService.getComparison(workspaceId, METRIC_TYPE.DEALS_WON, from, to),
      metricsService.getComparison(workspaceId, METRIC_TYPE.AVG_RESPONSE_TIME, from, to),
    ]);

    // Série temporal de conversas
    const conversationsTrend = await metricsService.getTimeSeries(workspaceId, {
      from,
      to,
      period: 'day',
      metrics: [METRIC_TYPE.CONVERSATIONS_STARTED],
    });

    // Top canais
    const topChannels = await metricsService.getRanking(
      workspaceId,
      METRIC_TYPE.MESSAGES_TOTAL,
      'channelId',
      from,
      to,
      5
    );

    // Top agentes
    const topAgents = await metricsService.getRanking(
      workspaceId,
      METRIC_TYPE.AGENT_MESSAGES,
      'agentId',
      from,
      to,
      5
    );

    return {
      period: { from, to },
      summary: {
        conversations,
        messages,
        contacts,
        deals,
        responseTime: {
          ...responseTime,
          current: this.formatDuration(responseTime.current),
          previous: this.formatDuration(responseTime.previous),
        },
      },
      trends: {
        conversations: conversationsTrend[METRIC_TYPE.CONVERSATIONS_STARTED]?.data || [],
      },
      rankings: {
        channels: topChannels,
        agents: topAgents,
      },
    };
  }

  /**
   * Obtém métricas de conversas
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async getConversationsMetrics(workspaceId, options = {}) {
    const { from, to } = options;

    const [
      started,
      closed,
      avgDuration,
      byChannel,
      byHour,
    ] = await Promise.all([
      metricsService.getComparison(workspaceId, METRIC_TYPE.CONVERSATIONS_STARTED, from, to),
      metricsService.getComparison(workspaceId, METRIC_TYPE.CONVERSATIONS_CLOSED, from, to),
      metricsService.getComparison(workspaceId, METRIC_TYPE.AVG_RESOLUTION_TIME, from, to),
      metricsService.getRanking(workspaceId, METRIC_TYPE.CONVERSATIONS_STARTED, 'channelId', from, to),
      this.getByHourOfDay(workspaceId, METRIC_TYPE.CONVERSATIONS_STARTED, from, to),
    ]);

    return {
      summary: {
        started,
        closed,
        avgDuration: {
          ...avgDuration,
          current: this.formatDuration(avgDuration.current),
        },
      },
      byChannel,
      byHour,
    };
  }

  /**
   * Obtém métricas de agentes
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async getAgentsMetrics(workspaceId, options = {}) {
    const { from, to } = options;

    const Conversation = require('../../channel/models/Conversation');
    
    // Agrega por agente
    const agentStats = await Conversation.aggregate([
      {
        $match: {
          workspaceId: toObjectId(workspaceId),
          createdAt: { $gte: from, $lte: to },
          assignedTo: { $exists: true },
        },
      },
      {
        $group: {
          _id: '$assignedTo',
          conversations: { $sum: 1 },
          messages: { $sum: '$messageCount' },
          avgResponseTime: { $avg: '$metrics.avgResponseTime' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          agentId: '$_id',
          name: '$user.name',
          avatar: '$user.avatar',
          conversations: 1,
          messages: 1,
          avgResponseTime: 1,
        },
      },
      { $sort: { conversations: -1 } },
    ]);

    return {
      agents: agentStats.map((a) => ({
        ...a,
        avgResponseTime: this.formatDuration(a.avgResponseTime),
      })),
    };
  }

  /**
   * Obtém métricas de CRM
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async getCrmMetrics(workspaceId, options = {}) {
    const { from, to } = options;

    const Deal = require('../../crm/models/Deal');

    // Pipeline de funil
    const funnelData = await Deal.aggregate([
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
          value: { $sum: '$value' },
        },
      },
    ]);

    // Win rate
    const wonCount = funnelData.find((f) => f._id === 'won')?.count || 0;
    const lostCount = funnelData.find((f) => f._id === 'lost')?.count || 0;
    const totalClosed = wonCount + lostCount;
    const winRate = totalClosed > 0 ? (wonCount / totalClosed) * 100 : 0;

    // Valor por estágio
    const valueByStage = await Deal.aggregate([
      {
        $match: {
          workspaceId: toObjectId(workspaceId),
          status: 'open',
        },
      },
      {
        $group: {
          _id: '$stageId',
          count: { $sum: 1 },
          value: { $sum: '$value' },
        },
      },
      {
        $lookup: {
          from: 'pipelines',
          let: { stageId: '$_id' },
          pipeline: [
            { $unwind: '$stages' },
            { $match: { $expr: { $eq: ['$stages._id', '$$stageId'] } } },
            { $project: { name: '$stages.name', order: '$stages.order' } },
          ],
          as: 'stage',
        },
      },
      { $unwind: { path: '$stage', preserveNullAndEmptyArrays: true } },
      { $sort: { 'stage.order': 1 } },
    ]);

    return {
      summary: {
        totalDeals: funnelData.reduce((sum, f) => sum + f.count, 0),
        totalValue: funnelData.reduce((sum, f) => sum + f.value, 0),
        winRate: Math.round(winRate * 100) / 100,
        wonValue: funnelData.find((f) => f._id === 'won')?.value || 0,
      },
      funnel: funnelData,
      pipeline: valueByStage,
    };
  }

  /**
   * Obtém distribuição por hora do dia
   */
  async getByHourOfDay(workspaceId, metricName, from, to) {
    const result = await require('../models/Metric').aggregate([
      {
        $match: {
          workspaceId: toObjectId(workspaceId),
          name: metricName,
          period: 'hour',
          timestamp: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          total: { $sum: '$value' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Preenche todas as horas
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      total: result.find((r) => r._id === i)?.total || 0,
    }));

    return hours;
  }

  /**
   * Formata duração em ms para string legível
   */
  formatDuration(ms) {
    if (!ms) return '0s';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

module.exports = new DashboardService();