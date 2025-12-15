/**
 * @fileoverview Singleton do sistema de Flows (v2)
 *
 * FULL MODE: inicializa FlowEngine + EventDispatcher + (opcional) Cron/NoResponse.
 *
 * Observação: para funcionar 100% em produção, você precisa:
 * - MongoDB configurado (MONGO_URI)
 * - Redis disponível (para delays) (REDIS_URL)
 */

const logger = require('../infra/logging/Logger');
const env = require('../config/env');
const { createFlowSystem } = require('./index');
const QueueService = require('./services/QueueService');
const { FLOW_ACTION_TYPE } = require('./constants/flowConstants');

// Services usados em handlers
const whatsappService = require('../services/whatsappService');
const axios = require('axios');

// CRM v2
const crmContactService = require('../crm/services/ContactService');
const Contact = require('../crm/models/Contact');
const Deal = require('../crm/models/Deal');

// AI v2
const aiProvider = require('../ai/services/AIProviderService');
const { AI_PROVIDER } = require('../ai/constants/aiConstants');

function parseRedisOptions(url) {
  // bull aceita objeto { host, port, password }
  if (!url) return { host: '127.0.0.1', port: 6379 };
  try {
    const u = new URL(url);
    return {
      host: u.hostname || '127.0.0.1',
      port: u.port ? Number(u.port) : 6379,
      password: u.password || undefined,
    };
  } catch (_) {
    return { host: '127.0.0.1', port: 6379 };
  }
}

// ============ Action handlers (mínimo funcional) ============
const actionHandlers = {
  [FLOW_ACTION_TYPE.SEND_MESSAGE]: async (config, context, meta) => {
    const to = config?.to || context?.contact?.phone;
    const message = config?.message || config?.text || config?.body;

    if (!to) throw new Error('SEND_MESSAGE: campo "to" (telefone) ausente');
    if (!message) throw new Error('SEND_MESSAGE: campo "message" ausente');

    if (meta?.isSimulation) {
      logger.info({ msg: '[FlowAction] SEND_MESSAGE (simulation)', to, message });
      return { simulated: true, to, message };
    }

    const resp = await whatsappService.sendTextMessage(String(to), String(message));
    return { ok: true, to, message, whatsapp: resp };
  },

  [FLOW_ACTION_TYPE.ADD_TAG]: async (config, _context, meta) => {
    const execution = meta?.execution;
    const workspaceId = execution?.workspaceId;
    const contactId = execution?.contactId;
    const tags = Array.isArray(config?.tags) ? config.tags : [config?.tag].filter(Boolean);

    if (!workspaceId || !contactId) {
      logger.warn({ msg: '[FlowAction] ADD_TAG sem workspaceId/contactId', workspaceId, contactId });
      return { ok: false, reason: 'missing_workspace_or_contact' };
    }

    if (!tags.length) return { ok: true, tags: [] };

    if (meta?.isSimulation) {
      logger.info({ msg: '[FlowAction] ADD_TAG (simulation)', contactId, tags });
      return { simulated: true, tags };
    }

    await crmContactService.addTags(String(workspaceId), String(contactId), tags, String(execution?.userId || 'system'));
    return { ok: true, tags };
  },

  [FLOW_ACTION_TYPE.REMOVE_TAG]: async (config, _context, meta) => {
    const execution = meta?.execution;
    const workspaceId = execution?.workspaceId;
    const contactId = execution?.contactId;
    const tags = Array.isArray(config?.tags) ? config.tags : [config?.tag].filter(Boolean);

    if (!workspaceId || !contactId) {
      logger.warn({ msg: '[FlowAction] REMOVE_TAG sem workspaceId/contactId', workspaceId, contactId });
      return { ok: false, reason: 'missing_workspace_or_contact' };
    }

    if (!tags.length) return { ok: true, tags: [] };

    if (meta?.isSimulation) {
      logger.info({ msg: '[FlowAction] REMOVE_TAG (simulation)', contactId, tags });
      return { simulated: true, tags };
    }

    await crmContactService.removeTags(String(workspaceId), String(contactId), tags, String(execution?.userId || 'system'));
    return { ok: true, tags };
  },

  [FLOW_ACTION_TYPE.UPDATE_STAGE]: async (config, _context, meta) => {
    // Implementação genérica (contact customFields.stage ou deal.stageId)
    const execution = meta?.execution;
    const workspaceId = execution?.workspaceId;
    const userId = String(execution?.userId || 'system');

    if (meta?.isSimulation) {
      return { simulated: true, config };
    }

    // Deal stage
    if (config?.dealId && (config?.stageId || config?.stage)) {
      const dealId = String(config.dealId);
      const stageId = String(config.stageId || config.stage);
      await Deal.findOneAndUpdate(
        { _id: dealId, workspaceId: workspaceId || undefined },
        { $set: { stageId, updatedBy: userId } },
        { new: true }
      );
      return { ok: true, target: 'deal', dealId, stageId };
    }

    // Contact stage (customFields.stage)
    const contactId = execution?.contactId;
    const stage = config?.stageId || config?.stage || config?.value;
    if (!contactId || !stage) {
      return { ok: false, reason: 'missing_contact_or_stage' };
    }

    await Contact.findOneAndUpdate(
      { _id: contactId, workspaceId: workspaceId || undefined },
      { $set: { 'customFields.stage': stage, updatedBy: userId } },
      { new: true }
    );

    return { ok: true, target: 'contact', contactId: String(contactId), stage: String(stage) };
  },

  [FLOW_ACTION_TYPE.CALL_WEBHOOK]: async (config, _context, meta) => {
    const url = config?.url;
    const method = String(config?.method || 'POST').toUpperCase();
    const headers = config?.headers && typeof config.headers === 'object' ? config.headers : {};
    const body = config?.body;

    if (!url) throw new Error('CALL_WEBHOOK: campo "url" ausente');

    if (meta?.isSimulation) {
      logger.info({ msg: '[FlowAction] CALL_WEBHOOK (simulation)', url, method });
      return { simulated: true, url, method };
    }

    const resp = await axios({
      url,
      method,
      headers,
      data: body,
      timeout: Number(config?.timeoutMs || 15000),
      validateStatus: () => true,
    });

    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      data: resp.data,
    };
  },

  [FLOW_ACTION_TYPE.CALL_AI]: async (config, context, meta) => {
    const prompt = config?.prompt || config?.text || '';
    const systemPrompt = config?.systemPrompt || '';
    const model = config?.model || env.OPENAI?.MODEL || 'gpt-4o';

    if (!prompt) throw new Error('CALL_AI: campo "prompt" ausente');

    if (meta?.isSimulation) {
      return { simulated: true, model, promptPreview: String(prompt).slice(0, 200) };
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await aiProvider.generateCompletion({
      provider: AI_PROVIDER.OPENAI,
      model,
      messages,
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 500,
    });

    // opcional: salvar em variável
    if (config?.saveToVariable && meta?.execution) {
      try {
        meta.execution.setVariable(String(config.saveToVariable), response.content);
        await meta.execution.save();
      } catch (_) {}
    }

    return { ok: true, content: response.content, usage: response.usage, model: response.model };
  },

  [FLOW_ACTION_TYPE.SET_VARIABLE]: async (config, _context, meta) => {
    const name = config?.name;
    const value = config?.value;
    const execution = meta?.execution;
    if (!name) throw new Error('SET_VARIABLE: campo "name" ausente');

    if (execution) {
      execution.setVariable(String(name), value);
      await execution.save();
    }

    return { ok: true, name: String(name), value };
  },

  [FLOW_ACTION_TYPE.WAIT_FOR_REPLY]: async (config, _context, meta) => {
    // Implementação simples: pausa por X ms e depois continua.
    // Para comportamento "real" (retomar ao receber mensagem), conecte o pipeline
    // de eventos de mensagens ao EventDispatcher.
    const delayMs = Number(config?.timeoutMs || 24 * 60 * 60 * 1000); // 24h
    const stepId = meta?.step?.nextStepId || null;

    return {
      ok: true,
      waiting: true,
      scheduleDelay: {
        delayMs,
        nextStepId: stepId,
      },
    };
  },
};

// ============ Stubs para Cron/NoResponse (evita crash) ============
// Estes schedulers são opcionais. Para ativar de forma completa, implemente
// os métodos abaixo conectando ao seu modelo de mensagens/conversas.
const flowContactServiceStub = {
  async findContactsWithPendingResponse() {
    return [];
  },
  async listContactsForScheduled() {
    return [];
  },
};

const messageServiceStub = {
  async getLastMessage() {
    return null;
  },
};

// Delay queue para WAIT/DELAYS
const delayQueue = new QueueService({
  logger,
  redis: parseRedisOptions(env.REDIS_URL),
  engine: null,
});

const flowSystem = createFlowSystem({
  delayQueue,
  actionHandlers,
  enableCron: true,
  enableNoResponse: true,
  contactService: flowContactServiceStub,  messageService: messageServiceStub,
  logger,
});

// Linka engine ao queue service
try {
  delayQueue.engine = flowSystem.flowEngine;
} catch (_) {}

module.exports = flowSystem;
