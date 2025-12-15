/**
 * @fileoverview Service de Activity
 * @module crm/services/ActivityService
 */

const Activity = require('../models/Activity');
const { toObjectId } = require('../../shared/utils/ids');
const AppError = require('../../shared/errors/AppError');
const logger = require('../../infra/logging/Logger');

class ActivityService {
  /**
   * Cria uma nova atividade
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados da atividade
   * @param {string} userId - ID do usuário criador
   * @returns {Promise<Activity>}
   */
  async create(workspaceId, data, userId) {
    const activity = new Activity({
      ...data,
      workspaceId,
      createdBy: userId,
      updatedBy: userId,
    });

    await activity.save();

    logger.debug({
      msg: 'Atividade criada',
      activityId: activity._id,
      type: activity.type,
      workspaceId,
    });

    return activity;
  }

  /**
   * Obtém atividade por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID da atividade
   * @returns {Promise<Activity>}
   */
  async getById(workspaceId, id) {
    const activity = await Activity.findOne({
      _id: toObjectId(id),
      workspaceId: toObjectId(workspaceId),
    })
      .populate('createdBy', 'name email avatar')
      .populate('contactId', 'name email phone')
      .populate('dealId', 'title value');

    if (!activity) {
      throw AppError.notFound('Atividade', id);
    }

    return activity;
  }

  /**
   * Atualiza atividade
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID da atividade
   * @param {Object} data - Dados para atualizar
   * @param {string} userId - ID do usuário
   * @returns {Promise<Activity>}
   */
  async update(workspaceId, id, data, userId) {
    const activity = await Activity.findOneAndUpdate(
      { _id: toObjectId(id), workspaceId: toObjectId(workspaceId) },
      { ...data, updatedBy: userId },
      { new: true, runValidators: true }
    );

    if (!activity) {
      throw AppError.notFound('Atividade', id);
    }

    return activity;
  }

  /**
   * Deleta atividade
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID da atividade
   * @returns {Promise<void>}
   */
  async delete(workspaceId, id) {
    const result = await Activity.deleteOne({
      _id: toObjectId(id),
      workspaceId: toObjectId(workspaceId),
    });

    if (result.deletedCount === 0) {
      throw AppError.notFound('Atividade', id);
    }
  }

  /**
   * Lista atividades
   * @param {string} workspaceId - ID do workspace
   * @param {Object} filters - Filtros
   * @param {Object} options - Opções de paginação
   * @returns {Promise<{items: Activity[], total: number}>}
   */
  async list(workspaceId, filters = {}, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = 'createdAt',
      order = 'desc',
    } = options;

    const query = { workspaceId: toObjectId(workspaceId) };

    if (filters.type) {
      query.type = Array.isArray(filters.type) ? { $in: filters.type } : filters.type;
    }

    if (filters.contactId) {
      query.contactId = toObjectId(filters.contactId);
    }

    if (filters.dealId) {
      query.dealId = toObjectId(filters.dealId);
    }

    if (filters.createdBy) {
      query.createdBy = toObjectId(filters.createdBy);
    }

    if (filters.isCompleted !== undefined) {
      query.isCompleted = filters.isCompleted;
    }

    if (filters.dueDateFrom) {
      query.dueDate = { ...query.dueDate, $gte: new Date(filters.dueDateFrom) };
    }

    if (filters.dueDateTo) {
      query.dueDate = { ...query.dueDate, $lte: new Date(filters.dueDateTo) };
    }

    if (filters.createdFrom) {
      query.createdAt = { ...query.createdAt, $gte: new Date(filters.createdFrom) };
    }

    if (filters.createdTo) {
      query.createdAt = { ...query.createdAt, $lte: new Date(filters.createdTo) };
    }

    const skip = (page - 1) * limit;
    const sortObj = { [sort]: order === 'asc' ? 1 : -1 };

    const [items, total] = await Promise.all([
      Activity.find(query)
        .populate('createdBy', 'name email avatar')
        .populate('contactId', 'name')
        .populate('dealId', 'title')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Activity.countDocuments(query),
    ]);

    return { items, total };
  }

  /**
   * Obtém timeline de um contato ou deal
   * @param {string} workspaceId - ID do workspace
   * @param {Object} options - Opções
   * @returns {Promise<Activity[]>}
   */
  async getTimeline(workspaceId, options = {}) {
    return Activity.getTimeline(workspaceId, options);
  }

  /**
   * Marca atividade como completa
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID da atividade
   * @param {string} userId - ID do usuário
   * @param {Object} [data] - Dados adicionais
   * @returns {Promise<Activity>}
   */
  async markComplete(workspaceId, id, userId, data = {}) {
    const activity = await this.getById(workspaceId, id);
    
    activity.isCompleted = true;
    activity.completedAt = data.completedAt || new Date();
    activity.completedBy = userId;
    activity.updatedBy = userId;

    if (data.notes) {
      activity.description = activity.description
        ? `${activity.description}\n\n---\nNotas de conclusão: ${data.notes}`
        : `Notas de conclusão: ${data.notes}`;
    }

    await activity.save();

    return activity;
  }

  /**
   * Marca atividade como incompleta
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID da atividade
   * @param {string} userId - ID do usuário
   * @returns {Promise<Activity>}
   */
  async markIncomplete(workspaceId, id, userId) {
    const activity = await this.getById(workspaceId, id);
    
    activity.isCompleted = false;
    activity.completedAt = null;
    activity.completedBy = null;
    activity.updatedBy = userId;

    await activity.save();

    return activity;
  }

  /**
   * Obtém tarefas pendentes
   * @param {string} workspaceId - ID do workspace
   * @param {Object} [options] - Opções
   * @returns {Promise<Activity[]>}
   */
  async getPendingTasks(workspaceId, options = {}) {
    return Activity.getPendingTasks(workspaceId, options);
  }

  /**
   * Obtém tarefas atrasadas
   * @param {string} workspaceId - ID do workspace
   * @param {string} [userId] - Filtrar por usuário
   * @returns {Promise<Activity[]>}
   */
  async getOverdueTasks(workspaceId, userId = null) {
    const query = {
      workspaceId: toObjectId(workspaceId),
      isCompleted: false,
      dueDate: { $lt: new Date() },
    };

    if (userId) {
      query.createdBy = toObjectId(userId);
    }

    return Activity.find(query)
      .populate('contactId', 'name')
      .populate('dealId', 'title')
      .sort({ dueDate: 1 });
  }

  /**
   * Cria atividade do sistema
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados da atividade
   * @returns {Promise<Activity>}
   */
  async createSystemActivity(workspaceId, data) {
    return Activity.createSystemActivity({
      ...data,
      workspaceId,
    });
  }

  /**
   * Conta atividades por período
   * @param {string} workspaceId - ID do workspace
   * @param {Date} from - Data inicial
   * @param {Date} to - Data final
   * @returns {Promise<Object>}
   */
  async countByPeriod(workspaceId, from, to) {
    const result = await Activity.aggregate([
      {
        $match: {
          workspaceId: toObjectId(workspaceId),
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
    ]);

    return result.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
  }
}

module.exports = new ActivityService();