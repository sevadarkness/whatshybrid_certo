/**
 * @fileoverview Repository de Deal
 * @module crm/repositories/DealRepository
 */

const Deal = require('../models/Deal');
const { DEAL_STATUS } = require('../constants/crmConstants');
const { toObjectId } = require('../../shared/utils/ids');

class DealRepository {
  /**
   * Cria um novo deal
   * @param {Object} data - Dados do deal
   * @returns {Promise<Deal>}
   */
  async create(data) {
    const deal = new Deal(data);
    return deal.save();
  }

  /**
   * Busca deal por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {Object} [options] - Opções
   * @returns {Promise<Deal|null>}
   */
  async findById(workspaceId, id, options = {}) {
    const query = Deal.findOne({
      _id: toObjectId(id),
      workspaceId: toObjectId(workspaceId),
    });

    if (options.populate) {
      if (options.populate.includes('contact')) {
        query.populate('contactId', 'name email phone avatar company');
      }
      if (options.populate.includes('assignedTo')) {
        query.populate('assignedTo', 'name email avatar');
      }
      if (options.populate.includes('activities')) {
        query.populate({
          path: 'activities',
          options: { sort: { createdAt: -1 }, limit: 20 },
        });
      }
    }

    return query.exec();
  }

  /**
   * Atualiza deal
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {Object} data - Dados para atualizar
   * @returns {Promise<Deal|null>}
   */
  async update(workspaceId, id, data) {
    return Deal.findOneAndUpdate(
      { _id: toObjectId(id), workspaceId: toObjectId(workspaceId) },
      { $set: data },
      { new: true, runValidators: true }
    );
  }

  /**
   * Deleta deal (soft delete)
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do deal
   * @param {string} userId - ID do usuário
   * @returns {Promise<Deal|null>}
   */
  async delete(workspaceId, id, userId) {
    const deal = await this.findById(workspaceId, id);
    if (!deal) return null;
    return deal.softDelete(userId);
  }

  /**
   * Lista deals com filtros
   * @param {string} workspaceId - ID do workspace
   * @param {Object} filters - Filtros
   * @param {Object} options - Opções de paginação/ordenação
   * @returns {Promise<{items: Deal[], total: number}>}
   */
  async list(workspaceId, filters = {}, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = 'createdAt',
      order = 'desc',
    } = options;

    const query = { workspaceId: toObjectId(workspaceId) };

    // Aplica filtros
    if (filters.status) {
      query.status = Array.isArray(filters.status)
        ? { $in: filters.status }
        : filters.status;
    }

    if (filters.pipelineId) {
      query.pipelineId = toObjectId(filters.pipelineId);
    }

    if (filters.stageId) {
      query.stageId = toObjectId(filters.stageId);
    }

    if (filters.contactId) {
      query.contactId = toObjectId(filters.contactId);
    }

    if (filters.assignedTo) {
      query.assignedTo = toObjectId(filters.assignedTo);
    }

    if (filters.priority) {
      query.priority = filters.priority;
    }

    if (filters.tags) {
      const tags = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
      query.tags = { $all: tags };
    }

    if (filters.minValue !== undefined) {
      query.value = { ...query.value, $gte: filters.minValue };
    }

    if (filters.maxValue !== undefined) {
      query.value = { ...query.value, $lte: filters.maxValue };
    }

    if (filters.expectedCloseFrom) {
      query.expectedCloseDate = {
        ...query.expectedCloseDate,
        $gte: new Date(filters.expectedCloseFrom),
      };
    }

    if (filters.expectedCloseTo) {
      query.expectedCloseDate = {
        ...query.expectedCloseDate,
        $lte: new Date(filters.expectedCloseTo),
      };
    }

    if (filters.createdFrom) {
      query.createdAt = { ...query.createdAt, $gte: new Date(filters.createdFrom) };
    }

    if (filters.createdTo) {
      query.createdAt = { ...query.createdAt, $lte: new Date(filters.createdTo) };
    }

    if (filters.search) {
      query.$text = { $search: filters.search };
    }

    // Executa queries
    const skip = (page - 1) * limit;
    const sortObj = { [sort]: order === 'asc' ? 1 : -1 };

    const [items, total] = await Promise.all([
      Deal.find(query)
        .populate('contactId', 'name email phone avatar')
        .populate('assignedTo', 'name email avatar')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Deal.countDocuments(query),
    ]);

    return { items, total };
  }

  /**
   * Obtém deals por pipeline (para Kanban)
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {Object} [filters] - Filtros adicionais
   * @returns {Promise<Deal[]>}
   */
  async getByPipeline(workspaceId, pipelineId, filters = {}) {
    const query = {
      workspaceId: toObjectId(workspaceId),
      pipelineId: toObjectId(pipelineId),
      status: DEAL_STATUS.OPEN,
    };

    if (filters.assignedTo) {
      query.assignedTo = toObjectId(filters.assignedTo);
    }

    if (filters.search) {
      query.$text = { $search: filters.search };
    }

    if (filters.minValue !== undefined) {
      query.value = { $gte: filters.minValue };
    }

    if (filters.maxValue !== undefined) {
      query.value = { ...query.value, $lte: filters.maxValue };
    }

    return Deal.find(query)
      .populate('contactId', 'name email phone avatar')
      .populate('assignedTo', 'name email avatar')
      .sort({ 'stageHistory.enteredAt': -1 })
      .lean();
  }

  /**
   * Obtém estatísticas do pipeline
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @returns {Promise<Object>}
   */
  async getPipelineStats(workspaceId, pipelineId) {
    const result = await Deal.aggregate([
      {
        $match: {
          workspaceId: toObjectId(workspaceId),
          pipelineId: toObjectId(pipelineId),
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: { stageId: '$stageId', status: '$status' },
          count: { $sum: 1 },
          totalValue: { $sum: '$value' },
          weightedValue: {
            $sum: { $multiply: ['$value', { $divide: ['$probability', 100] }] },
          },
          avgProbability: { $avg: '$probability' },
        },
      },
    ]);

    // Organiza por estágio
    const byStage = {};
    const byStatus = { open: 0, won: 0, lost: 0 };
    let totalValue = 0;
    let weightedValue = 0;

    for (const item of result) {
      const stageId = item._id.stageId.toString();
      const status = item._id.status;

      if (!byStage[stageId]) {
        byStage[stageId] = {
          count: 0,
          totalValue: 0,
          weightedValue: 0,
        };
      }

      if (status === DEAL_STATUS.OPEN) {
        byStage[stageId].count += item.count;
        byStage[stageId].totalValue += item.totalValue;
        byStage[stageId].weightedValue += item.weightedValue;
      }

      byStatus[status] = (byStatus[status] || 0) + item.count;
      totalValue += item.totalValue;
      weightedValue += item.weightedValue;
    }

    return {
      byStage,
      byStatus,
      totalValue,
      weightedValue,
    };
  }

  /**
   * Obtém deals com SLA violado
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Deal[]>}
   */
  async getRottingDeals(workspaceId) {
    return Deal.find({
      workspaceId: toObjectId(workspaceId),
      status: DEAL_STATUS.OPEN,
      isRotting: true,
    })
      .populate('contactId', 'name email phone')
      .populate('assignedTo', 'name email')
      .sort({ rottingAt: 1 });
  }

  /**
   * Atualiza status de rotting
   * @param {string} dealId - ID do deal
   * @param {boolean} isRotting - Se está rotting
   * @param {Date} [rottingAt] - Data de início do rotting
   * @returns {Promise<Deal>}
   */
  async updateRottingStatus(dealId, isRotting, rottingAt = null) {
    return Deal.findByIdAndUpdate(
      dealId,
      {
        isRotting,
        rottingAt: isRotting ? rottingAt || new Date() : null,
      },
      { new: true }
    );
  }

  /**
   * Obtém deals por contato
   * @param {string} workspaceId - ID do workspace
   * @param {string} contactId - ID do contato
   * @param {Object} [options] - Opções
   * @returns {Promise<Deal[]>}
   */
  async getByContact(workspaceId, contactId, options = {}) {
    const query = {
      workspaceId: toObjectId(workspaceId),
      contactId: toObjectId(contactId),
    };

    if (options.status) {
      query.status = options.status;
    }

    return Deal.find(query)
      .populate('assignedTo', 'name email avatar')
      .sort({ createdAt: -1 });
  }

  /**
   * Conta deals por critério
   * @param {string} workspaceId - ID do workspace
   * @param {Object} [criteria] - Critérios
   * @returns {Promise<number>}
   */
  async count(workspaceId, criteria = {}) {
    return Deal.countDocuments({
      workspaceId: toObjectId(workspaceId),
      ...criteria,
    });
  }

  /**
   * Obtém estatísticas gerais
   * @param {string} workspaceId - ID do workspace
   * @param {Object} [dateRange] - Range de datas
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId, dateRange = {}) {
    const match = {
      workspaceId: toObjectId(workspaceId),
      deletedAt: null,
    };

    if (dateRange.from || dateRange.to) {
      match.createdAt = {};
      if (dateRange.from) match.createdAt.$gte = new Date(dateRange.from);
      if (dateRange.to) match.createdAt.$lte = new Date(dateRange.to);
    }

    const stats = await Deal.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$value' },
          avgValue: { $avg: '$value' },
          avgCycleTime: { $avg: '$totalCycleTime' },
        },
      },
    ]);

    const result = {
      total: 0,
      open: { count: 0, value: 0 },
      won: { count: 0, value: 0, avgCycleTime: 0 },
      lost: { count: 0, value: 0 },
      avgValue: 0,
      conversionRate: 0,
    };

    let totalValue = 0;
    let closedCount = 0;

    for (const stat of stats) {
      result.total += stat.count;
      totalValue += stat.totalValue;

      switch (stat._id) {
        case DEAL_STATUS.OPEN:
          result.open = { count: stat.count, value: stat.totalValue };
          break;
        case DEAL_STATUS.WON:
          result.won = {
            count: stat.count,
            value: stat.totalValue,
            avgCycleTime: Math.round(stat.avgCycleTime / 1440), // em dias
          };
          closedCount += stat.count;
          break;
        case DEAL_STATUS.LOST:
          result.lost = { count: stat.count, value: stat.totalValue };
          closedCount += stat.count;
          break;
      }
    }

    result.avgValue = result.total > 0 ? Math.round(totalValue / result.total) : 0;
    result.conversionRate = closedCount > 0
      ? Math.round((result.won.count / closedCount) * 100)
      : 0;

    return result;
  }
}

module.exports = new DealRepository();