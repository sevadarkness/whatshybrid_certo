/**
 * task_schema.js
 * Schema e configurações do sistema de Tasks
 */

const TaskSchema = {
  /**
   * Status das tarefas
   */
  Status: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    ON_HOLD: 'on_hold',
  },

  /**
   * Prioridades
   */
  Priority: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent',
  },

  /**
   * Tipos de tarefa
   */
  TaskType: {
    FOLLOW_UP: 'follow_up',
    CALL: 'call',
    MESSAGE: 'message',
    MEETING: 'meeting',
    REMINDER: 'reminder',
    CUSTOM: 'custom',
  },

  /**
   * Configurações visuais de status
   */
  StatusConfig: {
    pending: {
      id: 'pending',
      name: 'Pendente',
      icon: '⏳',
      color: '#F59E0B',
      bgColor: 'rgba(245, 158, 11, 0.15)',
    },
    in_progress: {
      id: 'in_progress',
      name: 'Em Andamento',
      icon: '🔄',
      color: '#3B82F6',
      bgColor: 'rgba(59, 130, 246, 0.15)',
    },
    completed: {
      id: 'completed',
      name: 'Concluída',
      icon: '✅',
      color: '#10B981',
      bgColor: 'rgba(16, 185, 129, 0.15)',
    },
    cancelled: {
      id: 'cancelled',
      name: 'Cancelada',
      icon: '❌',
      color: '#EF4444',
      bgColor: 'rgba(239, 68, 68, 0.15)',
    },
    on_hold: {
      id: 'on_hold',
      name: 'Em Espera',
      icon: '⏸️',
      color: '#6B7280',
      bgColor: 'rgba(107, 114, 128, 0.15)',
    },
  },

  /**
   * Configurações visuais de prioridade
   */
  PriorityConfig: {
    low: {
      id: 'low',
      name: 'Baixa',
      icon: '🟢',
      color: '#10B981',
      weight: 1,
    },
    medium: {
      id: 'medium',
      name: 'Média',
      icon: '🟡',
      color: '#F59E0B',
      weight: 2,
    },
    high: {
      id: 'high',
      name: 'Alta',
      icon: '🟠',
      color: '#F97316',
      weight: 3,
    },
    urgent: {
      id: 'urgent',
      name: 'Urgente',
      icon: '🔴',
      color: '#EF4444',
      weight: 4,
      pulse: true,
    },
  },

  /**
   * Configurações de tipos de tarefa
   */
  TaskTypeConfig: {
    follow_up: {
      id: 'follow_up',
      name: 'Follow-up',
      icon: '📞',
      defaultPriority: 'medium',
    },
    call: {
      id: 'call',
      name: 'Ligação',
      icon: '☎️',
      defaultPriority: 'high',
    },
    message: {
      id: 'message',
      name: 'Mensagem',
      icon: '💬',
      defaultPriority: 'medium',
    },
    meeting: {
      id: 'meeting',
      name: 'Reunião',
      icon: '📅',
      defaultPriority: 'high',
    },
    reminder: {
      id: 'reminder',
      name: 'Lembrete',
      icon: '🔔',
      defaultPriority: 'low',
    },
    custom: {
      id: 'custom',
      name: 'Personalizada',
      icon: '📝',
      defaultPriority: 'medium',
    },
  },

  /**
   * Triggers automáticos
   */
  AutoTriggers: {
    ON_CHAT_OPEN: 'on_chat_open',
    ON_MESSAGE_SENT: 'on_message_sent',
    ON_MESSAGE_RECEIVED: 'on_message_received',
    ON_REPLY: 'on_reply',
    ON_STAGE_CHANGE: 'on_stage_change',
    ON_DUE_DATE: 'on_due_date',
    ON_OVERDUE: 'on_overdue',
  },

  /**
   * Ações automáticas
   */
  AutoActions: {
    START_TASK: 'start_task',
    COMPLETE_TASK: 'complete_task',
    SNOOZE_TASK: 'snooze_task',
    ESCALATE_PRIORITY: 'escalate_priority',
    REASSIGN_TASK: 'reassign_task',
    CREATE_FOLLOW_UP: 'create_follow_up',
    SEND_NOTIFICATION: 'send_notification',
  },

  /**
   * Cria uma nova tarefa
   */
  createTask(data = {}) {
    const now = new Date().toISOString();

    return {
      id: data.id || this.generateId(),
      chatId: data.chatId || null,
      contactName: data.contactName || '',

      // Conteúdo
      title: data.title || '',
      description: data.description || '',
      type: data.type || this.TaskType.CUSTOM,

      // Status e prioridade
      status: data.status || this.Status.PENDING,
      priority: data.priority || this.Priority.MEDIUM,

      // Atribuição
      assignedTo: data.assignedTo || null,
      assignedBy: data.assignedBy || null,
      teamId: data.teamId || null,

      // Datas
      dueDate: data.dueDate || null,
      dueTime: data.dueTime || null,
      startedAt: data.startedAt || null,
      completedAt: data.completedAt || null,

      // Automação
      autoComplete: data.autoComplete !== undefined ? data.autoComplete : true,
      autoStart: data.autoStart !== undefined ? data.autoStart : true,
      autoTriggers: data.autoTriggers || [],

      // Recorrência
      recurring: data.recurring || false,
      recurrencePattern: data.recurrencePattern || null,
      recurrenceInterval: data.recurrenceInterval || 1,

      // Metadados
      tags: data.tags || [],
      notes: data.notes || [],
      attachments: data.attachments || [],

      // Relacionamentos
      parentTaskId: data.parentTaskId || null,
      subtasks: data.subtasks || [],
      relatedMessageId: data.relatedMessageId || null,

      // Notificações
      reminders: data.reminders || [],
      notifyOnComplete: data.notifyOnComplete !== undefined ? data.notifyOnComplete : true,

      // Timestamps
      createdAt: data.createdAt || now,
      updatedAt: now,

      // Histórico
      history: data.history || [],
    };
  },

  /**
   * Entrada de histórico
   */
  createHistoryEntry(action, data = {}) {
    return {
      id: this.generateId(),
      action,
      timestamp: new Date().toISOString(),
      userId: data.userId || null,
      previousValue: data.previousValue || null,
      newValue: data.newValue || null,
      note: data.note || null,
    };
  },

  /**
   * Cria um lembrete
   */
  createReminder(config = {}) {
    return {
      id: this.generateId(),
      type: config.type || 'before', // before, after, at
      value: config.value || 30,
      unit: config.unit || 'minutes', // minutes, hours, days
      sent: false,
      sentAt: null,
    };
  },

  /**
   * Cria regra de automação
   */
  createAutoRule(trigger, action, config = {}) {
    return {
      id: this.generateId(),
      trigger,
      action,
      enabled: true,
      config,
      createdAt: new Date().toISOString(),
    };
  },

  /**
   * Gera ID único
   */
  generateId() {
    return (
      'task_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).substr(2, 9)
    );
  },

  /**
   * Valida tarefa
   */
  validateTask(task) {
    const errors = [];

    if (!task.title || task.title.trim() === '') {
      errors.push('Título é obrigatório');
    }

    try {
      if (task.dueDate && task.status === this.Status.PENDING) {
        const dueDate = new Date(task.dueDate);
        const now = new Date();
        if (dueDate.toString() === 'Invalid Date') {
          errors.push('Data de vencimento inválida');
        } else if (dueDate < now) {
          errors.push('Data de vencimento está no passado');
        }
      }
    } catch (e) {
      errors.push('Data de vencimento inválida');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Verifica se tarefa está atrasada
   */
  isOverdue(task) {
    if (!task || !task.dueDate) return false;
    if (
      task.status === this.Status.COMPLETED ||
      task.status === this.Status.CANCELLED
    ) {
      return false;
    }

    const dueDate = new Date(task.dueDate);
    if (task.dueTime) {
      const [hours, minutes] = task.dueTime.split(':');
      dueDate.setHours(parseInt(hours, 10), parseInt(minutes, 10) || 0, 0, 0);
    } else {
      dueDate.setHours(23, 59, 59, 999);
    }

    return new Date() > dueDate;
  },

  /**
   * Verifica se vence hoje
   */
  isDueToday(task) {
    if (!task || !task.dueDate) return false;
    const today = new Date();
    const due = new Date(task.dueDate);

    return today.toDateString() === due.toDateString();
  },

  /**
   * Próxima recorrência
   */
  getNextRecurrence(task) {
    if (!task || !task.recurring || !task.recurrencePattern) return null;

    const baseDate = task.dueDate ? new Date(task.dueDate) : new Date();
    const interval = task.recurrenceInterval || 1;

    switch (task.recurrencePattern) {
      case 'daily':
        baseDate.setDate(baseDate.getDate() + interval);
        break;
      case 'weekly':
        baseDate.setDate(baseDate.getDate() + interval * 7);
        break;
      case 'monthly':
        baseDate.setMonth(baseDate.getMonth() + interval);
        break;
      default:
        return null;
    }

    return baseDate.toISOString().split('T')[0];
  },

  /**
   * Ordena tarefas por status, prioridade e data
   */
  sortTasks(tasks) {
    const statusOrder = {
      pending: 0,
      in_progress: 1,
      on_hold: 2,
      completed: 3,
      cancelled: 4,
    };

    return [...tasks].sort((a, b) => {
      const aStatus = statusOrder[a.status] ?? 99;
      const bStatus = statusOrder[b.status] ?? 99;

      if (aStatus !== bStatus) {
        return aStatus - bStatus;
      }

      const aPriority = this.PriorityConfig[a.priority]?.weight || 0;
      const bPriority = this.PriorityConfig[b.priority]?.weight || 0;

      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }

      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      return 0;
    });
  },
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaskSchema;
}
if (typeof window !== 'undefined') {
  window.TaskSchema = TaskSchema;
}
