// smart_replies/SmartRepliesUI.js

import { CopilotMode, SELECTORS } from './SmartRepliesTypes.js';
import { personaManager } from './PersonaManager.js';

/**
 * UI do Copiloto Pro: painel de sugestões, controles de modo e resumo.
 */
export class SmartRepliesUI {
  constructor(copilotEngine, flowController, summaryScheduler) {
    this.copilotEngine = copilotEngine;
    this.flowController = flowController;
    this.summaryScheduler = summaryScheduler;

    this.root = null;
    this.suggestionsList = null;
    this.modeButtons = {};
    this.statusLabel = null;
    this.personaSelect = null;
    this.loadingSpinner = null;
    this.confirmationModal = null;
    this.currentChatId = null;

    this.init();
    this.bindEngineEvents();
    this.loadPersonas();
  }

  // ============ INICIALIZAÇÃO ============

  init() {
    this.injectStyles();
    this.createRoot();
  }

  async loadPersonas() {
    try {
      // Garante que o PersonaManager esteja inicializado
      if (!personaManager.isLoaded) {
        await personaManager.init();
      }
      const personas = personaManager.getAllPersonas();
      const active = personaManager.getActivePersona()?.id || 'professional';
      this.setPersonaOptions(personas, active);
    } catch (e) {
      console.warn('[SmartRepliesUI] Falha ao carregar personas:', e);
    }
  }

  injectStyles() {
    if (document.getElementById('sr-copilot-styles')) return;

    const style = document.createElement('style');
    style.id = 'sr-copilot-styles';
    style.textContent = `
      .sr-copilot-container {
        display: none; /* AI 100% opcional — só aparece quando existem sugestões */
        flex-direction: column;
        gap: 4px;
        padding: 6px 8px;
        margin: 6px 0 4px 0;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.78);
        border: 1px solid rgba(148, 163, 184, 0.22);
        backdrop-filter: blur(10px);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .sr-copilot-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .sr-copilot-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: #c4b5fd;
      }

      .sr-copilot-title-icon {
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: linear-gradient(135deg, #8b5cf6, #3b82f6);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        color: #0b1020;
      }

      .sr-copilot-modes {
        display: inline-flex;
        border-radius: 999px;
        background: rgba(2, 6, 23, 0.55);
        border: 1px solid rgba(148, 163, 184, 0.22);
        overflow: hidden;
      }

      .sr-mode-btn {
        border: none;
        padding: 3px 8px;
        font-size: 11px;
        cursor: pointer;
        background: transparent;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }

      .sr-mode-btn span {
        font-size: 10px;
        opacity: 0.8;
      }

      .sr-mode-btn-active {
        background: linear-gradient(135deg, #8b5cf6, #3b82f6);
        color: #0b1020;
      }

      .sr-mode-btn-active span {
        opacity: 1;
      }

      .sr-copilot-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .sr-suggestions-list {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .sr-suggestion-chip {
        max-width: 260px;
        padding: 5px 8px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        background: rgba(2, 6, 23, 0.45);
        color: #e5e7eb;
        font-size: 11px;
        line-height: 1.3;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .sr-suggestion-chip:hover {
        background: rgba(139, 92, 246, 0.18);
        border-color: rgba(139, 92, 246, 0.35);
      }

      .sr-suggestion-type {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: .04em;
        opacity: 0.85;
        color: #93c5fd;
      }

      .sr-suggestion-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sr-copilot-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-size: 10px;
        color: rgba(226, 232, 240, 0.75);
        border-top: 1px solid rgba(148, 163, 184, 0.18);
        padding-top: 6px;
      }

      .sr-persona-select {
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        padding: 2px 6px;
        font-size: 10px;
        background: rgba(2, 6, 23, 0.35);
        color: #e5e7eb;
        max-width: 160px;
      }

      .sr-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .sr-action-btn {
        border-radius: 999px;
        border: none;
        padding: 2px 6px;
        font-size: 10px;
        cursor: pointer;
        background: rgba(139, 92, 246, 0.14);
        color: #ddd6fe;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .sr-action-btn:hover {
        background: rgba(59, 130, 246, 0.18);
      }

      .sr-status-label {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .sr-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #3b82f6;
      }

      .sr-dot-off {
        background: #64748b;
      }

      .sr-loading {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-top-color: #8b5cf6;
        animation: sr-spin 0.9s linear infinite;
      }

      @keyframes sr-spin {
        to { transform: rotate(360deg); }
      }

      /* Modal simples de confirmação */
      .sr-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }

      .sr-modal {
        width: 360px;
        max-width: 90vw;
        background: rgba(15, 23, 42, 0.96);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-size: 13px;
      }

      .sr-modal-header {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .sr-modal-title {
        font-weight: 600;
        font-size: 13px;
        color: #c4b5fd;
      }

      .sr-modal-body {
        padding: 10px 12px;
        max-height: 240px;
        overflow-y: auto;
      }

      .sr-modal-preview {
        white-space: pre-wrap;
        border-radius: 8px;
        padding: 8px;
        background: rgba(2, 6, 23, 0.45);
        color: #e5e7eb;
        font-size: 12px;
      }

      .sr-modal-footer {
        padding: 8px 12px;
        border-top: 1px solid rgba(148, 163, 184, 0.18);
        display: flex;
        justify-content: flex-end;
        gap: 6px;
      }

      .sr-btn {
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        padding: 5px 10px;
        font-size: 12px;
        cursor: pointer;
      }

      .sr-btn-secondary {
        background: rgba(148, 163, 184, 0.14);
        color: #e5e7eb;
      }

      .sr-btn-primary {
        background: linear-gradient(135deg, #8b5cf6, #3b82f6);
        color: #0b1020;
      }
    `;

    document.head.appendChild(style);
  }

  createRoot() {
    if (this.root && document.body.contains(this.root)) return;

    const composeBox = document.querySelector(SELECTORS.COMPOSE_BOX);
    if (!composeBox) return;

    this.root = document.createElement('div');
    this.root.className = 'sr-copilot-container';

    // Header
    const header = document.createElement('div');
    header.className = 'sr-copilot-header';

    const title = document.createElement('div');
    title.className = 'sr-copilot-title';
    title.innerHTML = `
      <div class="sr-copilot-title-icon">AI</div>
      <span>Copiloto Pro</span>
    `;

    const modes = document.createElement('div');
    modes.className = 'sr-copilot-modes';
    modes.append(
      this.createModeButton('OFF', CopilotMode.OFF, 'Off'),
      this.createModeButton('SG', CopilotMode.SUGGEST, 'Sugestão'),
      this.createModeButton('SA', CopilotMode.SEMI_AUTO, 'Semi-auto'),
      this.createModeButton('AU', CopilotMode.FULL_AUTO, 'Auto')
    );

    header.append(title, modes);

    // Body
    const body = document.createElement('div');
    body.className = 'sr-copilot-body';

    this.suggestionsList = document.createElement('div');
    this.suggestionsList.className = 'sr-suggestions-list';

    body.appendChild(this.suggestionsList);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'sr-copilot-footer';

    this.personaSelect = document.createElement('select');
    this.personaSelect.className = 'sr-persona-select';
    this.personaSelect.addEventListener('change', async () => {
      const personaId = this.personaSelect.value;
      try {
        await personaManager.setActivePersona(personaId);
      } catch (e) {
        console.error('[SmartRepliesUI] Erro ao trocar persona:', e);
      }
    });

    const actions = document.createElement('div');
    actions.className = 'sr-actions';

    const status = document.createElement('div');
    status.className = 'sr-status-label';
    status.innerHTML = `<span class="sr-dot"></span><span>Pronto</span>`;
    this.statusLabel = status;

    // A geração de respostas por IA é acionada exclusivamente pela varinha mágica
    // ao lado do botão “+” do WhatsApp (UX: AI opcional e sem bloquear envio).
    actions.append(status);
    footer.append(this.personaSelect, actions);

    this.root.append(header, body, footer);

    // Inserir logo acima da caixa de texto
    composeBox.parentElement.insertBefore(this.root, composeBox);
  }

  createModeButton(shortLabel, mode, tooltip) {
    const btn = document.createElement('button');
    btn.className = 'sr-mode-btn';
    btn.title = tooltip;
    btn.innerHTML = `<strong>${shortLabel}</strong><span>${tooltip}</span>`;

    btn.addEventListener('click', () => {
      this.copilotEngine.setMode(mode);
      this.updateModeButtons(mode);
    });

    this.modeButtons[mode] = btn;
    return btn;
  }

  // ============ ATUALIZAÇÃO DE UI ============

  updateModeButtons(activeMode) {
    Object.entries(this.modeButtons).forEach(([mode, btn]) => {
      if (mode === activeMode) {
        btn.classList.add('sr-mode-btn-active');
      } else {
        btn.classList.remove('sr-mode-btn-active');
      }
    });

    if (!this.statusLabel) return;
    const dot = this.statusLabel.querySelector('.sr-dot');
    const text = this.statusLabel.querySelector('span:last-child');

    if (activeMode === CopilotMode.OFF) {
      dot.classList.add('sr-dot-off');
      text.textContent = 'Copiloto desligado';
    } else if (activeMode === CopilotMode.SUGGEST) {
      dot.classList.remove('sr-dot-off');
      text.textContent = 'Sugestões inteligentes';
    } else if (activeMode === CopilotMode.SEMI_AUTO) {
      dot.classList.remove('sr-dot-off');
      text.textContent = 'Semi-automático';
    } else if (activeMode === CopilotMode.FULL_AUTO) {
      dot.classList.remove('sr-dot-off');
      text.textContent = 'Modo auto';
    }
  }

  setLoading(isLoading) {
    if (!this.statusLabel) return;

    let spinner = this.statusLabel.querySelector('.sr-loading');
    if (isLoading) {
      if (!spinner) {
        spinner = document.createElement('div');
        spinner.className = 'sr-loading';
        this.statusLabel.insertBefore(spinner, this.statusLabel.firstChild);
      }
    } else if (spinner) {
      spinner.remove();
    }
  }

  setPersonaOptions(personas, activePersonaId) {
    if (!this.personaSelect) return;

    this.personaSelect.innerHTML = '';
    personas.forEach(persona => {
      const opt = document.createElement('option');
      opt.value = persona.id;
      opt.textContent = persona.name;
      if (persona.id === activePersonaId) opt.selected = true;
      this.personaSelect.appendChild(opt);
    });
  }

  updateSuggestions(suggestions) {
    if (!this.suggestionsList) return;
    this.suggestionsList.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
      // UX: IA deve ser opcional e nunca bloquear o fluxo manual.
      // Não exibir barra vazia (evita “empurrar” a área de envio).
      if (this.root) this.root.style.display = 'none';
      return;
    }

    if (this.root) this.root.style.display = 'flex';

    suggestions.forEach(s => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sr-suggestion-chip';

      const type = document.createElement('span');
      type.className = 'sr-suggestion-type';
      type.textContent = (s.type || 'Sugestão').toUpperCase();

      const text = document.createElement('span');
      text.className = 'sr-suggestion-text';
      text.textContent = s.text || s;

      chip.append(type, text);
      chip.addEventListener('click', () => {
        // Insere no input para edição manual
        this.insertTextInInput(s.text || s);
      });

      this.suggestionsList.appendChild(chip);
    });
  }

  insertTextInInput(text) {
    const input = document.querySelector(SELECTORS.MESSAGE_INPUT);
    if (!input) return;

    input.focus();
    document.execCommand('insertText', false, text);
  }

  // ============ MODAL DE CONFIRMAÇÃO ============

  showConfirmation(reply, onConfirm, onCancel) {
    if (this.confirmationModal) {
      this.confirmationModal.remove();
      this.confirmationModal = null;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'sr-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'sr-modal';

    const header = document.createElement('div');
    header.className = 'sr-modal-header';
    header.innerHTML = `
      <div class="sr-modal-title">Confirmar resposta do Copiloto</div>
    `;

    const body = document.createElement('div');
    body.className = 'sr-modal-body';
    const p = document.createElement('p');
    p.textContent = 'O Copiloto gerou a seguinte resposta:';
    const preview = document.createElement('div');
    preview.className = 'sr-modal-preview';
    preview.textContent = reply;
    body.append(p, preview);

    const footer = document.createElement('div');
    footer.className = 'sr-modal-footer';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'sr-btn sr-btn-secondary';
    btnCancel.textContent = 'Editar antes de enviar';
    btnCancel.addEventListener('click', () => {
      this.insertTextInInput(reply);
      backdrop.remove();
      this.confirmationModal = null;
      onCancel && onCancel();
    });

    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'sr-btn sr-btn-primary';
    btnConfirm.textContent = 'Enviar agora';
    btnConfirm.addEventListener('click', () => {
      onConfirm && onConfirm();
      backdrop.remove();
      this.confirmationModal = null;
    });

    footer.append(btnCancel, btnConfirm);
    modal.append(header, body, footer);
    backdrop.appendChild(modal);

    document.body.appendChild(backdrop);
    this.confirmationModal = backdrop;
  }

  // ============ INTEGRAÇÃO COM ENGINE ============

  bindEngineEvents() {
    if (!this.copilotEngine) return;

    this.copilotEngine.on('modeChanged', mode => {
      this.updateModeButtons(mode);
    });

    this.copilotEngine.on('loading', isLoading => {
      this.setLoading(isLoading);
    });

    this.copilotEngine.on('suggestionsReady', suggestions => {
      this.updateSuggestions(suggestions);
    });

    this.copilotEngine.on('confirmationRequired', ({ chatId, reply }) => {
      this.currentChatId = chatId;
      this.showConfirmation(reply, async () => {
        await this.copilotEngine.confirmAndSend(chatId, reply);
      });
    });
  }

  setCurrentChatId(chatId) {
    this.currentChatId = chatId;
  }
}

export default SmartRepliesUI;
