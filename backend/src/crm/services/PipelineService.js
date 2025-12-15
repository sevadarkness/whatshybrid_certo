/**
 * @fileoverview Service de Pipeline
 * @module crm/services/PipelineService
 */

const pipelineRepository = require('../repositories/PipelineRepository');
const dealRepository = require('../repositories/DealRepository');
const AppError = require('../../shared/errors/AppError');
const logger = require('../../infra/logging/Logger');

class PipelineService {
  /**
   * Cria um novo pipeline
   * @param {string} workspaceId - ID do workspace
   * @param {Object} data - Dados do pipeline
   * @param {string} userId - ID do usuário criador
   * @returns {Promise<Pipeline>}
   */
  async create(workspaceId, data, userId) {
    // Verifica se nome já existe
    const nameExists = await pipelineRepository.nameExists(workspaceId, data.name);
    if (nameExists) {
      throw AppError.conflict('Já existe um pipeline com este nome');
    }

    // Se é o primeiro pipeline, define como default
    const count = await pipelineRepository.count(workspaceId);
    if (count === 0) {
      data.isDefault = true;
    }

    // Ordena estágios
    data.stages = data.stages.map((stage, index) => ({
      ...stage,
      order: stage.order ?? index,
    }));

    const pipeline = await pipelineRepository.create({
      ...data,
      workspaceId,
      createdBy: userId,
      updatedBy: userId,
    });

    logger.info({
      msg: 'Pipeline criado',
      pipelineId: pipeline._id,
      workspaceId,
      userId,
    });

    return pipeline;
  }

  /**
   * Obtém pipeline por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do pipeline
   * @returns {Promise<Pipeline>}
   */
  async getById(workspaceId, id) {
    const pipeline = await pipelineRepository.findById(workspaceId, id);
    
    if (!pipeline) {
      throw AppError.notFound('Pipeline', id);
    }

    return pipeline;
  }

  /**
   * Obtém pipeline padrão
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Pipeline>}
   */
  async getDefault(workspaceId) {
    const pipeline = await pipelineRepository.getDefault(workspaceId);
    
    if (!pipeline) {
      throw AppError.notFound('Nenhum pipeline padrão configurado');
    }

    return pipeline;
  }

  /**
   * Lista pipelines
   * @param {string} workspaceId - ID do workspace
   * @param {Object} [options] - Opções
   * @returns {Promise<Pipeline[]>}
   */
  async list(workspaceId, options = {}) {
    return pipelineRepository.list(workspaceId, options);
  }

  /**
   * Atualiza pipeline
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do pipeline
   * @param {Object} data - Dados para atualizar
   * @param {string} userId - ID do usuário
   * @returns {Promise<Pipeline>}
   */
  async update(workspaceId, id, data, userId) {
    const pipeline = await this.getById(workspaceId, id);

    // Verifica nome duplicado
    if (data.name && data.name !== pipeline.name) {
      const nameExists = await pipelineRepository.nameExists(workspaceId, data.name, id);
      if (nameExists) {
        throw AppError.conflict('Já existe um pipeline com este nome');
      }
    }

    const updated = await pipelineRepository.update(workspaceId, id, {
      ...data,
      updatedBy: userId,
    });

    logger.info({
      msg: 'Pipeline atualizado',
      pipelineId: id,
      workspaceId,
      userId,
    });

    return updated;
  }

  /**
   * Deleta pipeline
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do pipeline
   * @param {string} userId - ID do usuário
   * @returns {Promise<void>}
   */
  async delete(workspaceId, id, userId) {
    const pipeline = await this.getById(workspaceId, id);

    // Não permite deletar pipeline default
    if (pipeline.isDefault) {
      throw AppError.validation('Não é possível deletar o pipeline padrão. Defina outro como padrão primeiro.');
    }

    // Verifica se há deals ativos
    const openDeals = await dealRepository.count(workspaceId, {
      pipelineId: id,
      status: 'open',
    });

    if (openDeals > 0) {
      throw AppError.validation(`Não é possível deletar. Existem ${openDeals} negócios abertos neste pipeline.`);
    }

    await pipelineRepository.delete(workspaceId, id, userId);

    logger.info({
      msg: 'Pipeline deletado',
      pipelineId: id,
      workspaceId,
      userId,
    });
  }

  /**
   * Define pipeline como padrão
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do pipeline
   * @param {string} userId - ID do usuário
   * @returns {Promise<Pipeline>}
   */
  async setAsDefault(workspaceId, id, userId) {
    const pipeline = await this.getById(workspaceId, id);

    if (!pipeline.isActive) {
      throw AppError.validation('Não é possível definir um pipeline inativo como padrão');
    }

    const updated = await pipelineRepository.update(workspaceId, id, {
      isDefault: true,
      updatedBy: userId,
    });

    logger.info({
      msg: 'Pipeline definido como padrão',
      pipelineId: id,
      workspaceId,
      userId,
    });

    return updated;
  }

  /**
   * Adiciona estágio ao pipeline
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {Object} stageData - Dados do estágio
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>}
   */
  async addStage(workspaceId, pipelineId, stageData, userId) {
    const pipeline = await this.getById(workspaceId, pipelineId);

    if (pipeline.stages.length >= 20) {
      throw AppError.validation('Limite máximo de 20 estágios atingido');
    }

    const stage = await pipelineRepository.addStage(workspaceId, pipelineId, stageData, userId);

    logger.info({
      msg: 'Estágio adicionado',
      pipelineId,
      stageId: stage._id,
      workspaceId,
      userId,
    });

    return stage;
  }

  /**
   * Atualiza estágio
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {string} stageId - ID do estágio
   * @param {Object} stageData - Dados para atualizar
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>}
   */
  async updateStage(workspaceId, pipelineId, stageId, stageData, userId) {
    await this.getById(workspaceId, pipelineId);

    const stage = await pipelineRepository.updateStage(
      workspaceId,
      pipelineId,
      stageId,
      stageData,
      userId
    );

    if (!stage) {
      throw AppError.notFound('Estágio', stageId);
    }

    logger.info({
      msg: 'Estágio atualizado',
      pipelineId,
      stageId,
      workspaceId,
      userId,
    });

    return stage;
  }

  /**
   * Remove estágio
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {string} stageId - ID do estágio
   * @param {string} userId - ID do usuário
   * @returns {Promise<void>}
   */
  async removeStage(workspaceId, pipelineId, stageId, userId) {
    const pipeline = await this.getById(workspaceId, pipelineId);

    if (pipeline.stages.length <= 1) {
      throw AppError.validation('Pipeline deve ter pelo menos um estágio');
    }

    // Verifica se há deals no estágio
    const dealsInStage = await dealRepository.count(workspaceId, {
      pipelineId,
      stageId,
      status: 'open',
    });

    if (dealsInStage > 0) {
      throw AppError.validation(`Não é possível remover. Existem ${dealsInStage} negócios neste estágio.`);
    }

    const removed = await pipelineRepository.removeStage(workspaceId, pipelineId, stageId, userId);

    if (!removed) {
      throw AppError.notFound('Estágio', stageId);
    }

    logger.info({
      msg: 'Estágio removido',
      pipelineId,
      stageId,
      workspaceId,
      userId,
    });
  }

  /**
   * Reordena estágios
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {string[]} stageIds - IDs na nova ordem
   * @param {string} userId - ID do usuário
   * @returns {Promise<Pipeline>}
   */
  async reorderStages(workspaceId, pipelineId, stageIds, userId) {
    const pipeline = await this.getById(workspaceId, pipelineId);

    // Valida que todos os IDs existem
    const existingIds = pipeline.stages.map((s) => s._id.toString());
    const invalidIds = stageIds.filter((id) => !existingIds.includes(id));

    if (invalidIds.length > 0) {
      throw AppError.validation(`Estágios inválidos: ${invalidIds.join(', ')}`);
    }

    if (stageIds.length !== pipeline.stages.length) {
      throw AppError.validation('A lista deve conter todos os estágios');
    }

    const updated = await pipelineRepository.reorderStages(workspaceId, pipelineId, stageIds, userId);

    logger.info({
      msg: 'Estágios reordenados',
      pipelineId,
      workspaceId,
      userId,
    });

    return updated;
  }

  /**
   * Cria pipeline padrão para novo workspace
   * @param {string} workspaceId - ID do workspace
   * @param {string} userId - ID do usuário
   * @returns {Promise<Pipeline>}
   */
  async createDefaultPipeline(workspaceId, userId) {
    const defaultPipeline = {
      name: 'Pipeline de Vendas',
      description: 'Pipeline padrão para acompanhamento de vendas',
      isDefault: true,
      stages: [
        { name: 'Novo Lead', color: '#3B82F6', probability: 10 },
        { name: 'Qualificação', color: '#8B5CF6', probability: 25 },
        { name: 'Proposta', color: '#F59E0B', probability: 50 },
        { name: 'Negociação', color: '#EF4444', probability: 75 },
        { name: 'Fechamento', color: '#10B981', probability: 90, isWinStage: true },
      ],
    };

    return this.create(workspaceId, defaultPipeline, userId);
  }
}

module.exports = new PipelineService();