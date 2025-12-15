/**
 * @fileoverview Service de provedores de AI
 * @module ai/services/AIProviderService
 */

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const config = require('../../config');
const logger = require('../../infra/logging/Logger');
const { AI_PROVIDER, AI_MODELS } = require('../constants/aiConstants');

class AIProviderService {
  constructor() {
    this.providers = {};
    this.initializeProviders();
  }

  /**
   * Inicializa clientes dos provedores
   */
  initializeProviders() {
    if (config.ai?.openai?.apiKey) {
      this.providers[AI_PROVIDER.OPENAI] = new OpenAI({
        apiKey: config.ai.openai.apiKey,
      });
    }

    if (config.ai?.anthropic?.apiKey) {
      this.providers[AI_PROVIDER.ANTHROPIC] = new Anthropic({
        apiKey: config.ai.anthropic.apiKey,
      });
    }

    if (config.ai?.google?.apiKey) {
      this.providers[AI_PROVIDER.GOOGLE] = new GoogleGenerativeAI(config.ai.google.apiKey);
    }

    if (config.ai?.groq?.apiKey) {
      this.providers[AI_PROVIDER.GROQ] = new Groq({
        apiKey: config.ai.groq.apiKey,
      });
    }
  }

  /**
   * Obtém cliente do provedor
   * @param {string} provider - Nome do provedor
   * @returns {Object}
   */
  getProvider(provider) {
    const client = this.providers[provider];
    if (!client) {
      throw new Error(`Provedor ${provider} não configurado`);
    }
    return client;
  }

  /**
   * Gera completion
   * @param {Object} options - Opções
   * @returns {Promise<Object>}
   */
  async generateCompletion(options) {
    const {
      provider,
      model,
      messages,
      systemPrompt,
      settings = {},
      tools,
      stream = false,
    } = options;

    const startTime = Date.now();

    try {
      let result;

      switch (provider) {
        case AI_PROVIDER.OPENAI:
        case AI_PROVIDER.GROQ:
          result = await this.generateOpenAICompletion(provider, {
            model,
            messages,
            systemPrompt,
            settings,
            tools,
            stream,
          });
          break;

        case AI_PROVIDER.ANTHROPIC:
          result = await this.generateAnthropicCompletion({
            model,
            messages,
            systemPrompt,
            settings,
            stream,
          });
          break;

        case AI_PROVIDER.GOOGLE:
          result = await this.generateGoogleCompletion({
            model,
            messages,
            systemPrompt,
            settings,
            stream,
          });
          break;

        default:
          throw new Error(`Provedor ${provider} não suportado`);
      }

      const responseTime = Date.now() - startTime;

      return {
        ...result,
        responseTime,
        provider,
        model,
      };
    } catch (error) {
      logger.error({
        msg: 'Erro ao gerar completion',
        provider,
        model,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Gera completion OpenAI/Groq
   */
  async generateOpenAICompletion(provider, options) {
    const client = this.getProvider(provider);
    const {
      model,
      messages,
      systemPrompt,
      settings,
      tools,
      stream,
    } = options;

    const formattedMessages = [];
    
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    
    formattedMessages.push(...messages);

    const requestOptions = {
      model,
      messages: formattedMessages,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      top_p: settings.topP,
      frequency_penalty: settings.frequencyPenalty,
      presence_penalty: settings.presencePenalty,
      stop: settings.stopSequences,
      stream,
    };

    if (tools && tools.length > 0) {
      requestOptions.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    if (stream) {
      return client.chat.completions.create(requestOptions);
    }

    const response = await client.chat.completions.create(requestOptions);
    const choice = response.choices[0];

    return {
      content: choice.message.content,
      finishReason: choice.finish_reason,
      toolCalls: choice.message.tool_calls,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  /**
   * Gera completion Anthropic
   */
  async generateAnthropicCompletion(options) {
    const client = this.getProvider(AI_PROVIDER.ANTHROPIC);
    const {
      model,
      messages,
      systemPrompt,
      settings,
      stream,
    } = options;

    const requestOptions = {
      model,
      max_tokens: settings.maxTokens || 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      temperature: settings.temperature,
      top_p: settings.topP,
      stop_sequences: settings.stopSequences,
      stream,
    };

    if (stream) {
      return client.messages.stream(requestOptions);
    }

    const response = await client.messages.create(requestOptions);

    return {
      content: response.content[0].text,
      finishReason: response.stop_reason,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  /**
   * Gera completion Google
   */
  async generateGoogleCompletion(options) {
    const client = this.getProvider(AI_PROVIDER.GOOGLE);
    const {
      model,
      messages,
      systemPrompt,
      settings,
      stream,
    } = options;

    const genModel = client.getGenerativeModel({ model });

    const chat = genModel.startChat({
      history: messages.slice(0, -1).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: settings.temperature,
        maxOutputTokens: settings.maxTokens,
        topP: settings.topP,
        stopSequences: settings.stopSequences,
      },
      systemInstruction: systemPrompt,
    });

    const lastMessage = messages[messages.length - 1];

    if (stream) {
      return chat.sendMessageStream(lastMessage.content);
    }

    const response = await chat.sendMessage(lastMessage.content);
    const result = response.response;

    return {
      content: result.text(),
      finishReason: result.candidates[0].finishReason,
      usage: {
        promptTokens: result.usageMetadata?.promptTokenCount || 0,
        completionTokens: result.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: result.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  /**
   * Gera embeddings
   * @param {string} text - Texto para embedding
   * @param {string} model - Modelo de embedding
   * @returns {Promise<number[]>}
   */
  async generateEmbedding(text, model = 'text-embedding-3-small') {
    const client = this.getProvider(AI_PROVIDER.OPENAI);

    const response = await client.embeddings.create({
      model,
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * Gera embeddings em batch
   * @param {string[]} texts - Textos para embedding
   * @param {string} model - Modelo de embedding
   * @returns {Promise<number[][]>}
   */
  async generateEmbeddings(texts, model = 'text-embedding-3-small') {
    const client = this.getProvider(AI_PROVIDER.OPENAI);

    const response = await client.embeddings.create({
      model,
      input: texts,
    });

    return response.data.map((d) => d.embedding);
  }

  /**
   * Calcula custo estimado
   * @param {string} provider - Provedor
   * @param {string} model - Modelo
   * @param {Object} usage - Uso de tokens
   * @returns {number}
   */
  calculateCost(provider, model, usage) {
    const modelInfo = AI_MODELS[provider]?.[model];
    if (!modelInfo) return 0;

    const inputCost = (usage.promptTokens / 1000) * modelInfo.costPer1kInput;
    const outputCost = (usage.completionTokens / 1000) * modelInfo.costPer1kOutput;

    return inputCost + outputCost;
  }

  /**
   * Lista modelos disponíveis
   * @param {string} provider - Provedor (opcional)
   * @returns {Object}
   */
  getAvailableModels(provider = null) {
    if (provider) {
      return AI_MODELS[provider] || {};
    }
    return AI_MODELS;
  }
}

module.exports = new AIProviderService();