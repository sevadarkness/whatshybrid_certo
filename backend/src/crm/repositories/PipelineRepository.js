/**
 * @fileoverview Repository de Pipeline
 * @module crm/repositories/PipelineRepository
 */

const Pipeline = require('../models/Pipeline');
const { toObjectId } = require('../../shared/utils/ids');

class PipelineRepository {
  /**
   * Cria um novo pipeline
   * @param {Object} data - Dados do pipeline
   * @returns {Promise<Pipeline>}
   */
  async create(data) {
    const pipeline = new Pipeline(data);
    return pipeline.save();
  }

  /**
   * Busca pipeline por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do pipeline
   * @returns {Promise<Pipeline|null>}
   */
  async findById(workspaceId, id) {
    return Pipeline.findOne({
      _id: toObjectId(id),
      workspaceId: toObjectId(workspaceId),
    });
  }

  /**
   * Obtém pipeline padrão
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Pipeline|null>}
   */
  async getDefault(workspaceId) {
    return Pipeline.getDefault(workspaceId);
  }

  /**
   * Lista pipelines ativos
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<Pipeline[]>}
   */
  async listActive(workspaceId) {
    return Pipeline.getActive(workspaceId);
  }

  /**
   * Lista todos os pipelines
   * @param {string} workspaceId - ID do workspace
   * @param {Object} [options] - Opções
   * @returns {Promise<Pipeline[]>}
   */
  async list(workspaceId, options = {}) {
    const query = { workspaceId: toObjectId(workspaceId) };

    if (options.isActive !== undefined) {
      query.isActive = options.isActive;
    }

    return Pipeline.find(query).sort({ isDefault: -1, name: 1 });
  }

  /**
   * Atualiza pipeline
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do pipeline
   * @param {Object} data - Dados para atualizar
   * @returns {Promise<Pipeline|null>}
   */
  async update(workspaceId, id, data) {
    return Pipeline.findOneAndUpdate(
      { _id: toObjectId(id), workspaceId: toObjectId(workspaceId) },
      { $set: data },
      { new: true, runValidators: true }
    );
  }

  /**
   * Deleta pipeline (soft delete)
   * @param {string} workspaceId - ID do workspace
   * @param {string} id - ID do pipeline
   * @param {string} userId - ID do usuário
   * @returns {Promise<Pipeline|null>}
   */
  async delete(workspaceId, id, userId) {
    const pipeline = await this.findById(workspaceId, id);
    if (!pipeline) return null;
    return pipeline.softDelete(userId);
  }

  /**
   * Busca estágio por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {string} stageId - ID do estágio
   * @returns {Promise<Object|null>}
   */
  async findStageById(workspaceId, pipelineId, stageId) {
    const pipeline = await this.findById(workspaceId, pipelineId);
    if (!pipeline) return null;
    return pipeline.getStageById(stageId);
  }

  /**
   * Adiciona estágio
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {Object} stageData - Dados do estágio
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object|null>}
   */
  async addStage(workspaceId, pipelineId, stageData, userId) {
    const pipeline = await this.findById(workspaceId, pipelineId);
    if (!pipeline) return null;
    return pipeline.addStage(stageData, userId);
  }

  /**
   * Atualiza estágio
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {string} stageId - ID do estágio
   * @param {Object} stageData - Dados para atualizar
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object|null>}
   */
  async updateStage(workspaceId, pipelineId, stageId, stageData, userId) {
    const pipeline = await this.findById(workspaceId, pipelineId);
    if (!pipeline) return null;
    return pipeline.updateStage(stageId, stageData, userId);
  }

  /**
   * Remove estágio
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {string} stageId - ID do estágio
   * @param {string} userId - ID do usuário
   * @returns {Promise<boolean>}
   */
  async removeStage(workspaceId, pipelineId, stageId, userId) {
    const pipeline = await this.findById(workspaceId, pipelineId);
    if (!pipeline) return false;
    return pipeline.removeStage(stageId, userId);
  }

  /**
   * Reordena estágios
   * @param {string} workspaceId - ID do workspace
   * @param {string} pipelineId - ID do pipeline
   * @param {string[]} stageIds - IDs dos estágios na nova ordem
   * @param {string} userId - ID do usuário
   * @returns {Promise<Pipeline|null>}
   */
  async reorderStages(workspaceId, pipelineId, stageIds, userId) {
    const pipeline = await this.findById(workspaceId, pipelineId);
    if (!pipeline) return null;
    await pipeline.reorderStages(stageIds, userId);
    return pipeline;
  }

  /**
   * Atualiza métricas do pipeline
   * @param {string} pipelineId - ID do pipeline
   * @param {Object} metrics - Métricas
   * @returns {Promise<Pipeline>}
   */
  async updateMetrics(pipelineId, metrics) {
    return Pipeline.findByIdAndUpdate(
      pipelineId,
      { $set: { metrics } },
      { new: true }
    );
  }

  /**
   * Conta pipelines
   * @param {string} workspaceId - ID do workspace
   * @returns {Promise<number>}
   */
  async count(workspaceId) {
    return Pipeline.countDocuments({
      workspaceId: toObjectId(workspaceId),
      deletedAt: null,
    });
  }

  /**
   * Verifica se nome já existe
   * @param {string} workspaceId - ID do workspace
   * @param {string} name - Nome do pipeline
   * @param {string} [excludeId] - ID para excluir da busca
   * @returns {Promise<boolean>}
   */
  async nameExists(workspaceId, name, excludeId = null) {
    const query = {
      workspaceId: toObjectId(workspaceId),
      name,
      deletedAt: null,
    };

    if (excludeId) {
      query._id = { $ne: toObjectId(excludeId) };
    }

    const count = await Pipeline.countDocuments(query);
    return count > 0;
  }
}

module.exports = new PipelineRepository();
