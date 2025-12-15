// smart_replies/PersonaManager.js

import { DEFAULT_PERSONAS, SMART_REPLIES_CONFIG } from './SmartRepliesTypes.js';

class PersonaManager {
  constructor() {
    this.personas = new Map();
    this.activePersonaId = null;
    this.chatPersonaOverrides = new Map(); // chatId -> personaId
    this.isLoaded = false;
  }

  // ============ INICIALIZAÇÃO ============

  async init() {
    await this.loadPersonas();
    await this.loadSettings();
    this.isLoaded = true;
    console.log('[PersonaManager] Inicializado com', this.personas.size, 'personas');
  }

  async loadPersonas() {
    // Carregar personas padrão
    Object.values(DEFAULT_PERSONAS).forEach(persona => {
      this.personas.set(persona.id, { ...persona, isDefault: true });
    });

    // Carregar personas customizadas do storage
    try {
      const stored = await this.getFromStorage(SMART_REPLIES_CONFIG.STORAGE_PERSONAS);
      if (stored) {
        Object.values(stored).forEach(persona => {
          this.personas.set(persona.id, { ...persona, isDefault: false });
        });
      }
    } catch (error) {
      console.error('[PersonaManager] Erro ao carregar personas:', error);
    }
  }

  async loadSettings() {
    try {
      const settings = await this.getFromStorage(SMART_REPLIES_CONFIG.STORAGE_SETTINGS);
      if (settings) {
        this.activePersonaId = settings.activePersonaId || 'professional';
        if (settings.chatPersonaOverrides) {
          this.chatPersonaOverrides = new Map(Object.entries(settings.chatPersonaOverrides));
        }
      } else {
        this.activePersonaId = 'professional';
      }
    } catch (error) {
      console.error('[PersonaManager] Erro ao carregar settings:', error);
      this.activePersonaId = 'professional';
    }
  }

  // ============ CRUD DE PERSONAS ============

  async createPersona(personaData) {
    const id = personaData.id || `custom_${Date.now()}`;
    
    const persona = {
      id,
      name: personaData.name,
      description: personaData.description || '',
      systemPrompt: personaData.systemPrompt,
      temperature: personaData.temperature || 0.7,
      maxTokens: personaData.maxTokens || 300,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.personas.set(id, persona);
    await this.savePersonas();
    
    return persona;
  }

  async updatePersona(id, updates) {
    const persona = this.personas.get(id);
    if (!persona) {
      throw new Error(`Persona ${id} não encontrada`);
    }

    const updated = {
      ...persona,
      ...updates,
      updatedAt: Date.now()
    };

    this.personas.set(id, updated);
    await this.savePersonas();
    
    return updated;
  }

  async deletePersona(id) {
    const persona = this.personas.get(id);
    if (!persona) return false;
    
    if (persona.isDefault) {
      throw new Error('Não é possível deletar personas padrão');
    }

    this.personas.delete(id);
    
    // Se era a persona ativa, voltar para padrão
    if (this.activePersonaId === id) {
      this.activePersonaId = 'professional';
    }

    // Remover overrides que usavam essa persona
    for (const [chatId, personaId] of this.chatPersonaOverrides) {
      if (personaId === id) {
        this.chatPersonaOverrides.delete(chatId);
      }
    }

    await this.savePersonas();
    await this.saveSettings();
    
    return true;
  }

  // ============ SELEÇÃO DE PERSONA ============

  getPersona(id) {
    return this.personas.get(id);
  }

  getActivePersona() {
    return this.personas.get(this.activePersonaId);
  }

  getPersonaForChat(chatId) {
    // Verificar se há override para este chat
    const overrideId = this.chatPersonaOverrides.get(chatId);
    if (overrideId && this.personas.has(overrideId)) {
      return this.personas.get(overrideId);
    }
    return this.getActivePersona();
  }

  async setActivePersona(id) {
    if (!this.personas.has(id)) {
      throw new Error(`Persona ${id} não encontrada`);
    }
    
    this.activePersonaId = id;
    await this.saveSettings();
    
    return this.personas.get(id);
  }

  async setPersonaForChat(chatId, personaId) {
    if (personaId && !this.personas.has(personaId)) {
      throw new Error(`Persona ${personaId} não encontrada`);
    }

    if (personaId) {
      this.chatPersonaOverrides.set(chatId, personaId);
    } else {
      this.chatPersonaOverrides.delete(chatId);
    }

    await this.saveSettings();
  }

  getAllPersonas() {
    return Array.from(this.personas.values());
  }

  // ============ PROMPT BUILDING ============

  buildSystemPrompt(personaId, additionalContext = {}) {
    const persona = this.personas.get(personaId) || this.getActivePersona();
    
    let prompt = persona.systemPrompt;

    // Adicionar contexto do negócio se disponível
    if (additionalContext.businessInfo) {
      prompt += `\n\nInformações do negócio:\n${additionalContext.businessInfo}`;
    }

    // Adicionar produtos/serviços se disponível
    if (additionalContext.products) {
      prompt += `\n\nProdutos/Serviços disponíveis:\n${additionalContext.products}`;
    }

    // Adicionar FAQs se disponível
    if (additionalContext.faqs) {
      prompt += `\n\nPerguntas frequentes:\n${additionalContext.faqs}`;
    }

    // Adicionar instruções específicas
    if (additionalContext.instructions) {
      prompt += `\n\nInstruções adicionais:\n${additionalContext.instructions}`;
    }

    // Adicionar data/hora atual
    prompt += `\n\nData e hora atual: ${new Date().toLocaleString('pt-BR')}`;

    return prompt;
  }

  // ============ PERSISTÊNCIA ============

  async savePersonas() {
    const customPersonas = {};
    for (const [id, persona] of this.personas) {
      if (!persona.isDefault) {
        customPersonas[id] = persona;
      }
    }
    await this.setToStorage(SMART_REPLIES_CONFIG.STORAGE_PERSONAS, customPersonas);
  }

  async saveSettings() {
    const settings = {
      activePersonaId: this.activePersonaId,
      chatPersonaOverrides: Object.fromEntries(this.chatPersonaOverrides)
    };
    await this.setToStorage(SMART_REPLIES_CONFIG.STORAGE_SETTINGS, settings);
  }

  // ============ STORAGE HELPERS ============

  getFromStorage(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key]);
      });
    });
  }

  setToStorage(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
}

// Singleton
export const personaManager = new PersonaManager();
export default personaManager;
