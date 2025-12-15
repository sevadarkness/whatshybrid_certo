/**
 * @fileoverview Controller de Assistant
 * @module ai/controllers/AssistantController
 */

const assistantService = require('../services/AssistantService');
const knowledgeService = require('../services/KnowledgeService');
const chatService = require('../services/ChatService');
const { success, created, noContent } = require('../../shared/utils/response');

class AssistantController {
  /**
   * Cria assistente
   * POST /api/ai/assistants
   */
  async create(req, res) {
    const assistant = await assistantService.create(
      req.workspace._id,
      req.body,
      req.user._id
    );
    return created(res, assistant.toPublicJSON(), 'Assistente criado com sucesso');
  }

  /**
   * Lista assistentes
   * GET /api/ai/assistants
   */
  async list(req, res) {
    const { isActive, type } = req.query;
    const assistants = await assistantService.list(req.workspace._id, { isActive, type });
    return success(res, assistants.map((a) => a.toPublicJSON()));
  }

  /**
   * Obtém assistente
   * GET /api/ai/assistants/:id
   */
  async getById(req, res) {
    const assistant = await assistantService.getById(req.workspace._id, req.params.id);
    return success(res, assistant.toPublicJSON());
  }

  /**
   * Atualiza assistente
   * PUT /api/ai/assistants/:id
   */
  async update(req, res) {
    const assistant = await assistantService.update(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );
    return success(res, assistant.toPublicJSON(), 'Assistente atualizado');
  }

  /**
   * Deleta assistente
   * DELETE /api/ai/assistants/:id
   */
  async delete(req, res) {
    await assistantService.delete(req.workspace._id, req.params.id, req.user._id);
    return noContent(res);
  }

  /**
   * Ativa/desativa assistente
   * PATCH /api/ai/assistants/:id/status
   */
  async setStatus(req, res) {
    const { isActive } = req.body;
    const assistant = await assistantService.setActive(
      req.workspace._id,
      req.params.id,
      isActive,
      req.user._id
    );
    return success(res, assistant.toPublicJSON());
  }

  /**
   * Duplica assistente
   * POST /api/ai/assistants/:id/duplicate
   */
  async duplicate(req, res) {
    const { name } = req.body;
    const assistant = await assistantService.duplicate(
      req.workspace._id,
      req.params.id,
      name,
      req.user._id
    );
    return created(res, assistant.toPublicJSON(), 'Assistente duplicado');
  }

  /**
   * Obtém estatísticas
   * GET /api/ai/assistants/:id/stats
   */
  async getStats(req, res) {
    const stats = await assistantService.getStats(req.workspace._id, req.params.id);
    return success(res, stats);
  }

  // --- Knowledge Sources ---

  /**
   * Adiciona fonte de conhecimento
   * POST /api/ai/assistants/:id/knowledge
   */
  async addKnowledge(req, res) {
    const source = await knowledgeService.create(
      req.workspace._id,
      req.params.id,
      req.body,
      req.user._id
    );
    return created(res, source.toPublicJSON(), 'Fonte adicionada');
  }

  /**
   * Lista fontes de conhecimento
   * GET /api/ai/assistants/:id/knowledge
   */
  async listKnowledge(req, res) {
    const sources = await knowledgeService.list(req.workspace._id, req.params.id);
    return success(res, sources.map((s) => s.toPublicJSON()));
  }

  /**
   * Remove fonte de conhecimento
   * DELETE /api/ai/assistants/:id/knowledge/:knowledgeId
   */
  async removeKnowledge(req, res) {
    await knowledgeService.delete(
      req.workspace._id,
      req.params.id,
      req.params.knowledgeId
    );
    return noContent(res);
  }

  /**
   * Reprocessa fonte
   * POST /api/ai/assistants/:id/knowledge/:knowledgeId/reprocess
   */
  async reprocessKnowledge(req, res) {
    await knowledgeService.reprocess(
      req.workspace._id,
      req.params.id,
      req.params.knowledgeId
    );
    return success(res, null, 'Reprocessamento iniciado');
  }

  // --- Chat ---

  /**
   * Chat com assistente
   * POST /api/ai/assistants/:id/chat
   */
  async chat(req, res) {
    const response = await chatService.chat(
      req.workspace._id,
      req.params.id,
      req.body
    );
    return success(res, response);
  }

  /**
   * Transfere para humano
   * POST /api/ai/conversations/:conversationId/transfer
   */
  async transfer(req, res) {
    const { userId, reason } = req.body;
    const conversation = await chatService.transferToHuman(
      req.workspace._id,
      req.params.conversationId,
      userId,
      reason
    );
    return success(res, conversation.toPublicJSON(), 'Transferido com sucesso');
  }

  /**
   * Adiciona feedback
   * POST /api/ai/conversations/:conversationId/feedback
   */
  async addFeedback(req, res) {
    const { messageId, ...feedback } = req.body;
    await chatService.addFeedback(
      req.workspace._id,
      req.params.conversationId,
      messageId,
      feedback
    );
    return success(res, null, 'Feedback registrado');
  }
}

module.exports = new AssistantController();