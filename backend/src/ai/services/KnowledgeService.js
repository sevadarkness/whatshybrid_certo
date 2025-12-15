/**
 * @fileoverview Service de Knowledge
 * @module ai/services/KnowledgeService
 */

const KnowledgeSource = require('../models/KnowledgeSource');
const Assistant = require('../models/Assistant');
const { toObjectId } = require('../../shared/utils/ids');
const AppError = require('../../shared/errors/AppError');
const logger = require('../../infra/logging/Logger');
const embeddingService = require('./EmbeddingService');
const { KNOWLEDGE_STATUS, AI_LIMITS } = require('../constants/aiConstants');

class KnowledgeService {
  /**
   * Adiciona fonte de conhecimento
   * @param {string} workspaceId - ID do workspace
   * @param {string} assistantId - ID do assistente
   * @param {Object} data - Dados da fonte
   * @param {string} userId - ID do usuário
   * @returns {Promise<KnowledgeSource>}
   */
  async create(workspaceId, assistantId, data, userId) {
    // Verifica se assistente existe
    const assistant = await Assistant.findOne({
      _id: toObjectId(assistantId),
      workspaceId: toObjectId(workspaceId),
    });

    if (!assistant) {
      throw AppError.notFound('Assistente', assistantId);
    }

    // Verifica limite do plano
    const workspace = await this.getWorkspaceWithPlan(workspaceId);
    const currentCount = await KnowledgeSource.countDocuments({
      workspaceId: toObjectId(workspaceId),
    });
    const limit = AI_LIMITS[workspace.plan]?.knowledgeSources || 3;

    if (limit !== -1 && currentCount >= limit) {
      throw AppError.paymentRequired(`Limite de ${limit} fontes de conhecimento atingido.`);
    }

    const source = new KnowledgeSource({
      ...data,
      workspaceId,
      assistantId,
      createdBy: userId,
    });

    await source.save();

    // Processa em background
    this.processSource(source._id).catch((err) => {
      logger.error({ msg: 'Erro ao processar fonte', sourceId: source._id, error: err });
    });

    logger.info({
      msg: 'Fonte de conhecimento criada',
      sourceId: source._id,
      assistantId,
      workspaceId,
    });

    return source;
  }

  /**
   * Obtém fonte por ID
   * @param {string} workspaceId - ID do workspace
   * @param {string} assistantId - ID do assistente
   * @param {string} id - ID da fonte
   * @returns {Promise<KnowledgeSource>}
   */
  async getById(workspaceId, assistantId, id) {
    const source = await KnowledgeSource.findOne({
      _id: toObjectId(id),
      workspaceId: toObjectId(workspaceId),
      assistantId: toObjectId(assistantId),
    });

    if (!source) {
      throw AppError.notFound('Fonte de conhecimento', id);
    }

    return source;
  }

  /**
   * Lista fontes de conhecimento
   * @param {string} workspaceId - ID do workspace
   * @param {string} assistantId - ID do assistente
   * @returns {Promise<KnowledgeSource[]>}
   */
  async list(workspaceId, assistantId) {
    return KnowledgeSource.find({
      workspaceId: toObjectId(workspaceId),
      assistantId: toObjectId(assistantId),
    }).sort({ createdAt: -1 });
  }

  /**
   * Deleta fonte
   * @param {string} workspaceId - ID do workspace
   * @param {string} assistantId - ID do assistente
   * @param {string} id - ID da fonte
   */
  async delete(workspaceId, assistantId, id) {
    const source = await this.getById(workspaceId, assistantId, id);

    // Se tem arquivo, deletar do storage
    if (source.file?.s3Key) {
      // TODO: Deletar do S3
    }

    await source.deleteOne();

    logger.info({
      msg: 'Fonte de conhecimento deletada',
      sourceId: id,
      assistantId,
      workspaceId,
    });
  }

  /**
   * Reprocessa fonte
   * @param {string} workspaceId - ID do workspace
   * @param {string} assistantId - ID do assistente
   * @param {string} id - ID da fonte
   */
  async reprocess(workspaceId, assistantId, id) {
    const source = await this.getById(workspaceId, assistantId, id);
    
    source.status = KNOWLEDGE_STATUS.PENDING;
    source.processingError = null;
    source.chunks = [];
    await source.save();

    this.processSource(source._id).catch((err) => {
      logger.error({ msg: 'Erro ao reprocessar fonte', sourceId: id, error: err });
    });
  }

  /**
   * Processa fonte de conhecimento
   * @param {string} sourceId - ID da fonte
   */
  async processSource(sourceId) {
    const source = await KnowledgeSource.findById(sourceId);
    if (!source) return;

    try {
      await source.markAsProcessing();

      let chunks = [];

      switch (source.type) {
        case 'text':
          chunks = await this.processText(source.content);
          break;
        case 'url':
          chunks = await this.processUrl(source.url);
          break;
        case 'file':
          chunks = await this.processFile(source.file);
          break;
        case 'faq':
          chunks = await this.processFaqs(source.faqs);
          break;
        default:
          throw new Error(`Tipo não suportado: ${source.type}`);
      }

      // Gera embeddings para cada chunk
      const chunksWithEmbeddings = await Promise.all(
        chunks.map(async (chunk) => ({
          ...chunk,
          embedding: await embeddingService.generateEmbedding(chunk.content),
        }))
      );

      await source.markAsReady(chunksWithEmbeddings);

      logger.info({
        msg: 'Fonte processada com sucesso',
        sourceId,
        chunksCount: chunksWithEmbeddings.length,
      });
    } catch (error) {
      await source.markAsError(error);
      logger.error({
        msg: 'Erro ao processar fonte',
        sourceId,
        error: error.message,
      });
    }
  }

  /**
   * Processa texto
   */
  async processText(content) {
    const chunks = [];
    const chunkSize = 1000;
    const overlap = 200;

    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      chunks.push({
        content: content.slice(i, i + chunkSize),
        metadata: { source: 'text', position: i },
      });
    }

    return chunks;
  }

  /**
   * Processa URL
   */
  async processUrl(url) {
    // TODO: Implementar web scraping
    const axios = require('axios');
    const cheerio = require('cheerio');

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    // Remove scripts e styles
    $('script, style').remove();
    
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    
    return this.processText(text);
  }

  /**
   * Processa arquivo
   */
  async processFile(file) {
    // TODO: Implementar processamento de PDF, DOCX, etc.
    throw new Error('Processamento de arquivos não implementado');
  }

  /**
   * Processa FAQs
   */
  async processFaqs(faqs) {
    return faqs.map((faq, index) => ({
      content: `Pergunta: ${faq.question}\nResposta: ${faq.answer}`,
      metadata: {
        source: 'faq',
        position: index,
        question: faq.question,
        keywords: faq.keywords,
      },
    }));
  }

  /**
   * Busca conhecimento relevante
   * @param {string} assistantId - ID do assistente
   * @param {string} query - Consulta
   * @param {number} [topK=5] - Número de resultados
   * @returns {Promise<Object[]>}
   */
  async searchRelevant(assistantId, query, topK = 5) {
    const sources = await KnowledgeSource.getReadySources(assistantId);
    
    if (sources.length === 0) {
      return [];
    }

    const queryEmbedding = await embeddingService.generateEmbedding(query);
    
    // Coleta todos os chunks
    const allChunks = [];
    for (const source of sources) {
      for (const chunk of source.chunks) {
        allChunks.push({
          sourceId: source._id,
          sourceName: source.name,
          content: chunk.content,
          embedding: chunk.embedding,
          metadata: chunk.metadata,
        });
      }
    }

    // Calcula similaridade
    const withSimilarity = allChunks.map((chunk) => ({
      ...chunk,
      similarity: embeddingService.cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    // Ordena e retorna top K
    withSimilarity.sort((a, b) => b.similarity - a.similarity);
    
    const results = withSimilarity.slice(0, topK).filter((r) => r.similarity > 0.7);

    // Incrementa hit count das fontes usadas
    const sourceIds = [...new Set(results.map((r) => r.sourceId.toString()))];
    await KnowledgeSource.updateMany(
      { _id: { $in: sourceIds } },
      { $inc: { 'stats.hitCount': 1 } }
    );

    return results;
  }

  /**
   * Helper para obter workspace com plano
   */
  async getWorkspaceWithPlan(workspaceId) {
    const Workspace = require('../../team/models/Workspace');
    return Workspace.findById(workspaceId);
  }
}

module.exports = new KnowledgeService();