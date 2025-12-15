/**
 * task_markers_injector.js
 * Injeta marcadores de tarefas na lista de conversas do WhatsApp Web
 */

(function () {
  if (typeof window === 'undefined') return;

  class TaskMarkersInjector {
    constructor() {
      this.tasks = {};
      this.markerSettings = this.getDefaultSettings();
      this.currentChatId = null;

      this.chatListObserver = null;
      this.chatListContainer = null;
      this.initialized = false;
    }

    getDefaultSettings() {
      return {
        enabled: true,
        showOnlyPending: true,
        showCount: true,
        showPriority: true,
        compactMode: true,
      };
    }

    async init() {
      if (this.initialized) return;
      this.initialized = true;

      await this.loadState();
      this.injectStyles();
      this.setupEventListeners();
      this.waitForWhatsApp();
    }

    storageGet(keys) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(keys, (result) => resolve(result || {}));
        } catch (e) {
          resolve({});
        }
      });
    }

    async loadState() {
      const result = await this.storageGet([
        'quantum_tasks',
        'quantum_task_marker_settings',
      ]);

      this.tasks = result.quantum_tasks || {};
      this.markerSettings = Object.assign(
        {},
        this.getDefaultSettings(),
        result.quantum_task_marker_settings || {},
      );
    }

    injectStyles() {
      if (document.getElementById('quantum-tasks-markers-style')) return;

      const style = document.createElement('style');
      style.id = 'quantum-tasks-markers-style';
      style.textContent = `
        .quantum-task-marker {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 999px;
          font-size: 10px;
          line-height: 1;
          background: rgba(59, 130, 246, 0.15);
          color: #1D4ED8;
          margin-left: 4px;
          cursor: default;
          user-select: none;
        }
        .quantum-task-marker[data-priority="urgent"] {
          background: rgba(239, 68, 68, 0.16);
          color: #B91C1C;
          font-weight: 600;
        }
        .quantum-task-marker[data-priority="high"] {
          background: rgba(249, 115, 22, 0.16);
          color: #C2410C;
        }
        .quantum-task-marker[data-priority="medium"] {
          background: rgba(245, 158, 11, 0.16);
          color: #92400E;
        }
        .quantum-task-marker[data-priority="low"] {
          background: rgba(16, 185, 129, 0.16);
          color: #047857;
        }
        .quantum-task-marker-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: currentColor;
        }
        .quantum-task-marker-count {
          font-weight: 600;
        }
        .quantum-task-marker-priority {
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
      `;
      document.head.appendChild(style);
    }

    setupEventListeners() {
      // Eventos do runtime de tasks
      window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;
        const data = event.data;
        if (data.source !== 'QUANTUM_TASKS_RUNTIME') return;

        this.handleRuntimeEvent(data);
      });

      // Mensagens diretas da extensão
      if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(
          (message, sender, sendResponse) => {
            if (!message || !message.type) return;

            switch (message.type) {
              case 'UPDATE_TASK_MARKERS':
                if (message.data && message.data.tasks) {
                  this.tasks = message.data.tasks;
                }
                if (message.data && message.data.currentChatId) {
                  this.currentChatId = message.data.currentChatId;
                }
                this.updateAllMarkers();
                sendResponse({ success: true });
                break;

              case 'SET_MARKER_SETTINGS':
                this.markerSettings = Object.assign(
                  {},
                  this.markerSettings,
                  message.data || {},
                );
                chrome.storage.local.set(
                  { quantum_task_marker_settings: this.markerSettings },
                  () => {
                    this.updateAllMarkers();
                    sendResponse({ success: true });
                  },
                );
                break;

              case 'GET_MARKER_SETTINGS':
                sendResponse({
                  success: true,
                  settings: this.markerSettings,
                });
                break;

              case 'TOGGLE_MARKERS':
                this.markerSettings.enabled = !this.markerSettings.enabled;
                chrome.storage.local.set(
                  { quantum_task_marker_settings: this.markerSettings },
                  () => {
                    this.updateAllMarkers();
                    sendResponse({
                      success: true,
                      settings: this.markerSettings,
                    });
                  },
                );
                break;

              default:
                break;
            }

            return true;
          },
        );
      }

      // Storage
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return;
          if (changes.quantum_tasks) {
            this.tasks = changes.quantum_tasks.newValue || {};
            this.updateAllMarkers();
          }
        });
      }

      // Eventos customizados do runtime
      document.addEventListener('quantum:tasks:tasks_update_markers', (e) => {
        const data = e.detail || {};
        if (data.tasks) this.tasks = data.tasks;
        if (data.currentChatId) this.currentChatId = data.currentChatId;
        this.updateAllMarkers();
      });

      document.addEventListener('quantum:tasks:task_created', (e) => {
        const { task } = e.detail || {};
        if (task) {
          this.tasks[task.id] = task;
          this.updateAllMarkers();
        }
      });

      document.addEventListener('quantum:tasks:task_updated', (e) => {
        const { taskId, task } = e.detail || {};
        if (task && taskId) {
          this.tasks[taskId] = task;
          this.updateAllMarkers();
        }
      });

      document.addEventListener('quantum:tasks:task_deleted', (e) => {
        const { taskId } = e.detail || {};
        if (taskId && this.tasks[taskId]) {
          delete this.tasks[taskId];
          this.updateAllMarkers();
        }
      });

      document.addEventListener('quantum:chat:opened', (e) => {
        const detail = e.detail || {};
        this.currentChatId =
          detail.chatId ||
          detail.id ||
          detail.chat?.id?._serialized ||
          detail.chat?.id ||
          null;
      });
    }

    handleRuntimeEvent(event) {
      const type = event.type;
      const data = event.data || {};

      switch (type) {
        case 'TASKS_RUNTIME_READY':
          if (data.tasks) this.tasks = data.tasks;
          this.updateAllMarkers();
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
            this.updateAllMarkers();
          }
          break;
        }

        case 'TASK_DELETED': {
          const { taskId } = data;
          if (taskId && this.tasks[taskId]) {
            delete this.tasks[taskId];
            this.updateAllMarkers();
          }
          break;
        }

        case 'TASKS_UPDATE_MARKERS':
          if (data.tasks) this.tasks = data.tasks;
          if (data.currentChatId) this.currentChatId = data.currentChatId;
          this.updateAllMarkers();
          break;

        default:
          break;
      }
    }

    /**
     * Acompanha o carregamento da lista de conversas
     */
    waitForWhatsApp() {
      const tryFind = () => {
        const container =
          document.querySelector('#pane-side') ||
          document.querySelector('[data-testid="chat-list"]') ||
          document.querySelector('div[role="grid"]');

        if (container) {
          this.chatListContainer = container;
          this.observeChatList();
          this.updateAllMarkers();
          return true;
        }
        return false;
      };

      if (!tryFind()) {
        const interval = setInterval(() => {
          if (tryFind()) clearInterval(interval);
        }, 1000);
        setTimeout(() => clearInterval(interval), 30000);
      }
    }

    observeChatList() {
      if (!this.chatListContainer || this.chatListObserver) return;

      this.chatListObserver = new MutationObserver(() => {
        this.updateAllMarkers();
      });

      this.chatListObserver.observe(this.chatListContainer, {
        childList: true,
        subtree: true,
      });
    }

    /**
     * Atualiza todos os marcadores
     */
    updateAllMarkers() {
      if (!this.markerSettings.enabled) {
        this.removeAllMarkers();
        return;
      }
      if (!this.chatListContainer) {
        this.waitForWhatsApp();
        return;
      }

      const chatItems = this.chatListContainer.querySelectorAll(
        'div[role="row"]',
      );
      chatItems.forEach((item) => this.updateChatItemMarker(item));
    }

    removeAllMarkers() {
      const markers = document.querySelectorAll('.quantum-task-marker');
      markers.forEach((el) => el.remove());
    }

    /**
     * Atualiza marcador de um item de chat
     */
    updateChatItemMarker(chatItem) {
      if (!chatItem) return;

      const chatId = this.extractChatId(chatItem);
      if (!chatId) return;

      const tasks = this.getTasksForChat(chatId);
      const pending = tasks.filter((t) =>
        [ 'pending', 'in_progress', 'on_hold' ].includes(t.status),
      );
      const overdue = pending.filter((t) => this.isOverdue(t));

      if (this.markerSettings.showOnlyPending && !pending.length) {
        this.removeMarkerFromChatItem(chatItem);
        return;
      }

      const highest = this.getHighestPriority(pending);
      if (!highest && !overdue.length) {
        this.removeMarkerFromChatItem(chatItem);
        return;
      }

      this.renderMarker(chatItem, {
        chatId,
        pendingCount: pending.length,
        overdueCount: overdue.length,
        highestPriority: highest ? highest.priority : null,
      });
    }

    extractChatId(chatItem) {
      // Diversas maneiras de encontrar um identificador estável do chat
      const row = chatItem;
      const dataId =
        row.getAttribute('data-id') ||
        row.getAttribute('data-testid') ||
        row.dataset?.id ||
        null;

      if (dataId) return dataId;

      // Fallback: usar texto do título (não é ideal, mas ajuda)
      const titleEl =
        row.querySelector('[data-testid="cell-frame-title"] span') ||
        row.querySelector('span[dir="auto"]');
      const title = titleEl ? titleEl.textContent.trim() : null;
      return title || null;
    }

    getTasksForChat(chatId) {
      if (!chatId) return [];
      return Object.values(this.tasks || {}).filter((t) => t.chatId === chatId);
    }

    getHighestPriority(tasks) {
      if (!tasks || !tasks.length) return null;
      const order = { urgent: 4, high: 3, medium: 2, low: 1 };
      return tasks
        .slice()
        .sort(
          (a, b) =>
            (order[b.priority] || 0) - (order[a.priority] || 0),
        )[0];
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

    /**
     * Renderiza o marcador visualmente
     */
    renderMarker(chatItem, info) {
      // Container onde colocaremos o marcador: perto do título
      const titleContainer =
        chatItem.querySelector('[data-testid="cell-frame-title"]') ||
        chatItem.querySelector('div[role="gridcell"]') ||
        chatItem;

      if (!titleContainer) return;

      let marker = titleContainer.querySelector('.quantum-task-marker');
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'quantum-task-marker';
        titleContainer.appendChild(marker);
      }

      marker.innerHTML = '';

      if (this.markerSettings.showPriority && info.highestPriority) {
        const dot = document.createElement('span');
        dot.className = 'quantum-task-marker-dot';
        marker.appendChild(dot);
      }

      if (this.markerSettings.showCount) {
        const count = document.createElement('span');
        count.className = 'quantum-task-marker-count';
        const textParts = [];
        if (info.pendingCount) textParts.push(String(info.pendingCount));

        if (info.overdueCount) {
          textParts.push(`⚠${info.overdueCount}`);
        }

        count.textContent = textParts.join(' / ');
        marker.appendChild(count);
      }

      if (this.markerSettings.showPriority && info.highestPriority) {
        const label = document.createElement('span');
        label.className = 'quantum-task-marker-priority';
        label.textContent = this.getPriorityLabel(info.highestPriority);
        marker.appendChild(label);
      }

      if (info.highestPriority) {
        marker.dataset.priority = info.highestPriority;
      } else {
        marker.dataset.priority = '';
      }

      marker.title =
        `${info.pendingCount || 0} tarefas pendentes` +
        (info.overdueCount
          ? ` • ${info.overdueCount} atrasada(s)`
          : '');
    }

    getPriorityLabel(priority) {
      switch (priority) {
        case 'urgent':
          return 'URG';
        case 'high':
          return 'ALTA';
        case 'medium':
          return 'MÉDIA';
        case 'low':
        default:
          return 'BAIXA';
      }
    }

    removeMarkerFromChatItem(chatItem) {
      const marker =
        chatItem &&
        chatItem.querySelector &&
        chatItem.querySelector('.quantum-task-marker');
      if (marker) marker.remove();
    }
  }

  // Inicializa
  const injector = new TaskMarkersInjector();
  window.__QUANTUM_TASK_MARKERS__ = injector;
  injector.init();
})();
