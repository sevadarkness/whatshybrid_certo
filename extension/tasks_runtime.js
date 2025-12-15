/**
 * tasks_runtime.js
 * Runtime principal do sistema de Tasks da extensão
 *
 * Responsável por:
 *  - Sincronizar tarefas (chrome.storage.local)
 *  - Integrar com eventos do WhatsApp (via inject.js)
 *  - Aplicar automações (auto-start, auto-complete, overdue)
 *  - Notificar outros scripts (painel, marcadores) via postMessage
 */

(function () {
  if (typeof window === 'undefined') return;

  // Evita múltiplas inicializações
  if (window.__QUANTUM_TASKS_RUNTIME_LOADED__) {
    return;
  }
  window.__QUANTUM_TASKS_RUNTIME_LOADED__ = true;

  class TasksRuntime {
    constructor() {
      this.tasks = {};
      this.autoRules = {};
      this.settings = this.getDefaultSettings();

      this.currentChatId = null;
      this.currentContactName = '';

      this.overdueCheckIntervalId = null;
      this.isReady = false;
    }

    /**
     * Inicialização
     */
    async init() {
      try {
        await this.loadState();
        this.setupEventListeners();
        this.setupMessageListeners();
        this.startOverdueCheck();

        this.isReady = true;
        this.broadcast('TASKS_RUNTIME_READY', {
          tasks: this.tasks,
          autoRules: this.autoRules,
          settings: this.settings,
        });
      } catch (err) {
        console.error('[TasksRuntime] Erro ao iniciar:', err);
      }
    }

    /**
     * Configurações padrão
     */
    getDefaultSettings() {
      return {
        autoStartOnMessage: true,
        autoCompleteOnMessage: false,
        autoCompleteOnReply: true,
        escalateOverdue: true,
        overdueCheckIntervalMinutes: 5,
      };
    }

    getDefaultAutoRules() {
      return {
        onChatOpen: [],
        onMessageSent: [],
        onMessageReceived: [],
        onStageChange: [],
        onOverdue: [],
      };
    }

    /**
     * Helpers de storage
     */
    storageGet(keys) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(keys, (result) => {
            resolve(result || {});
          });
        } catch (e) {
          console.error('[TasksRuntime] storageGet error', e);
          resolve({});
        }
      });
    }

    storageSet(obj) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.set(obj, () => resolve());
        } catch (e) {
          console.error('[TasksRuntime] storageSet error', e);
          resolve();
        }
      });
    }

    /**
     * Carrega estado
     */
    async loadState() {
      const result = await this.storageGet([
        'quantum_tasks',
        'quantum_task_auto_rules',
        'quantum_task_settings',
      ]);

      this.tasks = result.quantum_tasks || {};
      this.autoRules =
        result.quantum_task_auto_rules || this.getDefaultAutoRules();

      const defaultSettings = this.getDefaultSettings();
      this.settings = Object.assign(
        {},
        defaultSettings,
        result.quantum_task_settings || {},
      );

      // Garante defaults persistidos
      const toPersist = {};
      if (!result.quantum_task_auto_rules) {
        toPersist.quantum_task_auto_rules = this.autoRules;
      }
      if (!result.quantum_task_settings) {
        toPersist.quantum_task_settings = this.settings;
      }
      if (Object.keys(toPersist).length) {
        await this.storageSet(toPersist);
      }
    }

    /**
     * Listeners principais
     */
    setupEventListeners() {
      // Mensagens internas da extensão
      if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(
          (message, sender, sendResponse) => {
            const maybeAsync = this.handleExtensionMessage(
              message,
              sendResponse,
            );
            // Quando retornamos true, indicamos que responderemos assíncronamente
            return maybeAsync === true;
          },
        );
      }

      // Mudanças de storage (ex: popup, dashboard, etc.)
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return;

          if (changes.quantum_tasks) {
            this.tasks = changes.quantum_tasks.newValue || {};
            this.requestMarkerUpdate();
          }

          if (changes.quantum_task_settings) {
            this.settings = Object.assign(
              {},
              this.settings,
              changes.quantum_task_settings.newValue || {},
            );
          }

          if (changes.quantum_task_auto_rules) {
            this.autoRules =
              changes.quantum_task_auto_rules.newValue ||
              this.getDefaultAutoRules();
          }
        });
      }

      // Alarmes (normalmente só funcionam em background, mas deixamos por segurança)
      if (
        chrome.alarms &&
        chrome.alarms.onAlarm &&
        chrome.alarms.onAlarm.addListener
      ) {
        chrome.alarms.onAlarm.addListener((alarm) => {
          if (alarm && typeof alarm.name === 'string') {
            if (alarm.name.startsWith('task_reminder_')) {
              this.handleReminderAlarm(alarm);
            }
          }
        });
      }
    }

    /**
     * Eventos provenientes do inject.js e do CRM Runtime
     */
    setupMessageListeners() {
      window.addEventListener(
        'message',
        (event) => {
          if (event.source !== window || !event.data) return;
          const data = event.data;

          if (data.source === 'QUANTUM_INJECT') {
            this.handleInjectMessage(data);
          } else if (data.source === 'QUANTUM_CRM_RUNTIME') {
            this.handleCrmRuntimeMessage(data);
          }
        },
        false,
      );

      // Eventos customizados disparados pelo inject.js
      document.addEventListener('quantum:chat:opened', (e) => {
        this.handleChatOpened(e.detail || {});
      });

      document.addEventListener('quantum:message:sent', (e) => {
        this.handleMessageSent(e.detail || {});
      });

      document.addEventListener('quantum:message:received', (e) => {
        this.handleMessageReceived(e.detail || {});
      });

      document.addEventListener('quantum:crm:stage_changed', (e) => {
        this.handleStageChange(e.detail || {});
      });
    }

    /**
     * Trata mensagens do inject.js (postMessage)
     */
    handleInjectMessage(data) {
      const payload = data.payload || data.data || {};

      switch (data.type) {
        case 'CHAT_OPENED':
          this.handleChatOpened(payload);
          break;
        case 'MESSAGE_SENT':
          this.handleMessageSent(payload);
          break;
        case 'MESSAGE_RECEIVED':
          this.handleMessageReceived(payload);
          break;
        default:
          break;
      }
    }

    /**
     * Eventos do CRM Runtime (opcional, para integração futura)
     */
    handleCrmRuntimeMessage(data) {
      if (!data || !data.type) return;

      switch (data.type) {
        case 'CRM_STAGE_CHANGED':
          this.handleStageChange(data.data || {});
          break;
        default:
          break;
      }
    }

    /**
     * Handler de mensagens da extensão
     */
    handleExtensionMessage(message, sendResponse) {
      if (!message || !message.type) return false;

      const type = message.type;
      const payload = message.data || {};

      switch (type) {
        case 'GET_ALL_TASKS': {
          sendResponse({
            success: true,
            tasks: this.tasks,
            stats: this.getStats(),
          });
          return false;
        }

        case 'GET_TASKS_BY_CHAT': {
          const chatId = payload.chatId;
          const list = this.getTasksByChat(chatId);
          sendResponse({ success: true, tasks: list });
          return false;
        }

        case 'GET_PENDING_TASKS_BY_CHAT': {
          const chatId = payload.chatId;
          const list = this.getPendingTasksByChat(chatId);
          sendResponse({ success: true, tasks: list });
          return false;
        }

        case 'GET_HIGHEST_PRIORITY_TASK': {
          const chatId = payload.chatId;
          const task = this.getHighestPriorityTask(chatId);
          sendResponse({ success: true, task });
          return false;
        }

        case 'CREATE_TASK': {
          this.createTask(payload)
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({ success: false, error: err?.message }),
            );
          return true;
        }

        case 'UPDATE_TASK': {
          this.updateTask(payload.id, payload.updates || {})
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({ success: false, error: err?.message }),
            );
          return true;
        }

        case 'DELETE_TASK': {
          this.deleteTask(payload.id)
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({ success: false, error: err?.message }),
            );
          return true;
        }

        case 'START_TASK': {
          this.startTask(payload.id, payload.options || {})
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({ success: false, error: err?.message }),
            );
          return true;
        }

        case 'COMPLETE_TASK': {
          this.completeTask(payload.id, payload.options || {})
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({ success: false, error: err?.message }),
            );
          return true;
        }

        case 'UPDATE_TASK_STATUS': {
          this.updateTaskStatus(payload.id, payload.status, payload.options || {})
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({ success: false, error: err?.message }),
            );
          return true;
        }

        case 'UPDATE_TASK_PRIORITY': {
          this.updateTaskPriority(
            payload.id,
            payload.priority,
            payload.options || {},
          )
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({ success: false, error: err?.message }),
            );
          return true;
        }

        case 'GET_TASK_SETTINGS': {
          sendResponse({ success: true, settings: this.settings });
          return false;
        }

        case 'UPDATE_TASK_SETTINGS': {
          this.updateSettings(payload.settings || {})
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({ success: false, error: err?.message }),
            );
          return true;
        }

        case 'GET_TASKS_STATS': {
          sendResponse({ success: true, stats: this.getStats() });
          return false;
        }

        case 'GET_AUTO_RULES': {
          sendResponse({ success: true, rules: this.autoRules });
          return false;
        }

        case 'UPDATE_AUTO_RULES': {
          this.updateAutoRules(payload.rules || {})
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({ success: false, error: err?.message }),
            );
          return true;
        }

        default:
          return false;
      }
    }

    /**
     * Atualiza configurações
     */
    async updateSettings(partial) {
      this.settings = Object.assign({}, this.settings, partial || {});
      await this.storageSet({ quantum_task_settings: this.settings });
      this.broadcast('TASK_SETTINGS_UPDATED', { settings: this.settings });
      return { success: true, settings: this.settings };
    }

    /**
     * Atualiza regras automáticas
     */
    async updateAutoRules(rules) {
      this.autoRules = Object.assign({}, this.autoRules, rules || {});
      await this.storageSet({ quantum_task_auto_rules: this.autoRules });
      this.broadcast('TASK_RULES_UPDATED', { rules: this.autoRules });
      return { success: true, rules: this.autoRules };
    }

    /**
     * Eventos do WhatsApp
     */
    handleChatOpened(info) {
      const chatId =
        info.chatId ||
        info.id ||
        info.chat?.id?._serialized ||
        info.chat?.id ||
        info.chatId?._serialized;

      if (!chatId) return;

      this.currentChatId = chatId;
      this.currentContactName =
        info.contactName ||
        info.chat?.formattedTitle ||
        info.chat?.name ||
        info.name ||
        '';

      this.requestMarkerUpdate();

      // Automação simples: notifica se tiver tarefas pendentes
      const pending = this.getPendingTasksByChat(chatId);
      if (pending && pending.length) {
        this.broadcast('TASKS_SUMMARY_FOR_CHAT', {
          chatId,
          pendingCount: pending.length,
        });
      }

      this.executeAutoRules('onChatOpen', {
        chatId,
        contactName: this.currentContactName,
        info,
      });
    }

    handleMessageSent(info) {
      const chatId =
        info.chatId ||
        info.chat?.id?._serialized ||
        info.chat?.id ||
        this.currentChatId;
      if (!chatId) return;

      // Auto-start: quando enviar mensagem e houver tarefa pendente
      if (this.settings.autoStartOnMessage) {
        const pending = this.getPendingTasksByChat(chatId);
        if (pending.length) {
          const top = pending[0];
          if (top.status === TaskSchema.Status.PENDING) {
            this.startTask(top.id, { reason: 'auto_start_on_message' });
          }
        }
      }

      // Auto-complete simples: se só houver uma em andamento
      if (this.settings.autoCompleteOnMessage) {
        const tasks = this.getTasksByChat(chatId);
        const inProgress = tasks.filter(
          (t) => t.status === TaskSchema.Status.IN_PROGRESS,
        );
        if (inProgress.length === 1) {
          this.completeTask(inProgress[0].id, {
            reason: 'auto_complete_on_message',
          });
        }
      }

      this.executeAutoRules('onMessageSent', { chatId, info });
    }

    handleMessageReceived(info) {
      const chatId =
        info.chatId ||
        info.chat?.id?._serialized ||
        info.chat?.id ||
        this.currentChatId;
      if (!chatId) return;

      this.executeAutoRules('onMessageReceived', { chatId, info });
    }

    handleStageChange(info) {
      const chatId = info.chatId || this.currentChatId;
      if (!chatId) return;

      this.executeAutoRules('onStageChange', {
        chatId,
        stage: info.stage,
        info,
      });
    }

    /**
     * Executa regras automáticas
     * (estrutura flexível para uso futuro)
     */
    executeAutoRules(triggerKey, context) {
      const rulesGroup = this.autoRules?.[triggerKey];
      if (!Array.isArray(rulesGroup) || !rulesGroup.length) return;

      for (const rule of rulesGroup) {
        if (!rule || rule.enabled === false) continue;
        const action = rule.action;
        const cfg = rule.config || {};

        switch (action) {
          case TaskSchema.AutoActions.START_TASK:
            if (context.chatId) {
              const highest = this.getHighestPriorityTask(context.chatId);
              if (highest && highest.status === TaskSchema.Status.PENDING) {
                this.startTask(highest.id, { reason: 'auto_rule', ruleId: rule.id });
              }
            }
            break;

          case TaskSchema.AutoActions.COMPLETE_TASK:
            if (context.chatId) {
              const tasks = this.getTasksByChat(context.chatId);
              const inProgress = tasks.filter(
                (t) => t.status === TaskSchema.Status.IN_PROGRESS,
              );
              if (inProgress.length === 1) {
                this.completeTask(inProgress[0].id, {
                  reason: 'auto_rule',
                  ruleId: rule.id,
                });
              }
            }
            break;

          case TaskSchema.AutoActions.ESCALATE_PRIORITY:
            if (context.chatId) {
              const pending = this.getPendingTasksByChat(context.chatId);
              if (pending.length) {
                this.escalatePriority(pending[0].id, {
                  reason: 'auto_rule',
                  ruleId: rule.id,
                });
              }
            }
            break;

          case TaskSchema.AutoActions.SEND_NOTIFICATION:
            if (cfg.message) {
              this.sendNotification(cfg.title || 'Tasks', {
                body: cfg.message,
              });
            }
            break;

          // Outras ações podem ser implementadas no futuro
          default:
            break;
        }
      }
    }

    /**
     * Checagem de tarefas atrasadas
     */
    startOverdueCheck() {
      const minutes =
        this.settings.overdueCheckIntervalMinutes &&
        this.settings.overdueCheckIntervalMinutes > 0
          ? this.settings.overdueCheckIntervalMinutes
          : 5;

      if (this.overdueCheckIntervalId) {
        clearInterval(this.overdueCheckIntervalId);
      }

      this.checkOverdueTasks();

      this.overdueCheckIntervalId = setInterval(() => {
        this.checkOverdueTasks();
      }, minutes * 60 * 1000);
    }

    checkOverdueTasks() {
      const now = new Date();

      Object.values(this.tasks).forEach((task) => {
        if (!task || !task.dueDate) return;
        if (
          task.status === TaskSchema.Status.COMPLETED ||
          task.status === TaskSchema.Status.CANCELLED
        ) {
          return;
        }

        const isOverdue = TaskSchema.isOverdue(task);
        if (isOverdue && !task._overdueHandled) {
          task._overdueHandled = true;
          task.updatedAt = now.toISOString();
          this.broadcast('TASK_OVERDUE', { task });

          if (this.settings.escalateOverdue) {
            this.escalatePriority(task.id, {
              reason: 'overdue_escalation',
            });
          }
        }
      });

      // persiste flag _overdueHandled se tivermos mudado algo
      this.storageSet({ quantum_tasks: this.tasks });
    }

    handleReminderAlarm(alarm) {
      if (!alarm || !alarm.name) return;
      if (!alarm.name.startsWith('task_reminder_')) return;

      const parts = alarm.name.split('_');
      const taskId = parts[2]; // task_reminder_<taskId>_<reminderId>
      const tasks = this.tasks || {};
      const task = tasks[taskId];
      if (!task) return;

      this.sendNotification('Lembrete de tarefa', {
        body: task.title || 'Você tem uma tarefa pendente',
      });

      this.broadcast('TASK_REMINDER', { taskId, task });
    }

    /**
     * CRUD de tarefas (armazenadas em this.tasks + chrome.storage.local)
     */
    async saveTasks() {
      await this.storageSet({ quantum_tasks: this.tasks });
      this.requestMarkerUpdate();
    }

    async createTask(data) {
      const task = TaskSchema.createTask({
        ...data,
        chatId: data.chatId || this.currentChatId,
        contactName: data.contactName || this.currentContactName,
      });

      const validation = TaskSchema.validateTask(task);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join('; '),
        };
      }

      task.history = task.history || [];
      task.history.push(
        TaskSchema.createHistoryEntry('created', {
          userId: data.createdBy || null,
        }),
      );

      this.tasks[task.id] = task;
      await this.saveTasks();

      this.broadcast('TASK_CREATED', { taskId: task.id, task });

      // Lembretes (se TaskActions existir, delega para ele)
      if (typeof TaskActions !== 'undefined') {
        try {
          TaskActions.scheduleReminders(task);
        } catch (e) {
          // ignora
        }
      }

      return { success: true, task };
    }

    async updateTask(taskId, updates) {
      const task = this.tasks[taskId];
      if (!task) {
        return { success: false, error: 'Tarefa não encontrada' };
      }

      const previous = { ...task };
      Object.assign(task, updates || {});
      task.updatedAt = new Date().toISOString();

      task.history = task.history || [];
      task.history.push(
        TaskSchema.createHistoryEntry('updated', {
          previousValue: previous,
          newValue: task,
        }),
      );

      this.tasks[taskId] = task;
      await this.saveTasks();

      this.broadcast('TASK_UPDATED', { taskId, task });
      return { success: true, task };
    }

    async deleteTask(taskId) {
      if (!this.tasks[taskId]) {
        return { success: false, error: 'Tarefa não encontrada' };
      }

      delete this.tasks[taskId];
      await this.saveTasks();

      this.broadcast('TASK_DELETED', { taskId });
      return { success: true };
    }

    async startTask(taskId, options = {}) {
      const task = this.tasks[taskId];
      if (!task) {
        return { success: false, error: 'Tarefa não encontrada' };
      }

      if (task.status === TaskSchema.Status.COMPLETED) {
        return { success: false, error: 'Tarefa já concluída' };
      }

      const previousStatus = task.status;
      task.status = TaskSchema.Status.IN_PROGRESS;
      task.startedAt = task.startedAt || new Date().toISOString();
      task.updatedAt = new Date().toISOString();

      task.history = task.history || [];
      task.history.push(
        TaskSchema.createHistoryEntry('started', {
          previousValue: previousStatus,
          newValue: task.status,
          userId: options.userId || null,
          note: options.note || 'Tarefa iniciada',
        }),
      );

      this.tasks[taskId] = task;
      await this.saveTasks();
      this.broadcast('TASK_STARTED', { taskId, task });

      return { success: true, task };
    }

    async completeTask(taskId, options = {}) {
      const task = this.tasks[taskId];
      if (!task) {
        return { success: false, error: 'Tarefa não encontrada' };
      }

      const previousStatus = task.status;
      task.status = TaskSchema.Status.COMPLETED;
      task.completedAt = new Date().toISOString();
      task.updatedAt = new Date().toISOString();

      task.history = task.history || [];
      task.history.push(
        TaskSchema.createHistoryEntry('completed', {
          previousValue: previousStatus,
          newValue: task.status,
          userId: options.userId || null,
          note: options.note || 'Tarefa concluída',
        }),
      );

      this.tasks[taskId] = task;
      await this.saveTasks();
      this.broadcast('TASK_COMPLETED', { taskId, task });

      // Tarefa recorrente
      if (task.recurring && task.recurrencePattern) {
        const nextDue = TaskSchema.getNextRecurrence(task);
        if (nextDue) {
          const newTask = TaskSchema.createTask({
            ...task,
            id: TaskSchema.generateId(),
            status: TaskSchema.Status.PENDING,
            dueDate: nextDue,
            startedAt: null,
            completedAt: null,
            history: [],
            createdAt: new Date().toISOString(),
          });
          this.tasks[newTask.id] = newTask;
          await this.saveTasks();
          this.broadcast('TASK_CREATED', {
            taskId: newTask.id,
            task: newTask,
          });
        }
      }

      return { success: true, task };
    }

    async updateTaskStatus(taskId, newStatus, options = {}) {
      const task = this.tasks[taskId];
      if (!task) {
        return { success: false, error: 'Tarefa não encontrada' };
      }

      const previousStatus = task.status;
      task.status = newStatus;
      task.updatedAt = new Date().toISOString();

      if (newStatus === TaskSchema.Status.IN_PROGRESS && !task.startedAt) {
        task.startedAt = new Date().toISOString();
      }
      if (newStatus === TaskSchema.Status.COMPLETED && !task.completedAt) {
        task.completedAt = new Date().toISOString();
      }

      task.history = task.history || [];
      task.history.push(
        TaskSchema.createHistoryEntry('status_changed', {
          previousValue: previousStatus,
          newValue: newStatus,
          userId: options.userId || null,
          note: options.note || null,
        }),
      );

      this.tasks[taskId] = task;
      await this.saveTasks();
      this.broadcast('TASK_STATUS_CHANGED', { taskId, task });

      return { success: true, task };
    }

    async updateTaskPriority(taskId, newPriority, options = {}) {
      const task = this.tasks[taskId];
      if (!task) {
        return { success: false, error: 'Tarefa não encontrada' };
      }

      const previousPriority = task.priority;
      task.priority = newPriority;
      task.updatedAt = new Date().toISOString();

      task.history = task.history || [];
      task.history.push(
        TaskSchema.createHistoryEntry('priority_changed', {
          previousValue: previousPriority,
          newValue: newPriority,
          userId: options.userId || null,
          note: options.note || null,
        }),
      );

      this.tasks[taskId] = task;
      await this.saveTasks();
      this.broadcast('TASK_PRIORITY_CHANGED', { taskId, task });

      return { success: true, task };
    }

    async escalatePriority(taskId, options = {}) {
      const task = this.tasks[taskId];
      if (!task) {
        return { success: false, error: 'Tarefa não encontrada' };
      }

      const order = ['low', 'medium', 'high', 'urgent'];
      const idx = order.indexOf(task.priority);
      if (idx < 0 || idx >= order.length - 1) {
        return {
          success: false,
          error: 'Já está na prioridade máxima',
        };
      }

      const newPriority = order[idx + 1];
      return this.updateTaskPriority(taskId, newPriority, {
        ...options,
        note: options.note || 'Escalonada automaticamente por atraso',
      });
    }

    /**
     * Utilitários de consulta
     */
    getTasksByChat(chatId) {
      if (!chatId) return [];
      const list = Object.values(this.tasks || {}).filter(
        (t) => t.chatId === chatId,
      );
      return TaskSchema.sortTasks(list);
    }

    getPendingTasksByChat(chatId) {
      const list = this.getTasksByChat(chatId);
      return list.filter(
        (t) =>
          t.status === TaskSchema.Status.PENDING ||
          t.status === TaskSchema.Status.IN_PROGRESS,
      );
    }

    getHighestPriorityTask(chatId) {
      const list = this.getPendingTasksByChat(chatId);
      return list.length ? list[0] : null;
    }

    getStats() {
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

        if (TaskSchema.isOverdue(t)) {
          stats.overdue += 1;
        } else if (TaskSchema.isDueToday(t)) {
          stats.dueToday += 1;
        }
      }

      return stats;
    }

    /**
     * Notificações para outros scripts
     */
    broadcast(type, data = {}) {
      // postMessage para content scripts (painel, marcadores)
      try {
        if (typeof window !== 'undefined') {
          window.postMessage(
            {
              source: 'QUANTUM_TASKS_RUNTIME',
              type,
              data,
            },
            '*',
          );
        }
      } catch (e) {
        // ignore
      }

      // Mensagem para outros contextos da extensão
      try {
        if (chrome.runtime && chrome.runtime.sendMessage) {
          const message = { type, data };
          const result = chrome.runtime.sendMessage(message, () => {
            const err = chrome.runtime.lastError;
            if (err) {
              // apenas log em debug
              // console.debug('[TasksRuntime] sendMessage error:', err.message);
            }
          });
          if (result && typeof result.then === 'function') {
            result.catch(() => {});
          }
        }
      } catch (e) {
        // ignore
      }

      // Eventos customizados no DOM (para quem quiser ouvir)
      try {
        const eventName = String(type || '').toLowerCase();
        document.dispatchEvent(
          new CustomEvent(`quantum:tasks:${eventName}`, {
            detail: data,
          }),
        );
      } catch (e) {
        // ignore
      }
    }

    requestMarkerUpdate() {
      this.broadcast('TASKS_UPDATE_MARKERS', {
        tasks: this.tasks,
        currentChatId: this.currentChatId,
      });
    }

    sendNotification(title, options) {
      if (!chrome.notifications) return;
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: (options && options.iconUrl) || 'icons/icon128.png',
          title,
          message: (options && options.body) || '',
          priority: (options && options.priority) || 1,
        });
      } catch (e) {
        // ignore
      }
    }
  }

  // Expõe globalmente
  const runtime = new TasksRuntime();
  window.__QUANTUM_TASKS_RUNTIME__ = runtime;

  // Inicia
  runtime.init();
})();
