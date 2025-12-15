/**
 * @fileoverview Service de Assistant
 * @module ai/services/AssistantService
 */

const Assistant = require('../models/Assistant');
const KnowledgeSource = require('../models/KnowledgeSource');
const { toObjectId } = require('../../shared/utils/ids');
const AppError = require('../../shared/errors/AppError');
const logger = require('../../infra/logging/Logger');
const { AI_LIMITS } = require('../constants/aiConstants');

class AssistantService {
  /**
   * Cria um novo assistente
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados do assistente
   * @param {string} userId - ID do usuário criador
   * @returns {Promise<Assistant>}
   */
  async create(workspaceId, data, userId) {
    // Verifica limite do plano
    const workspace = await this.getWorkspaceWithPlan(workspaceId);
    const currentCount = await Assistant.countDocuments({ workspaceId: toObjectId(workspaceId) });
    const limit = AI_LIMITS[workspace.plan]?.assistants || 1;

    if (limit !== -1 && currentCount >= limit) {
      throw AppError.paymentRequired(`Limite de ${limit} assistentes atingido. Faça upgrade do plano.`);
    }

    // Verifica nome duplicado
    const nameExists = await Assistant.findOne({
      workspaceId: toObjectId(workspaceId),
      name: data.name,
    });

    if (nameExists) {
      throw AppError.conflict('Já existe um assistente com este nome');
    }

    const assistant = new Assistant({
      ...data,
      workspaceId,
      createdBy: userId,
      updatedBy: userId,
    });

    await assistant.save();

    logger.info({
      msg: 'Assistente criado',
      assistantId: assistant._id,
      workspaceId,
      userId,
    });

    return assistant;
  }

  /**
   * Obtém assistente por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do assistente
   * @returns {Promise<Assistant>}
   */
  async getById(workspaceId, id) {
    const assistant = await Assistant.findOne({
      _id: toObjectId(id),
      workspaceId: toObjectId(workspaceId),
    }).populate('knowledgeSources');

    if (!assistant) {
      throw AppError.notFound('Assistente', id);
    }

    return assistant;
  }

  /**
   * Lista assistentes
   * @param {string} workspaceId - ID do workspace
   * @param {Object} [options] - Opções
   * @returns {Promise<Assistant[]>}
   */
  async list(workspaceId, options = {}) {
    const query = { workspaceId: toObjectId(workspaceId) };

    if (options.isActive !== undefined) {
      query.isActive = options.isActive;
    }

    if (options.type) {
      query.type = options.type;
    }

    return Assistant.find(query)
      .populate('channels', 'name type')
      .sort({ name: 1 });
  }

  /**
   * Atualiza assistente
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do assistente
   * @param {Object} data - Dados para atualizar
   * @param {string} userId - ID do usuário
   * @returns {Promise<Assistant>}
   */
  async update(workspaceId, id, data, userId) {
    const assistant = await this.getById(workspaceId, id);

    // Verifica nome duplicado
    if (data.name && data.name !== assistant.name) {
      const nameExists = await Assistant.findOne({
        workspaceId: toObjectId(workspaceId),
        name: data.name,
        _id: { $ne: toObjectId(id) },
      });

      if (nameExists) {
        throw AppError.conflict('Já existe um assistente com este nome');
      }
    }

    Object.assign(assistant, data, { updatedBy: userId });
    await assistant.save();

    logger.info({
      msg: 'Assistente atualizado',
      assistantId: id,
      workspaceId,
      userId,
    });

    return assistant;
  }

  /**
   * Deleta assistente
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do assistente
   * @param {string} userId - ID do usuário
   */
  async delete(workspaceId, id, userId) {
    const assistant = await this.getById(workspaceId, id);

    // Remove fontes de conhecimento
    await KnowledgeSource.deleteMany({ assistantId: assistant._id });

    await assistant.deleteOne();

    logger.info({
      msg: 'Assistente deletado',
      assistantId: id,
      workspaceId,
      userId,
    });
  }

  /**
   * Ativa/desativa assistente
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do assistente
   * @param {boolean} isActive - Status
   * @param {string} userId - ID do usuário
   * @returns {Promise<Assistant>}
   */
  async setActive(workspaceId, id, isActive, userId) {
    const assistant = await this.getById(workspaceId, id);
    assistant.isActive = isActive;
    assistant.updatedBy = userId;
    await assistant.save();
    return assistant;
  }

  /**
   * Obtém assistente para um canal
   * @param {string} workspaceId - ID do workspace
   * @param {string} channelId - ID do canal
   * @returns {Promise<Assistant|null>}
   */
  async getByChannel(workspaceId, channelId) {
    return Assistant.findByChannel(workspaceId, channelId);
  }

  /**
   * Duplica assistente
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do assistente
   * @param {string} newName - Novo nome
   * @param {string} userId - ID do usuário
   * @returns {Promise<Assistant>}
   */
  async duplicate(workspaceId, id, newName, userId) {
    const original = await this.getById(workspaceId, id);

    const data = original.toObject();
    delete data._id;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.stats;

    data.name = newName;
    data.channels = []; // Não copia canais

    return this.create(workspaceId, data, userId);
  }

  /**
   * Obtém estatísticas do assistente
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do assistente
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId, id) {
    const assistant = await this.getById(workspaceId, id);
    
    const AIConversation = require('../models/AIConversation');
    
    const [conversationStats] = await AIConversation.aggregate([
      {
        $match: {
          assistantId: assistant._id,
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: null,
          totalConversations: { $sum: 1 },
          totalMessages: { $sum: '$stats.messageCount' },
          avgDuration: { $avg: '$stats.duration' },
          totalCost: { $sum: '$cost.total' },
          outcomes: {
            $push: '$outcome',
          },
        },
      },
    ]);

    return {
      assistant: assistant.stats,
      last30Days: conversationStats || {
        totalConversations: 0,
        totalMessages: 0,
        avgDuration: 0,
        totalCost: 0,
      },
    };
  }

  /**
   * Helper para obter workspace com plano
   */
  async getWorkspaceWithPlan(workspaceId) {
    const Workspace = require('../../team/models/Workspace');
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace', workspaceId);
    }
    return workspace;
  }
}

module.exports = new AssistantService();