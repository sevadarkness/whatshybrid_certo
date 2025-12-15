/**
 * @fileoverview Service de Chat com IA
 * @module ai/services/ChatService
 */

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const Assistant = require('../models/Assistant');
const AIConversation = require('../models/AIConversation');
const knowledgeService = require('./KnowledgeService');
const { toObjectId } = require('../../shared/utils/ids');
const AppError = require('../../shared/errors/AppError');
const logger = require('../../infra/logging/Logger');
const config = require('../../config');
const { AI_PROVIDER, AI_MODELS } = require('../constants/aiConstants');

class ChatService {
  constructor() {
    this.clients = {
      [AI_PROVIDER.OPENAI]: new OpenAI({ apiKey: config.ai.openai.apiKey }),
      [AI_PROVIDER.ANTHROPIC]: new Anthropic({ apiKey: config.ai.anthropic.apiKey }),
    };
  }

  /**
   * Envia mensagem para assistente
   * @param {string} workspaceId - ID do workspace
   * @param {string} assistantId - ID do assistente
   * @param {Object} data - Dados da mensagem
   * @returns {Promise<Object>}
   */
  async chat(workspaceId, assistantId, data) {
    const { message, conversationId, contactId, context } = data;
    const startTime = Date.now();

    // Obtém assistente
    const assistant = await Assistant.findOne({
      _id: toObjectId(assistantId),
      workspaceId: toObjectId(workspaceId),
      isActive: true,
    });

    if (!assistant) {
      throw AppError.notFound('Assistente', assistantId);
    }

    // Obtém ou cria conversa
    let aiConversation;
    if (conversationId) {
      aiConversation = await AIConversation.findOne({
        _id: toObjectId(conversationId),
        workspaceId: toObjectId(workspaceId),
        assistantId: assistant._id,
      });
    }

    if (!aiConversation) {
      aiConversation = new AIConversation({
        workspaceId,
        assistantId: assistant._id,
        contactId,
      });
    }

    // Busca conhecimento relevante
    let knowledgeContext = '';
    let knowledgeUsed = [];

    if (assistant.capabilities.canAccessKnowledge) {
      const relevantKnowledge = await knowledgeService.searchRelevant(
        assistant._id,
        message,
        3
      );

      if (relevantKnowledge.length > 0) {
        knowledgeContext = '\n\nContexto relevante:\n' +
          relevantKnowledge.map((k) => k.content).join('\n---\n');
        
        knowledgeUsed = relevantKnowledge.map((k) => ({
          sourceId: k.sourceId,
          sourceName: k.sourceName,
          relevance: k.similarity,
        }));
      }
    }

    // Monta mensagens
    const messages = this.buildMessages(assistant, aiConversation, message, knowledgeContext, context);

    // Chama LLM
    const response = await this.callLLM(assistant, messages);

    const responseTime = Date.now() - startTime;

    // Adiciona mensagens à conversa
    await aiConversation.addMessage({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    await aiConversation.addMessage({
      role: 'assistant',
      content: response.content,
      metadata: {
        model: assistant.model,
        provider: assistant.provider,
        tokensUsed: response.usage,
        responseTime,
        knowledgeUsed,
        confidence: response.confidence,
      },
      timestamp: new Date(),
    });

    // Atualiza estatísticas do assistente
    await assistant.incrementStats('totalMessages', 2);
    await assistant.updateAvgResponseTime(responseTime);

    // Calcula custo
    const cost = this.calculateCost(assistant.provider, assistant.model, response.usage);
    aiConversation.cost.total += cost;
    await aiConversation.save();

    logger.info({
      msg: 'Resposta gerada',
      assistantId,
      conversationId: aiConversation._id,
      responseTime,
      tokensUsed: response.usage?.total,
    });

    return {
      conversationId: aiConversation._id,
      response: response.content,
      metadata: {
        responseTime,
        tokensUsed: response.usage,
        knowledgeUsed,
        model: assistant.model,
      },
    };
  }

  /**
   * Monta array de mensagens
   */
  buildMessages(assistant, conversation, newMessage, knowledgeContext, context) {
    const messages = [];

    // System prompt
    let systemPrompt = assistant.systemPrompt;
    
    // Adiciona contexto de conhecimento
    if (knowledgeContext) {
      systemPrompt += knowledgeContext;
    }

    // Adiciona personalidade
    const personality = assistant.personality;
    systemPrompt += `\n\nTom de voz: ${personality.tone}. Idioma: ${personality.language}.`;
    if (!personality.emoji) {
      systemPrompt += ' Não use emojis.';
    }

    messages.push({ role: 'system', content: systemPrompt });

    // Histórico da conversa (últimas 10 mensagens)
    const history = conversation.messages.slice(-10);
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Mensagens anteriores do contexto
    if (context?.previousMessages) {
      for (const msg of context.previousMessages.slice(-5)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Nova mensagem
    messages.push({ role: 'user', content: newMessage });

    return messages;
  }

  /**
   * Chama LLM
   */
  async callLLM(assistant, messages) {
    const { provider, model, config: aiConfig } = assistant;

    try {
      switch (provider) {
        case AI_PROVIDER.OPENAI:
          return this.callOpenAI(model, messages, aiConfig);
        case AI_PROVIDER.ANTHROPIC:
          return this.callAnthropic(model, messages, aiConfig);
        default:
          throw new Error(`Provider não suportado: ${provider}`);
      }
    } catch (error) {
      logger.error({
        msg: 'Erro ao chamar LLM',
        provider,
        model,
        error: error.message,
      });
      throw AppError.serviceUnavailable('Serviço de IA indisponível');
    }
  }

  /**
   * Chama OpenAI
   */
  async callOpenAI(model, messages, config) {
    const response = await this.clients[AI_PROVIDER.OPENAI].chat.completions.create({
      model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      top_p: config.topP,
      frequency_penalty: config.frequencyPenalty,
      presence_penalty: config.presencePenalty,
    });

    return {
      content: response.choices[0].message.content,
      usage: {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      },
    };
  }

  /**
   * Chama Anthropic
   */
  async callAnthropic(model, messages, config) {
    // Separa system message
    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    const response = await this.clients[AI_PROVIDER.ANTHROPIC].messages.create({
      model,
      max_tokens: config.maxTokens,
      system: systemMessage?.content,
      messages: otherMessages,
    });

    return {
      content: response.content[0].text,
      usage: {
        prompt: response.usage.input_tokens,
        completion: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  /**
   * Calcula custo
   */
  calculateCost(provider, model, usage) {
    const models = AI_MODELS[provider];
    const modelInfo = models?.find((m) => m.id === model);
    
    if (!modelInfo || !usage) return 0;

    const inputCost = (usage.prompt / 1000) * modelInfo.costPer1kInput;
    const outputCost = (usage.completion / 1000) * modelInfo.costPer1kOutput;
    
    return inputCost + outputCost;
  }

  /**
   * Transfere para humano
   * @param {string} workspaceId - ID do workspace
   * @param {string} conversationId - ID da conversa
   * @param {string} userId - ID do usuário para transferir
   * @param {string} reason - Motivo
   */
  async transferToHuman(workspaceId, conversationId, userId, reason) {
    const conversation = await AIConversation.findOne({
      _id: toObjectId(conversationId),
      workspaceId: toObjectId(workspaceId),
    });

    if (!conversation) {
      throw AppError.notFound('Conversa', conversationId);
    }

    await conversation.transfer(userId, reason);

    logger.info({
      msg: 'Conversa transferida para humano',
      conversationId,
      userId,
      reason,
    });

    return conversation;
  }

  /**
   * Adiciona feedback
   */
  async addFeedback(workspaceId, conversationId, messageId, feedback) {
    const conversation = await AIConversation.findOne({
      _id: toObjectId(conversationId),
      workspaceId: toObjectId(workspaceId),
    });

    if (!conversation) {
      throw AppError.notFound('Conversa', conversationId);
    }

    await conversation.addFeedback(messageId, feedback);
    return conversation;
  }
}

module.exports = new ChatService();