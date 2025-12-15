/**
 * dashboard.js
 * Dashboard/Kanban com integração ao CRM Runtime
 *
 * Esta versão utiliza os contatos salvos no storage local (quantum_crm_*),
 * gerenciados por crm_runtime.js, e exibe um quadro Kanban simples.
 */

// Singleton guard
if (window.__KANBAN_DASHBOARD_LOADED__) {
  console.log('[Dashboard] Já carregado, ignorando...');
} else {
  window.__KANBAN_DASHBOARD_LOADED__ = true;

class KanbanDashboard {
  constructor() {
    this.contacts = {};
    this.stages = [];
    this.draggedCard = null;
    this.initialized = false;
  }

  /**
   * Inicializa o dashboard
   */
  async init() {
    console.log('[Dashboard] Inicializando (CRM Runtime)...');

    await this.loadData();
    this.setupUI();
    this.setupEventListeners();
    this.setupCRMListeners();
    this.render();

    this.initialized = true;
    console.log('[Dashboard] Inicializado!');

    // Solicitar contatos atuais ao runtime (se ele estiver rodando)
    try {
      chrome.runtime.sendMessage({ type: 'GET_CRM_CONTACTS' }, (response) => {
        if (response && response.contacts) {
          this.contacts = response.contacts;
          this.render();
        }
      });
    } catch (e) {
      console.warn('[Dashboard] Não foi possível solicitar contatos ao runtime:', e);
    }
  }

  /**
   * Carrega dados do storage
   */
  async loadData() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'quantum_crm_contacts',
        'quantum_crm_stages',
      ], (result) => {
        this.contacts = result.quantum_crm_contacts || {};
        this.stages = result.quantum_crm_stages || this.getDefaultStages();
        resolve();
      });
    });
  }

  /**
   * Estágios padrão
   */
  getDefaultStages() {
    return [
      { id: 'new',          name: 'Novo',        color: '#6B7280', icon: '🆕', order: 0 },
      { id: 'lead',         name: 'Lead',        color: '#3B82F6', icon: '🎯', order: 1 },
      { id: 'contact',      name: 'Contato',     color: '#8B5CF6', icon: '📞', order: 2 },
      { id: 'negotiation',  name: 'Negociação',  color: '#F59E0B', icon: '💼', order: 3 },
      { id: 'proposal',     name: 'Proposta',    color: '#EC4899', icon: '📋', order: 4 },
      { id: 'won',          name: 'Ganho',       color: '#10B981', icon: '✅', order: 5 },
      { id: 'lost',         name: 'Perdido',     color: '#EF4444', icon: '❌', order: 6 },
    ];
  }

  /**
   * Configura interface
   */
  setupUI() {
    this.injectStyles();

    // Garante estrutura base dentro do <main id="kanban">
    const root = document.getElementById('kanban');
    if (!root) {
      console.warn('[Dashboard] Elemento #kanban não encontrado no HTML');
      return;
    }

    root.innerHTML = `
      <section class="kanban-stats" id="kanban-stats"></section>
      <section class="kanban-board" id="kanban-container"></section>
    `;
  }

  /**
   * Injeta estilos
   */
  injectStyles() {
    if (document.getElementById('kanban-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'kanban-styles';
    styles.textContent = `
      .kanban-board {
        display: flex;
        gap: 16px;
        padding: 16px;
        overflow-x: auto;
        min-height: calc(100vh - 120px);
      }

      .kanban-column {
        flex: 0 0 300px;
        background: #f3f4f6;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 140px);
      }

      .kanban-column-header {
        padding: 12px 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 3px solid;
        border-radius: 8px 8px 0 0;
        background: white;
      }

      .kanban-column-header .stage-icon {
        margin-right: 8px;
      }

      .kanban-column-header .count {
        background: rgba(0,0,0,0.1);
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
      }

      .kanban-column-body {
        flex: 1;
        padding: 8px;
        overflow-y: auto;
        min-height: 100px;
      }

      .kanban-column-body.drag-over {
        background: rgba(59, 130, 246, 0.1);
        border: 2px dashed #3B82F6;
      }

      .kanban-card {
        background: white;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 8px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        cursor: grab;
        transition: all 0.2s ease;
      }

      .kanban-card:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: translateY(-2px);
      }

      .kanban-card.dragging {
        opacity: 0.5;
        cursor: grabbing;
      }

      .kanban-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }

      .kanban-card-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 600;
        color: #6b7280;
      }

      .kanban-card-name {
        font-weight: 600;
        font-size: 14px;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .kanban-card-phone {
        font-size: 12px;
        color: #6b7280;
      }

      .kanban-card-value {
        font-size: 14px;
        font-weight: 600;
        color: #10b981;
        margin-top: 8px;
      }

      .kanban-card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 8px;
      }

      .kanban-card-tag {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        background: #e5e7eb;
        color: #4b5563;
      }

      .kanban-card-actions {
        display: flex;
        gap: 4px;
        margin-top: 8px;
        opacity: 0;
        transition: opacity 0.2s;
      }

      .kanban-card:hover .kanban-card-actions {
        opacity: 1;
      }

      .kanban-card-actions button {
        padding: 4px 8px;
        font-size: 11px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        background: #f3f4f6;
      }

      .kanban-card-actions button:hover {
        background: #e5e7eb;
      }

      .kanban-empty {
        text-align: center;
        padding: 32px;
        color: #9ca3af;
        font-size: 14px;
      }

      .kanban-stats {
        display: flex;
        gap: 16px;
        padding: 16px;
        background: white;
        border-bottom: 1px solid #e5e7eb;
      }

      .kanban-stat {
        text-align: center;
      }

      .kanban-stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #1f2937;
      }

      .kanban-stat-label {
        font-size: 12px;
        color: #6b7280;
      }

      /* Modal de edição */
      .contact-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .contact-modal-content {
        background: white;
        border-radius: 12px;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 24px;
      }

      .contact-modal h2 {
        margin: 0 0 16px 0;
        font-size: 20px;
      }

      .contact-modal label {
        display: block;
        margin-bottom: 4px;
        font-weight: 500;
        font-size: 14px;
      }

      .contact-modal input,
      .contact-modal select,
      .contact-modal textarea {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        margin-bottom: 12px;
        font-size: 14px;
      }

      .contact-modal-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 16px;
      }

      .contact-modal-actions button {
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
      }

      .contact-modal-actions .btn-primary {
        background: #3b82f6;
        color: white;
        border: none;
      }

      .contact-modal-actions .btn-secondary {
        background: white;
        border: 1px solid #d1d5db;
      }
    `;

    document.head.appendChild(styles);
  }

  /**
   * Configura event listeners globais
   */
  setupEventListeners() {
    document.addEventListener('dragstart', (e) => this.handleDragStart(e));
    document.addEventListener('dragend', (e) => this.handleDragEnd(e));
    document.addEventListener('dragover', (e) => this.handleDragOver(e));
    document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    document.addEventListener('drop', (e) => this.handleDrop(e));

    document.addEventListener('click', (e) => {
      const card = e.target.closest('.kanban-card');
      if (card && e.target.closest('.kanban-card-actions button')) {
        this.handleCardAction(e, card);
      } else if (card) {
        this.handleCardClick(card);
      }
    });
  }

  /**
   * Escuta mensagens vindas do background / runtime
   */
  setupCRMListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'CRM_CONTACTS_UPDATED':
          this.contacts = message.data.contacts || {};
          this.render();
          break;

        case 'CRM_CONTACT_UPDATED':
          if (message.data && message.data.chatId) {
            this.contacts[message.data.chatId] = message.data.contact;
            this.renderCard(message.data.chatId);
          }
          break;

        case 'CRM_STAGE_CHANGED':
          if (message.data && message.data.chatId) {
            this.contacts[message.data.chatId] = message.data.contact;
            this.render(); // re-render para mover card
          }
          break;
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        if (changes.quantum_crm_contacts) {
          this.contacts = changes.quantum_crm_contacts.newValue || {};
          this.render();
        }
        if (changes.quantum_crm_stages) {
          this.stages = changes.quantum_crm_stages.newValue || this.getDefaultStages();
          this.render();
        }
      }
    });
  }

  /**
   * Renderiza o dashboard
   */
  render() {
    const boardContainer = document.getElementById('kanban-container') || document.querySelector('.kanban-board');
    if (!boardContainer) {
      console.warn('[Dashboard] Container Kanban não encontrado');
      return;
    }

    const stats = this.calculateStats();
    this.renderStats(stats);

    boardContainer.innerHTML = this.stages
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(stage => this.renderColumn(stage))
      .join('');
  }

  /**
   * Calcula estatísticas
   */
  calculateStats() {
    const contacts = Object.values(this.contacts || {});
    const stageCount = {};
    let totalValue = 0;

    for (const stage of this.stages) {
      stageCount[stage.id] = 0;
    }

    for (const contact of contacts) {
      if (stageCount[contact.stage] !== undefined) {
        stageCount[contact.stage]++;
      }
      totalValue += contact.value || 0;
    }

    return {
      total: contacts.length,
      stageCount,
      totalValue,
    };
  }

  /**
   * Renderiza estatísticas
   */
  renderStats(stats) {
    const container = document.getElementById('kanban-stats');
    if (!container) return;

    container.innerHTML = `
      <div class="kanban-stat">
        <div class="kanban-stat-value">${stats.total}</div>
        <div class="kanban-stat-label">Total de Contatos</div>
      </div>
      <div class="kanban-stat">
        <div class="kanban-stat-value">R$ ${stats.totalValue.toLocaleString('pt-BR')}</div>
        <div class="kanban-stat-label">Valor Total</div>
      </div>
      ${this.stages.slice(0, 4).map(stage => `
        <div class="kanban-stat">
          <div class="kanban-stat-value" style="color: ${stage.color}">${stats.stageCount[stage.id] || 0}</div>
          <div class="kanban-stat-label">${stage.name}</div>
        </div>
      `).join('')}
    `;
  }

  /**
   * Renderiza uma coluna
   */
  renderColumn(stage) {
    const contacts = Object.values(this.contacts || {})
      .filter(c => c.stage === stage.id)
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    return `
      <div class="kanban-column" data-stage="${stage.id}">
        <div class="kanban-column-header" style="border-color: ${stage.color}">
          <span>
            <span class="stage-icon">${stage.icon || ''}</span>
            ${stage.name}
          </span>
          <span class="count">${contacts.length}</span>
        </div>
        <div class="kanban-column-body" data-stage="${stage.id}">
          ${contacts.length > 0 
            ? contacts.map(contact => this.renderCardHTML(contact)).join('')
            : '<div class="kanban-empty">Nenhum contato</div>'
          }
        </div>
      </div>
    `;
  }

  /**
   * Renderiza HTML de um card
   */
  renderCardHTML(contact) {
    const initials = this.getInitials(contact.name || contact.pushname || contact.phone);
    const phone = contact.phone || (contact.chatId || '').replace('@c.us', '').replace('@g.us', '');

    return `
      <div class="kanban-card" 
           draggable="true" 
           data-chat-id="${contact.chatId || contact.id}"
           data-stage="${contact.stage}">
        <div class="kanban-card-header">
          <div class="kanban-card-avatar">${initials}</div>
          <div>
            <div class="kanban-card-name">${this.escapeHtml(contact.name || contact.pushname || 'Sem nome')}</div>
            <div class="kanban-card-phone">${this.formatPhone(phone)}</div>
          </div>
        </div>
        ${contact.value ? `<div class="kanban-card-value">R$ ${contact.value.toLocaleString('pt-BR')}</div>` : ''}
        ${contact.tags?.length ? `
          <div class="kanban-card-tags">
            ${contact.tags.map(tag => `<span class="kanban-card-tag">${this.escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
        <div class="kanban-card-actions">
          <button data-action="open-chat" title="Abrir conversa">💬</button>
          <button data-action="edit" title="Editar">✏️</button>
          <button data-action="add-note" title="Adicionar nota">📝</button>
        </div>
      </div>
    `;
  }

  /**
   * Re-renderiza um card específico
   */
  renderCard(chatId) {
    const contact = this.contacts[chatId];
    if (!contact) return;

    const existingCard = document.querySelector(`[data-chat-id="${chatId}"]`);
    if (existingCard) {
      existingCard.outerHTML = this.renderCardHTML(contact);
    }
  }

  // ========== DRAG AND DROP ==========

  handleDragStart(e) {
    const card = e.target.closest('.kanban-card');
    if (!card) return;

    this.draggedCard = card;
    card.classList.add('dragging');

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.chatId);
  }

  handleDragEnd() {
    if (this.draggedCard) {
      this.draggedCard.classList.remove('dragging');
      this.draggedCard = null;
    }

    document.querySelectorAll('.kanban-column-body').forEach(col => {
      col.classList.remove('drag-over');
    });
  }

  handleDragOver(e) {
    e.preventDefault();

    const column = e.target.closest('.kanban-column-body');
    if (column) {
      column.classList.add('drag-over');
    }
  }

  handleDragLeave(e) {
    const column = e.target.closest('.kanban-column-body');
    if (column && !column.contains(e.relatedTarget)) {
      column.classList.remove('drag-over');
    }
  }

  handleDrop(e) {
    e.preventDefault();

    const column = e.target.closest('.kanban-column-body');
    if (!column || !this.draggedCard) return;

    column.classList.remove('drag-over');

    const chatId = this.draggedCard.dataset.chatId;
    const previousStage = this.draggedCard.dataset.stage;
    const newStage = column.dataset.stage;

    if (previousStage === newStage) return;

    console.log(`[Dashboard] Movendo ${chatId}: ${previousStage} -> ${newStage}`);

    this.moveCard(chatId, previousStage, newStage);
  }

  /**
   * Move card para novo estágio
   */
  moveCard(chatId, previousStage, newStage) {
    if (this.contacts[chatId]) {
      this.contacts[chatId].stage = newStage;
      this.render();
    }

    chrome.runtime.sendMessage({
      type: 'UPDATE_CONTACT_STAGE',
      chatId: chatId,
      newStage: newStage,
      options: {
        previousStage: previousStage,
        triggeredBy: 'kanban',
      },
    }, (response) => {
      if (!response || !response.success) {
        console.error('[Dashboard] Erro ao mover card:', response && response.error);
        if (this.contacts[chatId]) {
          this.contacts[chatId].stage = previousStage;
          this.render();
        }
        this.showNotification('Erro ao mover contato', 'error');
      } else {
        this.showNotification(`Contato movido para ${this.getStage(newStage)?.name || newStage}`, 'success');
      }
    });

    // Também enviar via postMessage (integração opcional com runtime direto)
    window.postMessage({
      source: 'QUANTUM_KANBAN',
      action: 'MOVE_CARD',
      chatId: chatId,
      previousStage: previousStage,
      newStage: newStage,
    }, '*');
  }

  // ========== AÇÕES DE CARD ==========

  handleCardClick(card) {
    const chatId = card.dataset.chatId;
    this.openContactModal(chatId);
  }

  handleCardAction(e, card) {
    const action = e.target.closest('button')?.dataset.action;
    const chatId = card.dataset.chatId;

    switch (action) {
      case 'open-chat':
        this.openChat(chatId);
        break;

      case 'edit':
        this.openContactModal(chatId);
        break;

      case 'add-note':
        this.addNotePrompt(chatId);
        break;
    }
  }

  /**
   * Abre chat no WhatsApp
   */
  openChat(chatId) {
    try {
      chrome.runtime.sendMessage({
        type: 'OPEN_WHATSAPP_CHAT',
        chatId: chatId,
      });
    } catch (e) {
      console.error('[Dashboard] Erro ao abrir chat:', e);
    }
  }

  /**
   * Abre modal de edição de contato
   */
  openContactModal(chatId) {
    const contact = this.contacts[chatId];
    if (!contact) return;

    const modal = document.createElement('div');
    modal.className = 'contact-modal';
    modal.innerHTML = `
      <div class="contact-modal-content">
        <h2>Editar Contato</h2>

        <label>Nome</label>
        <input type="text" id="contact-name" value="${this.escapeHtml(contact.name || '')}">

        <label>Telefone</label>
        <input type="text" id="contact-phone" value="${contact.phone || ''}" readonly>

        <label>Estágio</label>
        <select id="contact-stage">
          ${this.stages.map(s => `
            <option value="${s.id}" ${contact.stage === s.id ? 'selected' : ''}>
              ${s.icon} ${s.name}
            </option>
          `).join('')}
        </select>

        <label>Valor (R$)</label>
        <input type="number" id="contact-value" value="${contact.value || 0}" min="0" step="0.01">

        <label>Tags (separadas por vírgula)</label>
        <input type="text" id="contact-tags" value="${(contact.tags || []).join(', ')}">

        <label>Notas</label>
        <textarea id="contact-notes" rows="4">${(contact.notes || []).map(n => n.content || n).join('\n')}</textarea>

        <div class="contact-modal-actions">
          <button class="btn-secondary" id="modal-cancel">Cancelar</button>
          <button class="btn-primary" id="modal-save">Salvar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#modal-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('#modal-save').addEventListener('click', () => {
      this.saveContact(chatId, {
        name: modal.querySelector('#contact-name').value,
        stage: modal.querySelector('#contact-stage').value,
        value: parseFloat(modal.querySelector('#contact-value').value) || 0,
        tags: modal.querySelector('#contact-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      });
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  /**
   * Salva alterações do contato
   */
  saveContact(chatId, data) {
    const previousStage = this.contacts[chatId]?.stage;

    if (this.contacts[chatId]) {
      Object.assign(this.contacts[chatId], data);
    }

    chrome.runtime.sendMessage({
      type: 'CREATE_CONTACT',
      chatId: chatId,
      data: data,
    }, (response) => {
      if (response && response.success) {
        this.showNotification('Contato salvo!', 'success');

        if (previousStage && previousStage !== data.stage) {
          chrome.runtime.sendMessage({
            type: 'UPDATE_CONTACT_STAGE',
            chatId: chatId,
            newStage: data.stage,
            options: {
              previousStage: previousStage,
              triggeredBy: 'modal',
            },
          });
        }
      } else {
        this.showNotification('Erro ao salvar contato', 'error');
      }
    });

    this.render();
  }

  /**
   * Prompt para adicionar nota
   */
  addNotePrompt(chatId) {
    const note = window.prompt('Digite a nota:');
    if (note && note.trim()) {
      chrome.runtime.sendMessage({
        type: 'ADD_NOTE',
        chatId: chatId,
        note: note.trim(),
      });
      this.showNotification('Nota adicionada!', 'success');
    }
  }

  // ========== UTILITÁRIOS ==========

  getStage(stageId) {
    return this.stages.find(s => s.id === stageId);
  }

  getInitials(name) {
    if (!name) return '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map(n => n[0])
      .join('')
      .toUpperCase();
  }

  formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
  }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  window.kanbanDashboard = new KanbanDashboard();
  window.kanbanDashboard.init();
});

} // End of singleton guard
