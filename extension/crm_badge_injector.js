/**
 * crm_badge_injector.js
 * Injeta badges visuais de estágio do CRM na lista de chats do WhatsApp Web
 */

(function() {
  'use strict';

  // Evitar múltiplas instâncias
  if (window.__QUANTUM_CRM_BADGE_INJECTOR_LOADED__) {
    console.log('[BadgeInjector] Já carregado, ignorando...');
    return;
  }
  window.__QUANTUM_CRM_BADGE_INJECTOR_LOADED__ = true;

  console.log('[BadgeInjector] Iniciando...');

  /**
   * Classe do injetor de badges
   */
  class CRMBadgeInjector {
    constructor() {
      this.contacts = {};
      this.stages = [];
      this.stageMap = {};
      this.observer = null;
      this.initialized = false;
      this.updateQueue = new Set();
      this.updateTimeout = null;
      this.settings = {
        showBadge: true,
        showIcon: true,
        showName: false,
        position: 'right', // 'left', 'right', 'below'
        size: 'small', // 'small', 'medium', 'large'
      };
    }

    /**
     * Inicializa o injetor
     */
    async init() {
      if (this.initialized) return;

      console.log('[BadgeInjector] Inicializando...');

      // Carregar dados
      await this.loadData();

      // Injetar CSS
      this.injectStyles();

      // Configurar listeners
      this.setupEventListeners();

      // Aguardar WhatsApp carregar e iniciar observer
      this.waitForWhatsApp();

      this.initialized = true;
      console.log('[BadgeInjector] Inicializado!');
    }

    /**
     * Carrega dados do storage
     */
    async loadData() {
      return new Promise((resolve) => {
        chrome.storage.local.get([
          'quantum_crm_contacts',
          'quantum_crm_stages',
          'quantum_badge_settings',
        ], (result) => {
          this.contacts = result.quantum_crm_contacts || {};
          this.stages = result.quantum_crm_stages || this.getDefaultStages();
          this.settings = { ...this.settings, ...(result.quantum_badge_settings || {}) };

          // Criar mapa de estágios para acesso rápido
          this.buildStageMap();

          resolve();
        });
      });
    }

    /**
     * Constrói mapa de estágios
     */
    buildStageMap() {
      this.stageMap = {};
      for (const stage of this.stages) {
        this.stageMap[stage.id] = stage;
      }
    }

    /**
     * Estágios padrão (fallback)
     */
    getDefaultStages() {
      return [
        { id: 'new', name: 'Novo', color: '#6B7280', icon: '🆕' },
        { id: 'lead', name: 'Lead', color: '#3B82F6', icon: '🎯' },
        { id: 'contact', name: 'Contato', color: '#8B5CF6', icon: '📞' },
        { id: 'negotiation', name: 'Negociação', color: '#F59E0B', icon: '💼' },
        { id: 'proposal', name: 'Proposta', color: '#EC4899', icon: '📋' },
        { id: 'won', name: 'Ganho', color: '#10B981', icon: '✅' },
        { id: 'lost', name: 'Perdido', color: '#EF4444', icon: '❌' },
      ];
    }

    /**
     * Injeta CSS para os badges
     */
    injectStyles() {
      if (document.getElementById('quantum-badge-styles')) return;

      const styles = document.createElement('style');
      styles.id = 'quantum-badge-styles';
      styles.textContent = `
        /* Container do badge */
        .quantum-crm-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.2;
          white-space: nowrap;
          z-index: 100;
          pointer-events: none;
          transition: all 0.2s ease;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        /* Tamanhos */
        .quantum-crm-badge.size-small {
          font-size: 9px;
          padding: 1px 5px;
        }
        .quantum-crm-badge.size-medium {
          font-size: 11px;
          padding: 2px 7px;
        }
        .quantum-crm-badge.size-large {
          font-size: 12px;
          padding: 3px 8px;
        }

        /* Posicionamento */
        .quantum-crm-badge-container {
          position: relative;
          display: inline-flex;
          align-items: center;
        }

        .quantum-crm-badge-container.position-right {
          margin-left: 6px;
        }

        .quantum-crm-badge-container.position-left {
          margin-right: 6px;
          order: -1;
        }

        .quantum-crm-badge-container.position-below {
          position: absolute;
          bottom: -2px;
          left: 50%;
          transform: translateX(-50%);
        }

        /* Ícone do badge */
        .quantum-crm-badge-icon {
          font-size: 10px;
          line-height: 1;
        }

        .quantum-crm-badge.size-small .quantum-crm-badge-icon {
          font-size: 9px;
        }

        .quantum-crm-badge.size-large .quantum-crm-badge-icon {
          font-size: 12px;
        }

        /* Nome do estágio */
        .quantum-crm-badge-name {
          max-width: 60px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Hover effect no chat item */
        [data-quantum-chat-id]:hover .quantum-crm-badge {
          transform: scale(1.05);
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        /* Badge wrapper na linha do chat */
        .quantum-badge-wrapper {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        /* Indicador de estágio na barra lateral */
        .quantum-stage-indicator {
          width: 4px;
          height: 100%;
          position: absolute;
          left: 0;
          top: 0;
          border-radius: 0 2px 2px 0;
        }

        /* Animação de entrada */
        @keyframes badgeFadeIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .quantum-crm-badge.animate-in {
          animation: badgeFadeIn 0.2s ease-out;
        }

        /* Tooltip */
        .quantum-crm-badge[data-tooltip]:hover::after {
          content: attr(data-tooltip);
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          padding: 4px 8px;
          background: #1f2937;
          color: white;
          font-size: 11px;
          border-radius: 4px;
          white-space: nowrap;
          z-index: 1000;
          margin-bottom: 4px;
        }

        /* Destaque visual para estágios importantes */
        .quantum-crm-badge.stage-won {
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3);
        }

        .quantum-crm-badge.stage-lost {
          opacity: 0.7;
        }

        .quantum-crm-badge.stage-negotiation {
          box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3);
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .quantum-crm-badge {
            box-shadow: 0 1px 2px rgba(0,0,0,0.3);
          }
        }
      `;

      document.head.appendChild(styles);
    }

    /**
     * Configura listeners de eventos
     */
    setupEventListeners() {
      // Escutar atualizações do CRM Runtime
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        if (event.data?.source === 'QUANTUM_CRM_RUNTIME') {
          this.handleCRMMessage(event.data);
        }
      });

      // Evento customizado
      document.addEventListener('quantum:crm:crm_update_badges', (e) => {
        this.handleBadgeUpdate(e.detail);
      });

      // Escutar mudanças no storage
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          if (changes.quantum_crm_contacts) {
            this.contacts = changes.quantum_crm_contacts.newValue || {};
            this.scheduleUpdate();
          }
          if (changes.quantum_crm_stages) {
            this.stages = changes.quantum_crm_stages.newValue || this.getDefaultStages();
            this.buildStageMap();
            this.scheduleUpdate();
          }
          if (changes.quantum_badge_settings) {
            this.settings = { ...this.settings, ...(changes.quantum_badge_settings.newValue || {}) };
            this.scheduleUpdate();
          }
        }
      });
    }

    /**
     * Processa mensagens do CRM Runtime
     */
    handleCRMMessage(data) {
      switch (data.type) {
        case 'CRM_CONTACTS_UPDATED':
          this.contacts = data.data.contacts || {};
          if (data.data.stages) {
            this.stages = data.data.stages;
            this.buildStageMap();
          }
          this.scheduleUpdate();
          break;

        case 'CRM_CONTACT_UPDATED':
          if (data.data.contact) {
            this.contacts[data.data.chatId] = data.data.contact;
            this.updateSingleChat(data.data.chatId);
          }
          break;

        case 'CRM_STAGE_CHANGED':
          if (data.data.contact) {
            this.contacts[data.data.chatId] = data.data.contact;
            this.updateSingleChat(data.data.chatId);
          }
          break;

        case 'CRM_UPDATE_BADGES':
          this.handleBadgeUpdate(data.data);
          break;
      }
    }

    /**
     * Processa atualização de badges
     */
    handleBadgeUpdate(data) {
      if (data.contacts) {
        this.contacts = data.contacts;
      }
      if (data.stages) {
        this.stages = data.stages;
        this.buildStageMap();
      }
      this.scheduleUpdate();
    }

    /**
     * Aguarda WhatsApp carregar
     */
    waitForWhatsApp() {
      const checkInterval = setInterval(() => {
        const chatList = document.querySelector('[data-testid="chat-list"]') || 
                         document.querySelector('#pane-side') ||
                         document.querySelector('[aria-label*="lista de conversas"]');

        if (chatList) {
          clearInterval(checkInterval);
          console.log('[BadgeInjector] Chat list encontrada, iniciando observer');
          this.setupObserver(chatList);
          this.updateAllBadges();
        }
      }, 1000);
    }

    /**
     * Configura MutationObserver para detectar mudanças na lista
     */
    setupObserver(chatList) {
      if (this.observer) {
        this.observer.disconnect();
      }

      this.observer = new MutationObserver((mutations) => {
        let needsUpdate = false;

        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            needsUpdate = true;
            break;
          }
        }

        if (needsUpdate) {
          this.scheduleUpdate();
        }
      });

      this.observer.observe(chatList, {
        childList: true,
        subtree: true,
      });

      // Também observar o container pai
      const paneContainer = document.querySelector('#pane-side');
      if (paneContainer && paneContainer !== chatList) {
        const parentObserver = new MutationObserver(() => {
          this.scheduleUpdate();
        });

        parentObserver.observe(paneContainer, {
          childList: true,
          subtree: false,
        });
      }
    }

    /**
     * Agenda atualização com debounce
     */
    scheduleUpdate() {
      if (this.updateTimeout) {
        clearTimeout(this.updateTimeout);
      }

      this.updateTimeout = setTimeout(() => {
        this.updateAllBadges();
      }, 100);
    }

    /**
     * Atualiza todos os badges
     */
    updateAllBadges() {
      if (!this.settings.showBadge) {
        this.removeAllBadges();
        return;
      }

      // Encontrar todos os itens de chat
      const chatItems = this.getChatItems();

      for (const chatItem of chatItems) {
        this.updateChatBadge(chatItem);
      }
    }

    /**
     * Atualiza badge de um chat específico
     */
    updateSingleChat(chatId) {
      const chatItem = this.findChatItem(chatId);
      if (chatItem) {
        this.updateChatBadge(chatItem);
      }
    }

    /**
     * Obtém todos os itens de chat
     */
    getChatItems() {
      // Seletores para diferentes versões do WhatsApp Web
      const selectors = [
        '[data-testid="cell-frame-container"]',
        '[data-testid="list-item"]',
        '._8nE1Y',
        '.X7YrQ',
        '[role="listitem"]',
      ];

      for (const selector of selectors) {
        const items = document.querySelectorAll(selector);
        if (items.length > 0) {
          return Array.from(items);
        }
      }

      return [];
    }

    /**
     * Encontra item de chat por ID
     */
    findChatItem(chatId) {
      const byData = document.querySelector(`[data-quantum-chat-id="${chatId}"]`);
      if (byData) return byData;

      const phone = chatId.replace('@c.us', '').replace('@g.us', '');
      const items = this.getChatItems();

      for (const item of items) {
        const itemChatId = this.extractChatId(item);
        if (itemChatId === chatId || itemChatId?.includes(phone)) {
          return item;
        }
      }

      return null;
    }

    /**
     * Atualiza badge de um item de chat
     */
    updateChatBadge(chatItem) {
      const chatId = this.extractChatId(chatItem);
      if (!chatId) return;

      chatItem.setAttribute('data-quantum-chat-id', chatId);

      const contact = this.contacts[chatId];

      const existingBadge = chatItem.querySelector('.quantum-badge-wrapper');
      if (existingBadge) {
        existingBadge.remove();
      }

      const existingIndicator = chatItem.querySelector('.quantum-stage-indicator');
      if (existingIndicator) {
        existingIndicator.remove();
      }

      if (!contact || !contact.stage) return;

      const stage = this.stageMap[contact.stage];
      if (!stage) return;

      const badge = this.createBadge(stage, contact);
      this.insertBadge(chatItem, badge);
      this.addStageIndicator(chatItem, stage);
    }

    /**
     * Extrai chat ID de um elemento
     */
    extractChatId(element) {
      const existing = element.getAttribute('data-quantum-chat-id');
      if (existing) return existing;

      const link = element.querySelector('a[href*="@"]');
      if (link) {
        const href = link.getAttribute('href');
        const match = href?.match(/(\d+@[cg]\.us)/);
        if (match) return match[1];
      }

      const dataId = element.getAttribute('data-id') || 
                     element.querySelector('[data-id]')?.getAttribute('data-id');
      if (dataId) {
        const match = dataId.match(/(\d+@[cg]\.us)/);
        if (match) return match[1];
      }

      const titleEl = element.querySelector('[title]');
      const title = titleEl?.getAttribute('title');
      if (title) {
        const phoneMatch = title.match(/^\\+?(\\d{10,15})/);
        if (phoneMatch) {
          return phoneMatch[1] + '@c.us';
        }
      }

      const spans = element.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent?.trim();
        if (text) {
          const phoneMatch = text.match(/^\\+?(\\d{10,15})$/);
          if (phoneMatch) {
            return phoneMatch[1] + '@c.us';
          }
        }
      }

      return null;
    }

    /**
     * Cria elemento do badge
     */
    createBadge(stage, contact) {
      const wrapper = document.createElement('div');
      wrapper.className = `quantum-badge-wrapper`;

      const badge = document.createElement('span');
      badge.className = `quantum-crm-badge size-${this.settings.size} stage-${stage.id} animate-in`;
      badge.style.backgroundColor = this.hexToRgba(stage.color, 0.15);
      badge.style.color = stage.color;
      badge.style.border = `1px solid ${this.hexToRgba(stage.color, 0.3)}`;

      badge.setAttribute('data-tooltip', `${stage.name}${contact.value ? ` • R$ ${contact.value.toLocaleString()}` : ''}`);

      if (this.settings.showIcon && stage.icon) {
        const icon = document.createElement('span');
        icon.className = 'quantum-crm-badge-icon';
        icon.textContent = stage.icon;
        badge.appendChild(icon);
      }

      if (this.settings.showName) {
        const name = document.createElement('span');
        name.className = 'quantum-crm-badge-name';
        name.textContent = stage.name;
        badge.appendChild(name);
      }

      wrapper.appendChild(badge);

      return wrapper;
    }

    /**
     * Insere badge no item de chat
     */
    insertBadge(chatItem, badge) {
      const titleContainer = chatItem.querySelector('[data-testid="cell-frame-title"]') ||
                             chatItem.querySelector('._21S-L') ||
                             chatItem.querySelector('[dir="auto"]')?.parentElement;

      if (titleContainer) {
        const parent = titleContainer.parentElement;
        if (parent) {
          parent.style.display = 'flex';
          parent.style.alignItems = 'center';
          parent.style.gap = '4px';
        }

        if (this.settings.position === 'left') {
          titleContainer.parentElement?.insertBefore(badge, titleContainer);
        } else {
          titleContainer.after(badge);
        }
      } else {
        chatItem.appendChild(badge);
      }
    }

    /**
     * Adiciona indicador lateral colorido
     */
    addStageIndicator(chatItem, stage) {
      chatItem.style.position = 'relative';

      const indicator = document.createElement('div');
      indicator.className = 'quantum-stage-indicator';
      indicator.style.backgroundColor = stage.color;

      chatItem.appendChild(indicator);
    }

    /**
     * Remove todos os badges
     */
    removeAllBadges() {
      document.querySelectorAll('.quantum-badge-wrapper').forEach(el => el.remove());
      document.querySelectorAll('.quantum-stage-indicator').forEach(el => el.remove());
    }

    /**
     * Converte hex para rgba
     */
    hexToRgba(hex, alpha) {
      if (!hex || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) {
        return `rgba(107, 114, 128, ${alpha})`; // fallback gray
      }
      let r, g, b;
      if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
      } else {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
      }
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Atualiza configurações
     */
    updateSettings(newSettings) {
      this.settings = { ...this.settings, ...newSettings };
      chrome.storage.local.set({ quantum_badge_settings: this.settings });
      this.updateAllBadges();
    }

    /**
     * Destrói o injetor
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }

      this.removeAllBadges();

      const styles = document.getElementById('quantum-badge-styles');
      if (styles) {
        styles.remove();
      }

      window.__QUANTUM_CRM_BADGE_INJECTOR_LOADED__ = false;
    }
  }

  // Criar instância global
  window.__QUANTUM_CRM_BADGE_INJECTOR__ = new CRMBadgeInjector();

  // Inicializar
  if (document.readyState === 'complete') {
    window.__QUANTUM_CRM_BADGE_INJECTOR__.init();
  } else {
    window.addEventListener('load', () => {
      window.__QUANTUM_CRM_BADGE_INJECTOR__.init();
    });
  }

})();
