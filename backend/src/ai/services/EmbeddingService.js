/**
 * @fileoverview Service de Embeddings
 * @module ai/services/EmbeddingService
 */

const OpenAI = require('openai');
const config = require('../../config');
const logger = require('../../infra/logging/Logger');

class EmbeddingService {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.ai.openai.apiKey,
    });
    this.model = 'text-embedding-3-small';
    this.dimensions = 1536;
  }

  /**
   * Gera embedding para um texto
   * @param {string} text - Texto
   * @returns {Promise<number[]>}
   */
  async generateEmbedding(text) {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text.slice(0, 8000), // Limite de tokens
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error({
        msg: 'Erro ao gerar embedding',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Gera embeddings em batch
   * @param {string[]} texts - Textos
   * @returns {Promise<number[][]>}
   */
  async generateEmbeddings(texts) {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts.map((t) => t.slice(0, 8000)),
      });

      return response.data.map((d) => d.embedding);
    } catch (error) {
      logger.error({
        msg: 'Erro ao gerar embeddings em batch',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calcula similaridade de cosseno
   * @param {number[]} a - Vetor A
   * @param {number[]} b - Vetor B
   * @returns {number}
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

module.exports = new EmbeddingService();