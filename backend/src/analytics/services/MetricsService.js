/**
 * @fileoverview Service de Métricas
 * @module analytics/services/MetricsService
 */

const Metric = require('../models/Metric');
const { toObjectId } = require('../../shared/utils/ids');
const { AGGREGATION_PERIOD, METRIC_TYPE } = require('../constants/analyticsConstants');
const logger = require('../../infra/logging/Logger');

class MetricsService {
  /**
   * Registra métrica
   * @param {string} workspaceId - ID do workspace
   * @param {string} name - Nome da métrica
   * @param {number} value - Valor
   * @param {Object} [options] - Opções
   */
  async record(workspaceId, name, value = 1, options = {}) {
    const { dimensions = {}, timestamp = new Date() } = options;
    const periods = [AGGREGATION_PERIOD.HOUR, AGGREGATION_PERIOD.DAY, AGGREGATION_PERIOD.MONTH];

    try {
      await Promise.all(
        periods.map((period) =>
          Metric.increment(workspaceId, name, period, timestamp, value, dimensions)
        )
      );
    } catch (error) {
      logger.error({
        msg: 'Erro ao registrar métrica',
        name,
        error: error.message,
      });
    }
  }

  /**
   * Obtém série temporal
   * @param {string} workspaceId - ID do workspace
   * @param {Object} query - Query
   * @returns {Promise<Object>}
   */
  async getTimeSeries(workspaceId, query) {
    const { from, to, period, metrics, dimensions, filters } = query;

    const results = {};

    for (const metricName of metrics || [METRIC_TYPE.MESSAGES_TOTAL]) {
      const data = await Metric.getTimeSeries(
        workspaceId,
        metricName,
        period,
        new Date(from),
        new Date(to),
        filters
      );

      results[metricName] = {
        data: data.map((d) => ({
          timestamp: d.timestamp,
          value: d.value,
          count: d.count,
        })),
        total: data.reduce((sum, d) => sum + d.value, 0),
        average: data.length > 0
          ? data.reduce((sum, d) => sum + d.value, 0) / data.length
          : 0,
      };
    }

    return results;
  }

  /**
   * Obtém métricas agregadas
   * @param {string} workspaceId - ID do workspace
   * @param {Object} query - Query
   * @returns {Promise<Object>}
   */
  async getAggregated(workspaceId, query) {
    const { from, to, metrics, groupBy, filters } = query;

    const match = {
      workspaceId: toObjectId(workspaceId),
      period: AGGREGATION_PERIOD.DAY,
      timestamp: { $gte: new Date(from), $lte: new Date(to) },
    };

    if (filters?.channelIds) {
      match['dimensions.channelId'] = { $in: filters.channelIds.map(toObjectId) };
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: groupBy ? `$dimensions.${groupBy}` : null,
          total: { $sum: '$value' },
          count: { $sum: '$count' },
          avg: { $avg: '$value' },
          min: { $min: '$value' },
          max: { $max: '$value' },
        },
      },
      { $sort: { total: -1 } },
    ];

    const results = await Metric.aggregate(pipeline);

    return results;
  }

  /**
   * Obtém comparação entre períodos
   * @param {string} workspaceId - ID do workspace
   * @param {string} metricName - Nome da métrica
   * @param {Date} from - Data inicial
   * @param {Date} to - Data final
   * @returns {Promise<Object>}
   */
  async getComparison(workspaceId, metricName, from, to) {
    const periodLength = to - from;
    const previousFrom = new Date(from - periodLength);
    const previousTo = new Date(to - periodLength);

    const [current, previous] = await Promise.all([
      this.getTotal(workspaceId, metricName, from, to),
      this.getTotal(workspaceId, metricName, previousFrom, previousTo),
    ]);

    const change = previous > 0
      ? ((current - previous) / previous) * 100
      : current > 0 ? 100 : 0;

    return {
      current,
      previous,
      change: Math.round(change * 100) / 100,
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
    };
  }

  /**
   * Obtém total de uma métrica
   */
  async getTotal(workspaceId, metricName, from, to) {
    const result = await Metric.aggregate([
      {
        $match: {
          workspaceId: toObjectId(workspaceId),
          name: metricName,
          period: AGGREGATION_PERIOD.DAY,
          timestamp: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$value' },
        },
      },
    ]);

    return result[0]?.total || 0;
  }

  /**
   * Obtém ranking por dimensão
   * @param {string} workspaceId - ID do workspace
   * @param {string} metricName - Nome da métrica
   * @param {string} dimension - Dimensão
   * @param {Date} from - Data inicial
   * @param {Date} to - Data final
   * @param {number} limit - Limite
   * @returns {Promise<Object[]>}
   */
  async getRanking(workspaceId, metricName, dimension, from, to, limit = 10) {
    const result = await Metric.aggregate([
      {
        $match: {
          workspaceId: toObjectId(workspaceId),
          name: metricName,
          period: AGGREGATION_PERIOD.DAY,
          timestamp: { $gte: from, $lte: to },
          [`dimensions.${dimension}`]: { $exists: true },
        },
      },
      {
        $group: {
          _id: `$dimensions.${dimension}`,
          total: { $sum: '$value' },
        },
      },
      { $sort: { total: -1 } },
      { $limit: limit },
    ]);

    return result;
  }
}

module.exports = new MetricsService();