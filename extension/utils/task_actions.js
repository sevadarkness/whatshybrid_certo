/**
 * task_actions.js
 * Ações executáveis do sistema de Tasks
 */

const TaskActions = {
  /**
   * Inicia uma tarefa
   */
  async startTask(taskId, options = {}) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        const task = tasks[taskId];

        if (!task) {
          resolve({ success: false, error: 'Tarefa não encontrada' });
          return;
        }

        if (task.status === TaskSchema.Status.COMPLETED) {
          resolve({ success: false, error: 'Tarefa já concluída' });
          return;
        }

        const previousStatus = task.status;
        task.status = TaskSchema.Status.IN_PROGRESS;
        task.startedAt = new Date().toISOString();
        task.updatedAt = new Date().toISOString();

        task.history = task.history || [];
        task.history.push(
          TaskSchema.createHistoryEntry('started', {
            previousValue: previousStatus,
            newValue: task.status,
            userId: options.userId,
            note: options.note || 'Tarefa iniciada',
          }),
        );

        chrome.storage.local.set({ quantum_tasks: tasks }, () => {
          TaskActions.broadcastTaskUpdate(taskId, task, 'TASK_STARTED');
          resolve({ success: true, task });
        });
      });
    });
  },

  /**
   * Completa uma tarefa
   */
  async completeTask(taskId, options = {}) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], async (result) => {
        const tasks = result.quantum_tasks || {};
        const task = tasks[taskId];

        if (!task) {
          resolve({ success: false, error: 'Tarefa não encontrada' });
          return;
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
            userId: options.userId,
            note: options.note || 'Tarefa concluída',
          }),
        );

        chrome.storage.local.set({ quantum_tasks: tasks }, async () => {
          TaskActions.broadcastTaskUpdate(taskId, task, 'TASK_COMPLETED');

          // Tarefa recorrente
          if (task.recurring && task.recurrencePattern) {
            await TaskActions.createRecurringTask(task);
          }

          // Notificação
          if (task.notifyOnComplete !== false) {
            TaskActions.sendNotification('Tarefa Concluída', {
              body: task.title,
              iconUrl: 'icons/icon128.png',
            });
          }

          resolve({ success: true, task });
        });
      });
    });
  },

  /**
   * Atualiza status
   */
  async updateTaskStatus(taskId, newStatus, options = {}) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        const task = tasks[taskId];

        if (!task) {
          resolve({ success: false, error: 'Tarefa não encontrada' });
          return;
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
            userId: options.userId,
            note: options.note,
          }),
        );

        chrome.storage.local.set({ quantum_tasks: tasks }, () => {
          TaskActions.broadcastTaskUpdate(
            taskId,
            task,
            'TASK_STATUS_CHANGED',
          );
          resolve({ success: true, task });
        });
      });
    });
  },

  /**
   * Atualiza prioridade
   */
  async updateTaskPriority(taskId, newPriority, options = {}) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        const task = tasks[taskId];

        if (!task) {
          resolve({ success: false, error: 'Tarefa não encontrada' });
          return;
        }

        const previousPriority = task.priority;
        task.priority = newPriority;
        task.updatedAt = new Date().toISOString();

        task.history = task.history || [];
        task.history.push(
          TaskSchema.createHistoryEntry('priority_changed', {
            previousValue: previousPriority,
            newValue: newPriority,
            userId: options.userId,
            note: options.note,
          }),
        );

        chrome.storage.local.set({ quantum_tasks: tasks }, () => {
          TaskActions.broadcastTaskUpdate(
            taskId,
            task,
            'TASK_PRIORITY_CHANGED',
          );
          resolve({ success: true, task });
        });
      });
    });
  },

  /**
   * Escalona prioridade
   */
  async escalatePriority(taskId, options = {}) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        const task = tasks[taskId];

        if (!task) {
          resolve({ success: false, error: 'Tarefa não encontrada' });
          return;
        }

        const order = ['low', 'medium', 'high', 'urgent'];
        const currentIndex = order.indexOf(task.priority);
        if (currentIndex < 0 || currentIndex >= order.length - 1) {
          resolve({ success: false, error: 'Já está na prioridade máxima' });
          return;
        }

        const newPriority = order[currentIndex + 1];
        TaskActions.updateTaskPriority(taskId, newPriority, {
          ...options,
          note: options.note || 'Prioridade escalonada automaticamente',
        }).then(resolve);
      });
    });
  },

  /**
   * Adia tarefa
   */
  async snoozeTask(taskId, duration, options = {}) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        const task = tasks[taskId];

        if (!task) {
          resolve({ success: false, error: 'Tarefa não encontrada' });
          return;
        }

        const now = new Date();
        const newDue = new Date(now);

        switch (duration.unit) {
          case 'minutes':
            newDue.setMinutes(now.getMinutes() + duration.value);
            break;
          case 'hours':
            newDue.setHours(now.getHours() + duration.value);
            break;
          case 'days':
          default:
            newDue.setDate(now.getDate() + duration.value);
            break;
        }

        const previousDue = task.dueDate;
        task.dueDate = newDue.toISOString().split('T')[0];
        task.dueTime = newDue.toTimeString().slice(0, 5);
        task.status = TaskSchema.Status.PENDING;
        task.updatedAt = new Date().toISOString();

        task.history = task.history || [];
        task.history.push(
          TaskSchema.createHistoryEntry('snoozed', {
            previousValue: previousDue,
            newValue: task.dueDate,
            userId: options.userId,
            note: `Adiada por ${duration.value} ${duration.unit}`,
          }),
        );

        chrome.storage.local.set({ quantum_tasks: tasks }, () => {
          TaskActions.broadcastTaskUpdate(taskId, task, 'TASK_SNOOZED');
          resolve({ success: true, task });
        });
      });
    });
  },

  /**
   * Reatribui tarefa
   */
  async reassignTask(taskId, newAssignee, options = {}) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        const task = tasks[taskId];

        if (!task) {
          resolve({ success: false, error: 'Tarefa não encontrada' });
          return;
        }

        const previousAssignee = task.assignedTo;
        task.assignedTo = newAssignee;
        task.updatedAt = new Date().toISOString();

        task.history = task.history || [];
        task.history.push(
          TaskSchema.createHistoryEntry('reassigned', {
            previousValue: previousAssignee,
            newValue: newAssignee,
            userId: options.userId,
            note: options.note,
          }),
        );

        chrome.storage.local.set({ quantum_tasks: tasks }, () => {
          TaskActions.broadcastTaskUpdate(taskId, task, 'TASK_REASSIGNED');
          resolve({ success: true, task });
        });
      });
    });
  },

  /**
   * Cria tarefa de follow-up
   */
  async createFollowUpTask(originalTask, options = {}) {
    const followUp = TaskSchema.createTask({
      chatId: originalTask.chatId,
      contactName: originalTask.contactName,
      title: options.title || `Follow-up: ${originalTask.title}`,
      description:
        options.description ||
        `Continuação da tarefa: ${originalTask.title}`,
      type: TaskSchema.TaskType.FOLLOW_UP,
      priority: options.priority || originalTask.priority,
      assignedTo: options.assignedTo || originalTask.assignedTo,
      dueDate: options.dueDate || TaskActions.calculateDefaultDueDate(1),
      parentTaskId: originalTask.id,
      autoComplete: true,
      autoStart: true,
    });

    return TaskActions.createTask(followUp);
  },

  /**
   * Cria tarefa recorrente
   */
  async createRecurringTask(originalTask) {
    const nextDue = TaskSchema.getNextRecurrence(originalTask);
    if (!nextDue) return null;

    const newTask = TaskSchema.createTask({
      ...originalTask,
      id: TaskSchema.generateId(),
      status: TaskSchema.Status.PENDING,
      dueDate: nextDue,
      startedAt: null,
      completedAt: null,
      history: [],
      createdAt: new Date().toISOString(),
    });

    return TaskActions.createTask(newTask);
  },

  /**
   * Cria nova tarefa
   */
  async createTask(taskData) {
    return new Promise((resolve) => {
      const task = TaskSchema.createTask(taskData);

      task.history = task.history || [];
      task.history.push(
        TaskSchema.createHistoryEntry('created', {
          userId: taskData.createdBy,
        }),
      );

      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        tasks[task.id] = task;

        chrome.storage.local.set({ quantum_tasks: tasks }, () => {
          TaskActions.broadcastTaskUpdate(task.id, task, 'TASK_CREATED');

          if (task.reminders && task.reminders.length > 0 && task.dueDate) {
            TaskActions.scheduleReminders(task);
          }

          resolve({ success: true, task });
        });
      });
    });
  },

  /**
   * Deleta tarefa
   */
  async deleteTask(taskId) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        if (!tasks[taskId]) {
          resolve({ success: false, error: 'Tarefa não encontrada' });
          return;
        }

        delete tasks[taskId];

        chrome.storage.local.set({ quantum_tasks: tasks }, () => {
          TaskActions.broadcastTaskUpdate(taskId, null, 'TASK_DELETED');
          resolve({ success: true });
        });
      });
    });
  },

  /**
   * Busca tarefas por chat
   */
  async getTasksByChat(chatId) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        const list = Object.values(tasks).filter((t) => t.chatId === chatId);
        resolve(TaskSchema.sortTasks(list));
      });
    });
  },

  /**
   * Busca tarefas pendentes por chat
   */
  async getPendingTasksByChat(chatId) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['quantum_tasks'], (result) => {
        const tasks = result.quantum_tasks || {};
        const list = Object.values(tasks).filter(
          (t) =>
            t.chatId === chatId &&
            (t.status === TaskSchema.Status.PENDING ||
              t.status === TaskSchema.Status.IN_PROGRESS),
        );
        resolve(TaskSchema.sortTasks(list));
      });
    });
  },

  /**
   * Tarefa mais prioritária de um chat
   */
  async getHighestPriorityTask(chatId) {
    const tasks = await TaskActions.getPendingTasksByChat(chatId);
    return tasks.length ? tasks[0] : null;
  },

  /**
   * Agenda lembretes
   */
  scheduleReminders(task) {
    if (!task.dueDate || !task.reminders || !task.reminders.length) return;
    if (!chrome.alarms || !chrome.alarms.create) return;

    const due = new Date(task.dueDate);
    if (task.dueTime) {
      const [h, m] = task.dueTime.split(':');
      due.setHours(parseInt(h, 10), parseInt(m, 10) || 0, 0, 0);
    }

    for (const reminder of task.reminders) {
      const reminderTime = new Date(due);
      if (reminder.type === 'before') {
        switch (reminder.unit) {
          case 'minutes':
            reminderTime.setMinutes(reminderTime.getMinutes() - reminder.value);
            break;
          case 'hours':
            reminderTime.setHours(reminderTime.getHours() - reminder.value);
            break;
          case 'days':
            reminderTime.setDate(reminderTime.getDate() - reminder.value);
            break;
          default:
            break;
        }
      }

      if (reminderTime > new Date()) {
        chrome.alarms.create(
          `task_reminder_${task.id}_${reminder.id}`,
          { when: reminderTime.getTime() },
        );
      }
    }
  },

  /**
   * Envia notificação
   */
  sendNotification(title, options = {}) {
    if (!chrome.notifications) return;

    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: options.iconUrl || 'icons/icon128.png',
        title,
        message: options.body || '',
        priority: options.priority || 1,
      });
    } catch (e) {
      // Ignora erros silenciosamente
    }
  },

  /**
   * Data de vencimento padrão
   */
  calculateDefaultDueDate(daysFromNow = 1) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split('T')[0];
  },

  /**
   * Broadcast de atualização de tarefa
   */
  broadcastTaskUpdate(taskId, task, eventType) {
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        const message = {
          type: eventType,
          data: { taskId, task },
        };
        // Em MV3, sendMessage pode retornar promise
        const result = chrome.runtime.sendMessage(message, () => {
          const err = chrome.runtime.lastError;
          if (err) {
            // Apenas log
            console.debug('[TaskActions] sendMessage error:', err.message);
          }
        });
        if (result && typeof result.then === 'function') {
          result.catch(() => {});
        }
      }
    } catch (e) {
      // ignore
    }

    if (typeof window !== 'undefined') {
      window.postMessage(
        {
          source: 'QUANTUM_TASKS',
          type: eventType,
          data: { taskId, task },
        },
        '*',
      );
    }
  },
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaskActions;
}
if (typeof window !== 'undefined') {
  window.TaskActions = TaskActions;
}
