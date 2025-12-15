/**
 * @fileoverview Controller de Knowledge Base
 * @module ai/controllers/KnowledgeController
 */

const knowledgeService = require('../services/KnowledgeService');
const { success, created, noContent } = require('../../shared/utils/response');

class KnowledgeController {
  /**
   * Cria knowledge base
   * POST /api/ai/knowledge-bases
   */
  async create(req, res) {
    const knowledgeBase = await knowledgeService.create(
      req.workspace._id,
      req.body,
      req.user._id
    );
    return created(res, knowledgeBase.toPublicJSON(), 'Knowledge base criada');
  }

  /**
   * Lista knowledge bases
   * GET /api/ai/knowledge-bases
   */
  async list(req, res) {
    const knowledgeBases = await knowledgeService.list(req.workspace._id);
    return success(res, knowledgeBases.map((kb) => kb.toPublicJSON()));
  }

  /**
   * Obtém knowledge base por ID
   * GET /api/ai/knowledge-bases/:id
   */
  async getById(req, res) {
    const knowledgeBase = await knowledgeService.getById(
      req.workspace._id,
      req.params.id
    );
    return success(res, knowledgeBase.toPublicJSON());
  }

  /**
   * Atualiza knowledge base
   * PUT /api/ai/knowledge-bases/:id
   */
  async update(req, res) {
    const knowledgeBase = await knowledgeService.update(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );
    return success(res, knowledgeBase.toPublicJSON(), 'Knowledge base atualizada');
  }

  /**
   * Deleta knowledge base
   * DELETE /api/ai/knowledge-bases/:id
   */
  async delete(req, res) {
    await knowledgeService.delete(req.workspace._id, req.params.id, req.user._id);
    return noContent(res);
  }

  /**
   * Adiciona fonte
   * POST /api/ai/knowledge-bases/:id/sources
   */
  async addSource(req, res) {
    const source = await knowledgeService.addSource(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );
    return created(res, source, 'Fonte adicionada e sendo processada');
  }

  /**
   * Remove fonte
   * DELETE /api/ai/knowledge-bases/:id/sources/:sourceId
   */
  async removeSource(req, res) {
    await knowledgeService.removeSource(
      req.workspace._id,
      req.params.id,
      req.params.sourceId
    );
    return noContent(res);
  }

  /**
   * Reprocessa fonte
   * POST /api/ai/knowledge-bases/:id/sources/:sourceId/reprocess
   */
  async reprocessSource(req, res) {
    await knowledgeService.processSource(
      req.workspace._id,
      req.params.id,
      req.params.sourceId
    );
    return success(res, null, 'Fonte sendo reprocessada');
  }

  /**
   * Busca na knowledge base
   * POST /api/ai/knowledge-bases/search
   */
  async search(req, res) {
    const { knowledgeBaseIds, query, topK, scoreThreshold } = req.body;
    const results = await knowledgeService.search(
      req.workspace._id,
      knowledgeBaseIds,
      query,
      { topK, scoreThreshold }
    );
    return success(res, results);
  }
}

module.exports = new KnowledgeController();