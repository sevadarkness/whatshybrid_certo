// services/AIService.js

class AIService {
  constructor() {
    // Provider padrão: backend (recomendado para NÃO expor a chave OpenAI no cliente)
    this.provider = 'backend'; // 'backend', 'openai', 'anthropic', 'venice', 'custom'

    // Para providers diretos (openai/anthropic/etc.)
    this.apiKey = null;
    this.apiEndpoint = null;
    this.model = 'gpt-4o';

    // Para provider "backend"
    this.backendUrl = null;
    this.extensionKey = null;
    this.licenseKey = null;

    this.isConfigured = false;
  }

  // ============ CONFIGURAÇÃO ============

  configure(options) {
    this.provider = options.provider || this.provider;

    // backend mode
    if (this.provider === 'backend') {
      this.backendUrl = (options.backendUrl || '').toString().trim().replace(/\/$/, '');
      this.extensionKey = (options.extensionKey || '').toString().trim();
      this.licenseKey = (options.licenseKey || '').toString().trim();
      this.model = options.model || this.model;
      this.isConfigured = !!(this.backendUrl && this.extensionKey && this.licenseKey);
      console.log(`[AIService] Configurado em modo BACKEND: ${this.backendUrl}`);
      return;
    }

    // direct providers
    this.apiKey = options.apiKey;
    this.apiEndpoint = options.apiEndpoint || this.getDefaultEndpoint();
    this.model = options.model || this.getDefaultModel();
    this.isConfigured = !!this.apiKey;
    
    console.log(`[AIService] Configurado com provider: ${this.provider}`);
  }

  getDefaultEndpoint() {
    const endpoints = {
      backend: null,
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      venice: 'https://api.venice.ai/api/v1/chat/completions',
      custom: this.apiEndpoint
    };
    return endpoints[this.provider];
  }

  getDefaultModel() {
    const models = {
      backend: 'gpt-4o',
      openai: 'gpt-4o',
      anthropic: 'claude-3-haiku-20240307',
      venice: 'llama-3.3-70b',
      custom: 'default'
    };
    return models[this.provider];
  }

  // ============ CHAT COMPLETION ============

  async chat(messages, options = {}) {
    if (!this.isConfigured) {
      throw new Error(
        this.provider === 'backend'
          ? 'AIService (backend) não configurado. Verifique backendUrl/extensionKey/licença nas opções.'
          : 'AIService não configurado. Defina a API key.'
      );
    }

    const systemPrompt = options.systemPrompt || '';
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? 500;

    try {
      switch (this.provider) {
        case 'backend':
          return await this.chatBackend(messages, systemPrompt, temperature, maxTokens);
        case 'openai':
        case 'venice':
          return await this.chatOpenAI(messages, systemPrompt, temperature, maxTokens);
        case 'anthropic':
          return await this.chatAnthropic(messages, systemPrompt, temperature, maxTokens);
        default:
          return await this.chatOpenAI(messages, systemPrompt, temperature, maxTokens);
      }
    } catch (error) {
      console.error('[AIService] Erro no chat:', error);
      throw error;
    }
  }

  async chatBackend(messages, systemPrompt, temperature, maxTokens) {
    const formattedMessages = [];

    // No backend já enviamos systemPrompt separado
    const payload = {
      messages,
      systemPrompt: systemPrompt || '',
      model: this.model || null,
      temperature,
      maxTokens
    };

    const resp = await fetch(`${this.backendUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-extension-key': this.extensionKey,
        'x-license-key': this.licenseKey,
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.error || `HTTP ${resp.status}`;
      throw new Error(msg);
    }

    // Atualizar créditos no storage (opcional)
    try {
      if (typeof data.aiCreditsRemaining === 'number' && chrome?.storage?.sync) {
        chrome.storage.sync.set({ licenseAiCredits: data.aiCreditsRemaining }, () => {});
      }
    } catch (_) {}

    return {
      content: data.content,
      usage: data.usage,
      model: data.model
    };
  }

  async chatOpenAI(messages, systemPrompt, temperature, maxTokens) {
    const formattedMessages = [];
    
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    
    formattedMessages.push(...messages);

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: formattedMessages,
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage,
      model: data.model
    };
  }

  async chatAnthropic(messages, systemPrompt, temperature, maxTokens) {
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        messages: messages,
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      usage: data.usage,
      model: data.model
    };
  }

  // ============ MÉTODOS ESPECIALIZADOS ============

  async generateReply(context, persona, options = {}) {
    const messages = context.messages || [];
    
    const systemPrompt = `${persona.systemPrompt}

Contexto da conversa:
- Cliente: ${context.customerName}
- Tópicos detectados: ${context.topics?.join(', ') || 'Nenhum'}
- Sentimento: ${context.sentiment?.label || 'Neutro'}
${context.sentiment?.isUrgent ? '- ⚠️ URGENTE: O cliente parece ter urgência' : ''}

Instruções:
- Responda de forma natural e contextualizada
- Mantenha o tom definido pela persona
- Seja conciso e objetivo
- NÃO use saudações se a conversa já está em andamento`;

    return this.chat(messages, {
      systemPrompt,
      temperature: persona.temperature,
      maxTokens: persona.maxTokens
    });
  }

  async generateSuggestions(context, persona, count = 3) {
    const messages = context.messages || [];
    
    const systemPrompt = `${persona.systemPrompt}

Gere ${count} sugestões de resposta diferentes para a última mensagem do cliente.
Cada sugestão deve ter um tom/abordagem diferente.

Formato de resposta (JSON):
{
  "suggestions": [
    {"text": "sugestão 1", "type": "direto"},
    {"text": "sugestão 2", "type": "empático"},
    {"text": "sugestão 3", "type": "detalhado"}
  ]
}`;

    const result = await this.chat(messages, {
      systemPrompt,
      temperature: 0.9,
      maxTokens: 600
    });

    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]).suggestions;
      }
    } catch (e) {
      console.warn('[AIService] Erro ao parsear sugestões:', e);
    }

    // Fallback: retornar como sugestão única
    return [{ text: result.content, type: 'default' }];
  }

  async correctText(text, correctionType = 'full') {
    const systemPrompt = `Você é um corretor de texto em português brasileiro.
Corrija o texto mantendo o sentido original.

Tipo de correção: ${correctionType}
- spelling: apenas erros de ortografia
- grammar: ortografia e gramática
- punctuation: ortografia, gramática e pontuação
- full: correção completa incluindo clareza

Responda APENAS com o texto corrigido, sem explicações.
Se o texto estiver correto, repita-o sem alterações.`;

    const result = await this.chat(
      [{ role: 'user', content: text }],
      { systemPrompt, temperature: 0.3, maxTokens: text.length + 100 }
    );

    return {
      original: text,
      corrected: result.content.trim(),
      hasChanges: text.trim() !== result.content.trim()
    };
  }

  async generateSummary(messages, type = 'chat') {
    const systemPrompt = `Você é um assistente especializado em criar resumos de conversas.

Tipo de resumo: ${type}
- chat_open: Resumo rápido para contexto inicial (2-3 frases)
- chat_close: Resumo completo do atendimento (pontos principais, resolução, pendências)
- daily: Resumo consolidado de múltiplas conversas

Seja objetivo e destaque:
- Assunto principal
- Solicitações do cliente
- Ações tomadas
- Pendências (se houver)`;

    const formattedMessages = messages.map(m => 
      `[${m.role === 'user' ? 'Cliente' : 'Atendente'}]: ${m.content}`
    ).join('\n');

    const result = await this.chat(
      [{ role: 'user', content: `Conversa:\n${formattedMessages}` }],
      { systemPrompt, temperature: 0.5, maxTokens: 300 }
    );

    return result.content;
  }
}

// Singleton
export const aiService = new AIService();
export default aiService;
