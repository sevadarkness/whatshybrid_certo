/**
 * tasks_panel.js
 * Painel lateral de tarefas integrado ao WhatsApp Web
 */

(function () {
  if (typeof window === 'undefined') return;

  class TasksPanel {
    constructor() {
      this.tasks = {};
      this.stats = {
        total: 0,
        byStatus: {},
        byPriority: {},
        overdue: 0,
        dueToday: 0,
      };

      this.currentChatId = null;
      this.currentContactName = '';
      this.filterMode = 'chat'; // chat | all
      this.collapsed = false;

      this.root = null;
      this.listContainer = null;
      this.statsContainer = null;
      this.headerTitle = null;
    }

    async init() {
      this.injectStyles();
      this.createPanel();
      this.setupEventListeners();

      await this.refreshFromRuntime();
    }

    injectStyles() {
      if (document.getElementById('quantum-tasks-panel-style')) return;

      const style = document.createElement('style');
      style.id = 'quantum-tasks-panel-style';
      style.textContent = `
        #quantum-tasks-panel {
          position: fixed;
          top: 80px;
          right: 8px;
          width: 320px;
          max-height: calc(100vh - 96px);
          background: rgba(15, 23, 42, 0.96);
          border-radius: 16px;
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.6);
          color: #E5E7EB;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.25);
          backdrop-filter: blur(20px);
        }

        #quantum-tasks-panel.collapsed {
          height: auto;
          max-height: none;
        }

        .qt-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          background: radial-gradient(circle at top left, rgba(34,197,94,0.24), transparent 55%),
                      radial-gradient(circle at top right, rgba(59,130,246,0.16), transparent 55%),
                      rgba(15,23,42,0.98);
          border-bottom: 1px solid rgba(148, 163, 184, 0.3);
        }

        .qt-panel-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .qt-panel-title {
          display: flex;
          flex-direction: column;
        }

        .qt-panel-title-main {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #F9FAFB;
        }

        .qt-panel-title-sub {
          font-size: 10px;
          color: #9CA3AF;
        }

        .qt-badge {
          border-radius: 999px;
          padding: 2px 7px;
          font-size: 10px;
          background: rgba(34,197,94,0.12);
          color: #6EE7B7;
          border: 1px solid rgba(16,185,129,0.35);
        }

        .qt-panel-header-actions {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .qt-icon-button {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: none;
          background: rgba(15,23,42,0.55);
          color: #CBD5F5;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          font-size: 13px;
          transition: background 0.15s ease, transform 0.08s ease, color 0.15s ease;
        }

        .qt-icon-button:hover {
          background: rgba(15,23,42,0.9);
          transform: translateY(-1px);
          color: #F9FAFB;
        }

        .qt-icon-button:active {
          transform: translateY(0);
        }

        .qt-panel-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 8px;
          overflow: hidden;
        }

        .qt-filters-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }

        .qt-filter-chip-group {
          display: inline-flex;
          padding: 2px;
          border-radius: 999px;
          background: rgba(15,23,42,0.9);
          border: 1px solid rgba(51, 65, 85, 0.9);
        }

        .qt-filter-chip {
          border-radius: 999px;
          border: none;
          background: transparent;
          color: #9CA3AF;
          font-size: 10px;
          padding: 3px 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .qt-filter-chip.active {
          background: linear-gradient(to right, rgba(34,197,94,0.18), rgba(45,212,191,0.08));
          color: #ECFEFF;
        }

        .qt-filter-chip span.qt-pill-count {
          background: rgba(15,23,42,0.75);
          border-radius: 999px;
          padding: 0 5px;
          color: #A7F3D0;
          font-weight: 600;
        }

        .qt-kpi-row {
          display: flex;
          gap: 6px;
        }

        .qt-kpi-card {
          flex: 1;
          border-radius: 10px;
          background: radial-gradient(circle at top, rgba(15,23,42,0.85), rgba(15,23,42,0.9));
          border: 1px solid rgba(51,65,85,0.9);
          padding: 6px 7px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .qt-kpi-label {
          font-size: 10px;
          color: #9CA3AF;
        }

        .qt-kpi-value-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .qt-kpi-value {
          font-size: 14px;
          font-weight: 600;
        }

        .qt-kpi-pill {
          font-size: 10px;
          border-radius: 999px;
          padding: 1px 6px;
          background: rgba(15,23,42,0.8);
          border: 1px solid rgba(55,65,81,0.9);
        }

        .qt-kpi-pill-danger {
          color: #FECACA;
          border-color: rgba(248,113,113,0.85);
          background: rgba(127,29,29,0.72);
        }

        .qt-kpi-pill-warning {
          color: #FEF3C7;
          border-color: rgba(245,158,11,0.9);
          background: rgba(120,53,15,0.75);
        }

        .qt-kpi-pill-ok {
          color: #BBF7D0;
          border-color: rgba(34,197,94,0.9);
          background: rgba(5,46,22,0.85);
        }

        .qt-section-label {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #9CA3AF;
          margin-top: 2px;
        }

        .qt-list {
          margin-top: 2px;
          border-radius: 10px;
          background: rgba(15,23,42,0.92);
          border: 1px solid rgba(51,65,85,0.9);
          max-height: 260px;
          overflow-y: auto;
          padding: 4px;
          scrollbar-width: thin;
        }

        .qt-empty-state {
          padding: 10px 8px;
          text-align: center;
          font-size: 11px;
          color: #9CA3AF;
        }

        .qt-empty-state span {
          display: block;
          margin-top: 4px;
          font-size: 10px;
          color: #6B7280;
        }

        .qt-task-item {
          border-radius: 8px;
          padding: 6px 7px;
          background: radial-gradient(circle at top left, rgba(34,197,94,0.10), transparent 45%),
                      radial-gradient(circle at bottom right, rgba(59,130,246,0.12), transparent 55%),
                      rgba(15,23,42,0.95);
          border: 1px solid transparent;
          margin-bottom: 4px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          cursor: default;
        }

        .qt-task-item[data-status="completed"] {
          opacity: 0.7;
          background: rgba(15,23,42,0.92);
          border-color: rgba(16,185,129,0.40);
        }

        .qt-task-item[data-status="completed"] .qt-task-title {
          text-decoration: line-through;
          color: #9CA3AF;
        }

        .qt-task-header {
          display: flex;
          justify-content: space-between;
          gap: 4px;
        }

        .qt-task-title {
          font-size: 11px;
          font-weight: 600;
          color: #E5E7EB;
        }

        .qt-task-badges {
          display: inline-flex;
          gap: 3px;
          align-items: center;
        }

        .qt-badge-pill {
          border-radius: 999px;
          padding: 1px 6px;
          font-size: 9px;
          border: 1px solid rgba(55,65,81,0.9);
          background: rgba(15,23,42,0.9);
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }

        .qt-badge-pill-status-pending {
          border-color: rgba(245,158,11,0.9);
          color: #FBBF24;
        }

        .qt-badge-pill-status-in_progress {
          border-color: rgba(59,130,246,0.9);
          color: #93C5FD;
        }

        .qt-badge-pill-status-completed {
          border-color: rgba(16,185,129,0.9);
          color: #6EE7B7;
        }

        .qt-badge-pill-priority-urgent {
          border-color: rgba(248,113,113,0.95);
          color: #FCA5A5;
        }

        .qt-badge-pill-priority-high {
          border-color: rgba(249,115,22,0.95);
          color: #FED7AA;
        }

        .qt-badge-pill-priority-medium {
          border-color: rgba(245,158,11,0.95);
          color: #FDE68A;
        }

        .qt-badge-pill-priority-low {
          border-color: rgba(34,197,94,0.95);
          color: #BBF7D0;
        }

        .qt-task-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 4px;
        }

        .qt-task-meta-left {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          color: #9CA3AF;
          font-size: 10px;
        }

        .qt-task-meta-right {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .qt-task-chip {
          border-radius: 999px;
          padding: 1px 6px;
          border: 1px solid rgba(55,65,81,0.85);
          background: rgba(15,23,42,0.9);
          font-size: 10px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }

        .qt-task-chip-overdue {
          border-color: rgba(248,113,113,0.95);
          color: #FECACA;
          background: rgba(127,29,29,0.8);
        }

        .qt-task-chip-today {
          border-color: rgba(250,204,21,0.95);
          color: #FEF9C3;
          background: rgba(113,63,18,0.85);
        }

        .qt-tag {
          border-radius: 999px;
          padding: 0 6px;
          font-size: 9px;
          background: rgba(31,41,55,0.9);
          border: 1px solid rgba(55,65,81,0.9);
        }

        .qt-task-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
        }

        .qt-task-actions {
          display: flex;
          gap: 4px;
        }

        .qt-button {
          border-radius: 999px;
          border: 1px solid rgba(55,65,81,0.9);
          background: rgba(15,23,42,0.9);
          color: #E5E7EB;
          font-size: 10px;
          padding: 2px 7px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: background 0.12s ease, transform 0.05s ease;
        }

        .qt-button:hover {
          background: rgba(30,64,175,0.95);
        }

        .qt-button-primary {
          border-color: rgba(34,197,94,0.9);
          background: rgba(6,78,59,0.9);
          color: #BBF7D0;
        }

        .qt-button-primary:hover {
          background: rgba(4,120,87,1);
        }

        .qt-button-icon {
          border-radius: 999px;
          border: none;
          background: transparent;
          color: #9CA3AF;
          padding: 0;
          cursor: pointer;
        }

        .qt-new-task-form {
          margin-top: 6px;
          border-radius: 10px;
          background: rgba(15,23,42,0.94);
          border: 1px solid rgba(55,65,81,0.9);
          padding: 6px 7px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .qt-field-row {
          display: flex;
          gap: 4px;
        }

        .qt-input,
        .qt-select {
          flex: 1;
          border-radius: 999px;
          border: 1px solid rgba(55,65,81,0.9);
          background: rgba(15,23,42,0.9);
          color: #E5E7EB;
          font-size: 11px;
          padding: 3px 8px;
          outline: none;
        }

        .qt-input::placeholder {
          color: #6B7280;
        }

        .qt-select {
          padding-right: 20px;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image:
            linear-gradient(45deg, transparent 50%, #9CA3AF 50%),
            linear-gradient(135deg, #9CA3AF 50%, transparent 50%);
          background-position:
            calc(100% - 12px) 8px,
            calc(100% - 8px) 8px;
          background-size: 4px 4px, 4px 4px;
          background-repeat: no-repeat;
        }

        .qt-footer {
          padding: 4px 7px 6px;
          border-top: 1px solid rgba(31,41,55,0.9);
          font-size: 10px;
          color: #6B7280;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .qt-footer span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
      `;
      document.head.appendChild(style);
    }

    createPanel() {
      if (document.getElementById('quantum-tasks-panel')) return;

      const root = document.createElement('div');
      root.id = 'quantum-tasks-panel';

      root.innerHTML = `
        <div class="qt-panel-header">
          <div class="qt-panel-header-left">
            <div class="qt-panel-title">
              <div class="qt-panel-title-main">Tasks</div>
              <div class="qt-panel-title-sub">Quantum WA · por conversa</div>
            </div>
            <div class="qt-badge" id="qt-badge-count">0 abertas</div>
          </div>
          <div class="qt-panel-header-actions">
            <button class="qt-icon-button" id="qt-toggle-collapse" title="Minimizar / expandir painel">
              ▾
            </button>
          </div>
        </div>
        <div class="qt-panel-body">
          <div class="qt-filters-row">
            <div class="qt-filter-chip-group" id="qt-filter-chip-group">
              <button class="qt-filter-chip active" data-mode="chat">
                Chat atual
                <span class="qt-pill-count" id="qt-chip-chat-count">0</span>
              </button>
              <button class="qt-filter-chip" data-mode="all">
                Todas
                <span class="qt-pill-count" id="qt-chip-all-count">0</span>
              </button>
            </div>
          </div>

          <div class="qt-kpi-row">
            <div class="qt-kpi-card">
              <div class="qt-kpi-label">Abertas</div>
              <div class="qt-kpi-value-row">
                <div class="qt-kpi-value" id="qt-kpi-open">0</div>
                <span class="qt-kpi-pill qt-kpi-pill-ok" id="qt-kpi-open-pill">OK</span>
              </div>
            </div>
            <div class="qt-kpi-card">
              <div class="qt-kpi-label">Críticas</div>
              <div class="qt-kpi-value-row">
                <div class="qt-kpi-value" id="qt-kpi-overdue">0</div>
                <span class="qt-kpi-pill qt-kpi-pill-danger" id="qt-kpi-overdue-pill">0 atrasadas</span>
              </div>
            </div>
          </div>

          <div class="qt-section-label">Tarefas</div>
          <div class="qt-list" id="qt-task-list"></div>

          <div class="qt-new-task-form">
            <div class="qt-section-label">Nova tarefa</div>
            <input class="qt-input" id="qt-input-title" type="text" placeholder="Título da tarefa (ex: Retornar cliente)">
            <div class="qt-field-row">
              <input class="qt-input" id="qt-input-due" type="date">
              <select class="qt-select" id="qt-select-priority">
                <option value="medium">Prioridade média</option>
                <option value="low">Baixa</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            <button class="qt-button qt-button-primary" id="qt-btn-add">
              <span>+ Criar tarefa</span>
            </button>
          </div>
        </div>
        <div class="qt-footer">
          <span id="qt-footer-chat">Nenhum chat ativo</span>
          <span>Tasks Runtime</span>
        </div>
      `;

      document.body.appendChild(root);
      this.root = root;
      this.listContainer = root.querySelector('#qt-task-list');
      this.statsContainer = root.querySelector('.qt-kpi-row');
      this.headerTitle = root.querySelector('.qt-panel-title-sub');

      this.bindPanelElements();
    }

    bindPanelElements() {
      const collapseBtn = this.root.querySelector('#qt-toggle-collapse');
      collapseBtn.addEventListener('click', () => {
        this.collapsed = !this.collapsed;
        if (this.collapsed) {
          this.root.classList.add('collapsed');
          this.root.style.height = 'auto';
          this.root.querySelector('.qt-panel-body').style.display = 'none';
          this.root.querySelector('.qt-footer').style.display = 'none';
          collapseBtn.textContent = '▴';
        } else {
          this.root.classList.remove('collapsed');
          this.root.querySelector('.qt-panel-body').style.display = 'flex';
          this.root.querySelector('.qt-footer').style.display = 'flex';
          this.root.style.height = '';
          collapseBtn.textContent = '▾';
        }
      });

      const chipGroup = this.root.querySelector('#qt-filter-chip-group');
      chipGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.qt-filter-chip');
        if (!btn) return;
        const mode = btn.getAttribute('data-mode') || 'chat';
        this.setFilterMode(mode);
      });

      const addBtn = this.root.querySelector('#qt-btn-add');
      addBtn.addEventListener('click', () => this.handleCreateTask());

      const titleInput = this.root.querySelector('#qt-input-title');
      titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.handleCreateTask();
        }
      });
    }

    setupEventListeners() {
      // Mensagens do runtime
      window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;
        const data = event.data;
        if (data.source !== 'QUANTUM_TASKS_RUNTIME') return;
        this.handleRuntimeEvent(data);
      });

      // Eventos de chat do inject.js
      document.addEventListener('quantum:chat:opened', (e) => {
        const detail = e.detail || {};
        this.currentChatId =
          detail.chatId ||
          detail.id ||
          detail.chat?.id?._serialized ||
          detail.chat?.id ||
          null;
        this.currentContactName =
          detail.contactName ||
          detail.chat?.formattedTitle ||
          detail.chat?.name ||
          '';
        this.updateFooter();
        this.renderTasks();
      });

      // Storage
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return;
          if (changes.quantum_tasks) {
            this.tasks = changes.quantum_tasks.newValue || {};
            this.renderTasks();
          }
        });
      }
    }

    async refreshFromRuntime() {
      try {
        const response = await this.sendMessagePromise({
          type: 'GET_ALL_TASKS',
        });
        if (response && response.success) {
          this.tasks = response.tasks || {};
          this.stats = response.stats || this.stats;
        } else {
          // Fallback: carrega diretamente do storage
          const result = await new Promise((resolve) => {
            chrome.storage.local.get(['quantum_tasks'], (res) =>
              resolve(res || {}),
            );
          });
          this.tasks = result.quantum_tasks || {};
          this.stats = this.computeStats();
        }
      } catch (e) {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(['quantum_tasks'], (res) =>
            resolve(res || {}),
          );
        });
        this.tasks = result.quantum_tasks || {};
        this.stats = this.computeStats();
      }

      this.updateBadgeCounts();
      this.updateKpis();
      this.updateFooter();
      this.renderTasks();
    }

    computeStats() {
      const stats = {
        total: 0,
        byStatus: {},
        byPriority: {},
        overdue: 0,
        dueToday: 0,
      };
      const tasks = Object.values(this.tasks || {});
      stats.total = tasks.length;

      for (const t of tasks) {
        if (!t) continue;
        stats.byStatus[t.status] = (stats.byStatus[t.status] || 0) + 1;
        stats.byPriority[t.priority] =
          (stats.byPriority[t.priority] || 0) + 1;

        if (this.isOverdue(t)) stats.overdue += 1;
        else if (this.isDueToday(t)) stats.dueToday += 1;
      }

      return stats;
    }

    /**
     * Manipulação de eventos do runtime
     */
    handleRuntimeEvent(event) {
      const type = event.type;
      const data = event.data || {};

      switch (type) {
        case 'TASKS_RUNTIME_READY':
          if (data.tasks) this.tasks = data.tasks;
          if (data.stats) this.stats = data.stats;
          else this.stats = this.computeStats();
          break;

        case 'TASK_CREATED':
        case 'TASK_UPDATED':
        case 'TASK_COMPLETED':
        case 'TASK_STARTED':
        case 'TASK_STATUS_CHANGED':
        case 'TASK_PRIORITY_CHANGED': {
          const { taskId, task } = data;
          if (task && taskId) {
            this.tasks[taskId] = task;
            this.stats = this.computeStats();
          }
          break;
        }

        case 'TASK_DELETED': {
          const { taskId } = data;
          if (taskId && this.tasks[taskId]) {
            delete this.tasks[taskId];
            this.stats = this.computeStats();
          }
          break;
        }

        case 'TASKS_UPDATE_MARKERS':
          if (data.tasks) this.tasks = data.tasks;
          this.stats = this.computeStats();
          break;

        default:
          break;
      }

      this.updateBadgeCounts();
      this.updateKpis();
      this.renderTasks();
    }

    /**
     * UI helpers
     */
    setFilterMode(mode) {
      this.filterMode = mode === 'all' ? 'all' : 'chat';

      const chips = this.root.querySelectorAll('.qt-filter-chip');
      chips.forEach((chip) => {
        const chipMode = chip.getAttribute('data-mode');
        if (chipMode === this.filterMode) chip.classList.add('active');
        else chip.classList.remove('active');
      });

      this.renderTasks();
    }

    updateBadgeCounts() {
      const badge = this.root.querySelector('#qt-badge-count');
      const chipChat = this.root.querySelector('#qt-chip-chat-count');
      const chipAll = this.root.querySelector('#qt-chip-all-count');

      const allTasks = Object.values(this.tasks || {});
      const openAll = allTasks.filter((t) =>
        ['pending', 'in_progress', 'on_hold'].includes(t.status),
      );

      let openChat = [];
      if (this.currentChatId) {
        openChat = openAll.filter((t) => t.chatId === this.currentChatId);
      }

      badge.textContent = `${openAll.length} abertas`;
      chipAll.textContent = String(openAll.length);
      chipChat.textContent = String(openChat.length);
    }

    updateKpis() {
      const openEl = this.root.querySelector('#qt-kpi-open');
      const openPill = this.root.querySelector('#qt-kpi-open-pill');
      const overdueEl = this.root.querySelector('#qt-kpi-overdue');
      const overduePill = this.root.querySelector('#qt-kpi-overdue-pill');

      const stats = this.computeStats();
      this.stats = stats;

      const open =
        (stats.byStatus['pending'] || 0) +
        (stats.byStatus['in_progress'] || 0) +
        (stats.byStatus['on_hold'] || 0);

      openEl.textContent = String(open);
      overdueEl.textContent = String(stats.overdue);

      overduePill.textContent = `${stats.overdue} atrasada(s)`;

      openPill.classList.remove(
        'qt-kpi-pill-ok',
        'qt-kpi-pill-warning',
        'qt-kpi-pill-danger',
      );
      overduePill.classList.remove(
        'qt-kpi-pill-ok',
        'qt-kpi-pill-warning',
        'qt-kpi-pill-danger',
      );

      if (stats.overdue > 0) {
        overduePill.classList.add('qt-kpi-pill-danger');
      } else if (open > 0) {
        overduePill.classList.add('qt-kpi-pill-warning');
      } else {
        overduePill.classList.add('qt-kpi-pill-ok');
      }

      if (open === 0) {
        openPill.textContent = 'Inbox zerada';
        openPill.classList.add('qt-kpi-pill-ok');
      } else if (open <= 3) {
        openPill.textContent = 'Controlado';
        openPill.classList.add('qt-kpi-pill-warning');
      } else {
        openPill.textContent = 'Acima do ideal';
        openPill.classList.add('qt-kpi-pill-danger');
      }
    }

    updateFooter() {
      const footerChat = this.root.querySelector('#qt-footer-chat');
      if (!this.currentChatId) {
        footerChat.textContent = 'Nenhum chat ativo';
        return;
      }
      const name =
        this.currentContactName && this.currentContactName.trim().length
          ? this.currentContactName
          : this.currentChatId;
      footerChat.textContent = `Chat: ${name}`;
      if (this.headerTitle) {
        this.headerTitle.textContent = `Quantum WA · ${name}`;
      }
    }

    /**
     * Renderização da lista
     */
    renderTasks() {
      if (!this.listContainer) return;

      const tasks = this.getVisibleTasks();
      this.listContainer.innerHTML = '';

      if (!tasks.length) {
        const empty = document.createElement('div');
        empty.className = 'qt-empty-state';
        empty.innerHTML =
          'Nenhuma tarefa para este contexto.<span>Use o formulário abaixo para criar sua primeira tarefa.</span>';
        this.listContainer.appendChild(empty);
        return;
      }

      tasks.forEach((task) => {
        const item = this.renderTaskItem(task);
        this.listContainer.appendChild(item);
      });
    }

    getVisibleTasks() {
      const allTasks = Object.values(this.tasks || {});
      if (!allTasks.length) return [];

      let filtered = allTasks;
      if (this.filterMode === 'chat' && this.currentChatId) {
        filtered = allTasks.filter((t) => t.chatId === this.currentChatId);
      }

      // Ordena: status -> prioridade -> data
      const statusOrder = {
        pending: 0,
        in_progress: 1,
        on_hold: 2,
        completed: 3,
        cancelled: 4,
      };
      const priorityWeight = {
        urgent: 4,
        high: 3,
        medium: 2,
        low: 1,
      };

      return filtered.sort((a, b) => {
        const as = statusOrder[a.status] ?? 99;
        const bs = statusOrder[b.status] ?? 99;
        if (as !== bs) return as - bs;

        const ap = priorityWeight[a.priority] || 0;
        const bp = priorityWeight[b.priority] || 0;
        if (ap !== bp) return bp - ap;

        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate) - new Date(b.dueDate);
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    }

    renderTaskItem(task) {
      const el = document.createElement('div');
      el.className = 'qt-task-item';
      el.dataset.id = task.id;
      el.dataset.status = task.status;

      const status = TaskSchema.StatusConfig[task.status] || {
        icon: '⬜',
        name: task.status,
      };
      const priority = TaskSchema.PriorityConfig[task.priority] || {
        icon: '•',
        name: task.priority,
      };

      const dueLabel = this.getDueLabel(task);
      const overdue = this.isOverdue(task);
      const dueToday = this.isDueToday(task);

      const tags = Array.isArray(task.tags) ? task.tags : [];

      el.innerHTML = `
        <div class="qt-task-header">
          <div class="qt-task-title">${this.escapeHtml(task.title || 'Sem título')}</div>
          <div class="qt-task-badges">
            <div class="qt-badge-pill qt-badge-pill-status-${status.id}">
              <span>${status.icon}</span>
              <span>${status.name}</span>
            </div>
            <div class="qt-badge-pill qt-badge-pill-priority-${priority.id}">
              <span>${priority.icon}</span>
              <span>${priority.name}</span>
            </div>
          </div>
        </div>
        <div class="qt-task-meta-row">
          <div class="qt-task-meta-left">
            ${
              dueLabel
                ? `<span class="qt-task-chip ${
                    overdue
                      ? 'qt-task-chip-overdue'
                      : dueToday
                      ? 'qt-task-chip-today'
                      : ''
                  }">${dueLabel}</span>`
                : ''
            }
            ${
              tags.length
                ? tags
                    .slice(0, 2)
                    .map(
                      (t) =>
                        `<span class="qt-tag">${this.escapeHtml(
                          String(t),
                        )}</span>`,
                    )
                    .join('')
                : ''
            }
          </div>
          <div class="qt-task-meta-right">
            ${
              task.chatId && task.chatId === this.currentChatId
                ? '<span class="qt-task-chip">Este chat</span>'
                : ''
            }
          </div>
        </div>
        <div class="qt-task-footer">
          <div class="qt-task-actions">
            ${
              task.status !== 'completed'
                ? `<button class="qt-button qt-button-primary" data-action="complete">
                    <span>Concluir</span>
                  </button>`
                : `<button class="qt-button" data-action="reopen">
                    <span>Reabrir</span>
                  </button>`
            }
            <button class="qt-button" data-action="start">
              <span>Iniciar</span>
            </button>
          </div>
          <button class="qt-button-icon" data-action="delete" title="Excluir tarefa">
            🗑
          </button>
        </div>
      `;

      // Listeners
      el.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const action = btn.getAttribute('data-action');
          this.handleTaskAction(action, task);
          e.stopPropagation();
        });
      });

      return el;
    }

    /**
     * Ações de tarefa a partir dos botões
     */
    async handleTaskAction(action, task) {
      if (!task || !task.id) return;

      if (action === 'delete') {
        const ok = confirm('Deseja realmente excluir esta tarefa?');
        if (!ok) return;
        await this.sendMessagePromise({
          type: 'DELETE_TASK',
          data: { id: task.id },
        });
        await this.refreshFromRuntime();
        return;
      }

      if (action === 'complete') {
        await this.sendMessagePromise({
          type: 'COMPLETE_TASK',
          data: { id: task.id, options: { source: 'panel' } },
        });
        await this.refreshFromRuntime();
        return;
      }

      if (action === 'reopen') {
        await this.sendMessagePromise({
          type: 'UPDATE_TASK_STATUS',
          data: {
            id: task.id,
            status: 'pending',
            options: { source: 'panel' },
          },
        });
        await this.refreshFromRuntime();
        return;
      }

      if (action === 'start') {
        await this.sendMessagePromise({
          type: 'START_TASK',
          data: { id: task.id, options: { source: 'panel' } },
        });
        await this.refreshFromRuntime();
        return;
      }
    }

    /**
     * Criação de nova tarefa
     */
    async handleCreateTask() {
      const titleInput = this.root.querySelector('#qt-input-title');
      const dueInput = this.root.querySelector('#qt-input-due');
      const prioritySelect = this.root.querySelector('#qt-select-priority');

      const title = String(titleInput.value || '').trim();
      if (!title) {
        titleInput.focus();
        return;
      }

      const dueDate = dueInput.value || null;
      const priority = prioritySelect.value || 'medium';

      const payload = {
        title,
        chatId: this.currentChatId || null,
        contactName: this.currentContactName || '',
        priority,
        dueDate,
        autoStart: true,
        autoComplete: true,
      };

      try {
        await this.sendMessagePromise({
          type: 'CREATE_TASK',
          data: payload,
        });

        titleInput.value = '';
        // Não limpamos a data / prioridade para facilitar cadastros em lote
        await this.refreshFromRuntime();
      } catch (e) {
        console.error('[TasksPanel] Erro ao criar tarefa:', e);
      }
    }

    /**
     * Utils
     */
    getDueLabel(task) {
      if (!task || !task.dueDate) return null;
      try {
        const d = new Date(task.dueDate);
        const today = new Date();
        const dateStr = d.toLocaleDateString(undefined, {
          day: '2-digit',
          month: '2-digit',
        });

        if (this.isOverdue(task)) {
          return `Venceu em ${dateStr}`;
        }
        if (this.isDueToday(task)) {
          return 'Vence hoje';
        }
        return `Vence em ${dateStr}`;
      } catch (e) {
        return null;
      }
    }

    isOverdue(task) {
      if (!task || !task.dueDate) return false;
      if (task.status === 'completed' || task.status === 'cancelled') {
        return false;
      }
      try {
        const due = new Date(task.dueDate);
        if (task.dueTime) {
          const [h, m] = task.dueTime.split(':');
          due.setHours(parseInt(h, 10), parseInt(m, 10) || 0, 0, 0);
        } else {
          due.setHours(23, 59, 59, 999);
        }
        return new Date() > due;
      } catch (e) {
        return false;
      }
    }

    isDueToday(task) {
      if (!task || !task.dueDate) return false;
      try {
        const today = new Date();
        const d = new Date(task.dueDate);
        return today.toDateString() === d.toDateString();
      } catch (e) {
        return false;
      }
    }

    escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    sendMessagePromise(message) {
      return new Promise((resolve, reject) => {
        try {
          const callback = (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              // Se nenhum listener respondeu, apenas resolvemos vazio
              if (
                err.message &&
                err.message.includes('Receiving end does not exist')
              ) {
                resolve(null);
                return;
              }
              reject(err);
              return;
            }
            resolve(response);
          };

          const result = chrome.runtime.sendMessage(message, callback);
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(reject);
          }
        } catch (e) {
          reject(e);
        }
      });
    }
  }

  const panel = new TasksPanel();
  window.__QUANTUM_TASKS_PANEL__ = panel;
  panel.init();
})();
