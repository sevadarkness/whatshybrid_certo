/**
 * @fileoverview Controller de Pipeline
 * @module crm/controllers/PipelineController
 */

const pipelineService = require('../services/PipelineService');
const { success, created, noContent } = require('../../shared/utils/response');

class PipelineController {
  /**
   * Cria um novo pipeline
   * POST /api/crm/pipelines
   */
  async create(req, res) {
    const pipeline = await pipelineService.create(
      req.workspace._id,
      req.body,
      req.user._id
    );

    return created(res, pipeline.toPublicJSON(), 'Pipeline criado com sucesso');
  }

  /**
   * Obtém pipeline por ID
   * GET /api/crm/pipelines/:id
   */
  async getById(req, res) {
    const pipeline = await pipelineService.getById(
      req.workspace._id,
      req.params.id
    );

    return success(res, pipeline.toPublicJSON());
  }

  /**
   * Lista pipelines
   * GET /api/crm/pipelines
   */
  async list(req, res) {
    const { isActive } = req.query;
    
    const pipelines = await pipelineService.list(
      req.workspace._id,
      { isActive: isActive !== undefined ? isActive === 'true' : undefined }
    );

    return success(res, pipelines.map((p) => p.toPublicJSON()));
  }

  /**
   * Atualiza pipeline
   * PUT /api/crm/pipelines/:id
   */
  async update(req, res) {
    const pipeline = await pipelineService.update(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );

    return success(res, pipeline.toPublicJSON(), 'Pipeline atualizado com sucesso');
  }

  /**
   * Deleta pipeline
   * DELETE /api/crm/pipelines/:id
   */
  async delete(req, res) {
    await pipelineService.delete(
      req.workspace._id,
      req.params.id,
      req.user._id
    );

    return noContent(res);
  }

  /**
   * Define pipeline como padrão
   * POST /api/crm/pipelines/:id/default
   */
  async setAsDefault(req, res) {
    const pipeline = await pipelineService.setAsDefault(
      req.workspace._id,
      req.params.id,
      req.user._id
    );

    return success(res, pipeline.toPublicJSON(), 'Pipeline definido como padrão');
  }

  /**
   * Adiciona estágio ao pipeline
   * POST /api/crm/pipelines/:id/stages
   */
  async addStage(req, res) {
    const stage = await pipelineService.addStage(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );

    return created(res, stage, 'Estágio adicionado com sucesso');
  }

  /**
   * Atualiza estágio
   * PUT /api/crm/pipelines/:id/stages/:stageId
   */
  async updateStage(req, res) {
    const stage = await pipelineService.updateStage(
      req.workspace._id,
      req.params.id,
      req.params.stageId,
      req.body,
      req.user._id
    );

    return success(res, stage, 'Estágio atualizado com sucesso');
  }

  /**
   * Remove estágio
   * DELETE /api/crm/pipelines/:id/stages/:stageId
   */
  async removeStage(req, res) {
    await pipelineService.removeStage(
      req.workspace._id,
      req.params.id,
      req.params.stageId,
      req.user._id
    );

    return noContent(res);
  }

  /**
   * Reordena estágios
   * PUT /api/crm/pipelines/:id/stages/reorder
   */
  async reorderStages(req, res) {
    const { stageIds } = req.body;

    const pipeline = await pipelineService.reorderStages(
      req.workspace._id,
      req.params.id,
      stageIds,
      req.user._id
    );

    return success(res, pipeline.toPublicJSON(), 'Estágios reordenados com sucesso');
  }
}

module.exports = new PipelineController();