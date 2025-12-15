// utils/notification-center.js
// Centro de notificações unificado (toasts + modais simples)

(function() {
  'use strict';

  const CONFIG = {
    maxToasts: 5,
    defaultDuration: 4000,
    position: 'bottom-right', // bottom-right, top-right, bottom-left, top-left
    enableHistory: true,
    maxHistory: 50
  };

  const TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
    LOADING: 'loading'
  };

  const PRIORITY = {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    URGENT: 3
  };

  let container = null;
  const activeToasts = new Map(); // id -> {element, notification}
  const history = [];
  const queue = [];
  let processing = false;

  function init() {
    if (container) return;
    createContainer();
    injectStyles();
    setupEventListeners();
    console.log('[NotificationCenter] Inicializado');
  }

  function createContainer() {
    container = document.createElement('div');
    container.id = 'quantum-notification-center';
    container.className = `notification-center position-${CONFIG.position}`;
    document.documentElement.appendChild(container);
  }

  function setupEventListeners() {
    const bus = window.EventBus;
    if (!bus) return;

    bus.on(bus.EVENTS.CREDITS_LOW, (data) => {
      warning('Créditos baixos', `Restam apenas ${data?.remaining ?? '?'} créditos de IA`, {
        action: {
          label: 'Comprar mais',
          callback: () => window.SubscriptionUI?.showBuyCreditsModal?.()
        }
      });
    });

    bus.on(bus.EVENTS.CREDITS_DEPLETED, () => {
      error('Créditos esgotados', 'Seus créditos de IA acabaram.', {
        persistent: true,
        action: {
          label: 'Comprar créditos',
          callback: () => window.SubscriptionUI?.showBuyCreditsModal?.()
        }
      });
    });

    bus.on(bus.EVENTS.SUBSCRIPTION_EXPIRED, () => {
      error('Assinatura expirada', 'Sua assinatura expirou. Renove para continuar.', {
        persistent: true,
        action: {
          label: 'Renovar',
          callback: () => window.SubscriptionUI?.showUpgradeModal?.()
        }
      });
    });

    bus.on(bus.EVENTS.MODULE_ERROR, ({ name, error }) => {
      error('Erro no módulo', `O módulo "${name}" encontrou um problema.`, {
        details: error?.message || String(error || '')
      });
    });
  }

  function show(options = {}) {
    init();

    const notification = {
      id: generateId(),
      type: options.type || TYPES.INFO,
      title: options.title || '',
      message: options.message || '',
      icon: options.icon || getDefaultIcon(options.type || TYPES.INFO),
      duration: options.duration ?? CONFIG.defaultDuration,
      persistent: !!options.persistent,
      priority: options.priority ?? PRIORITY.NORMAL,
      action: options.action || null,
      dismissible: options.dismissible !== false,
      progress: options.progress ?? null,
      details: options.details || null,
      timestamp: Date.now()
    };

    if (CONFIG.enableHistory) addToHistory(notification);

    if (activeToasts.size >= CONFIG.maxToasts) {
      queue.push(notification);
      processQueue();
    } else {
      render(notification);
    }

    window.EventBus?.emit?.(window.EventBus.EVENTS.NOTIFICATION_SHOWN, notification);

    return notification.id;
  }

  function success(title, message, options = {}) {
    return show({ ...options, type: TYPES.SUCCESS, title, message });
  }
  function error(title, message, options = {}) {
    return show({ ...options, type: TYPES.ERROR, title, message, duration: options.duration ?? 6000 });
  }
  function warning(title, message, options = {}) {
    return show({ ...options, type: TYPES.WARNING, title, message, duration: options.duration ?? 5000 });
  }
  function info(title, message, options = {}) {
    return show({ ...options, type: TYPES.INFO, title, message });
  }
  function loading(title, message, options = {}) {
    return show({
      ...options,
      type: TYPES.LOADING,
      title,
      message,
      persistent: true,
      dismissible: false
    });
  }

  function render(notification) {
    const el = document.createElement('div');
    el.id = `notification-${notification.id}`;
    el.className = `notification notification-${notification.type} priority-${notification.priority}`;
    el.setAttribute('role', 'alert');

    el.innerHTML = `
      <div class="notification-icon">${notification.type === TYPES.LOADING ? '<div class="spinner"></div>' : `<span>${escapeHtml(notification.icon)}</span>`}</div>
      <div class="notification-content">
        ${notification.title ? `<div class="notification-title">${escapeHtml(notification.title)}</div>` : ''}
        ${notification.message ? `<div class="notification-message">${escapeHtml(notification.message)}</div>` : ''}
        ${notification.details ? `<div class="notification-details">${escapeHtml(notification.details)}</div>` : ''}
        ${notification.progress !== null ? `
          <div class="notification-progress">
            <div class="progress-bar"><div class="progress-fill" style="width:${Number(notification.progress) || 0}%"></div></div>
            <span class="progress-text">${Number(notification.progress) || 0}%</span>
          </div>` : ''}
        ${notification.action ? `
          <div class="notification-actions">
            <button class="notification-action-btn">${escapeHtml(notification.action.label || 'Ação')}</button>
          </div>` : ''}
      </div>
      ${notification.dismissible ? '<button class="notification-close" aria-label="Fechar"><span>×</span></button>' : ''}
    `;

    if (notification.dismissible) {
      el.querySelector('.notification-close')?.addEventListener('click', () => dismiss(notification.id));
    }
    if (notification.action) {
      el.querySelector('.notification-action-btn')?.addEventListener('click', () => {
        try { notification.action.callback?.(); } catch (_) {}
        if (!notification.persistent) dismiss(notification.id);
      });
    }

    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    container.appendChild(el);
    // Trigger reflow
    void el.offsetHeight;
    el.style.transition = 'all 0.25s ease';
    el.style.opacity = '1';
    el.style.transform = 'translateX(0)';

    activeToasts.set(notification.id, { element: el, notification });

    if (!notification.persistent && notification.duration > 0) {
      setTimeout(() => dismiss(notification.id), notification.duration);
    }
  }

  function update(id, updates = {}) {
    const toast = activeToasts.get(id);
    if (!toast) return false;

    const { element, notification } = toast;

    if (updates.title !== undefined) {
      const titleEl = element.querySelector('.notification-title');
      if (titleEl) titleEl.textContent = updates.title;
      notification.title = updates.title;
    }

    if (updates.message !== undefined) {
      const msgEl = element.querySelector('.notification-message');
      if (msgEl) msgEl.textContent = updates.message;
      notification.message = updates.message;
    }

    if (updates.progress !== undefined) {
      const fill = element.querySelector('.progress-fill');
      const txt = element.querySelector('.progress-text');
      const p = Math.max(0, Math.min(100, Number(updates.progress) || 0));
      if (fill) fill.style.width = `${p}%`;
      if (txt) txt.textContent = `${p}%`;
      notification.progress = p;
    }

    if (updates.type !== undefined && updates.type !== notification.type) {
      element.classList.remove(`notification-${notification.type}`);
      element.classList.add(`notification-${updates.type}`);
      notification.type = updates.type;
      // icon
      const iconEl = element.querySelector('.notification-icon');
      if (iconEl && updates.type !== TYPES.LOADING) {
        iconEl.innerHTML = `<span>${escapeHtml(updates.icon || getDefaultIcon(updates.type))}</span>`;
      }
    }

    return true;
  }

  function complete(id, type = TYPES.SUCCESS, title, message) {
    update(id, { type, title, message });

    const toast = activeToasts.get(id);
    if (!toast) return;
    toast.notification.persistent = false;
    toast.notification.dismissible = true;

    if (!toast.element.querySelector('.notification-close')) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'notification-close';
      closeBtn.innerHTML = '<span>×</span>';
      closeBtn.addEventListener('click', () => dismiss(id));
      toast.element.appendChild(closeBtn);
    }

    setTimeout(() => dismiss(id), 4000);
  }

  function dismiss(id) {
    const toast = activeToasts.get(id);
    if (!toast) return;

    const el = toast.element;
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';

    setTimeout(() => {
      el.remove();
      activeToasts.delete(id);
      processQueue();
    }, 250);
  }

  function dismissAll() {
    Array.from(activeToasts.keys()).forEach(dismiss);
    queue.length = 0;
  }

  function processQueue() {
    if (processing) return;
    if (queue.length === 0) return;
    if (activeToasts.size >= CONFIG.maxToasts) return;

    processing = true;
    queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    while (queue.length > 0 && activeToasts.size < CONFIG.maxToasts) {
      render(queue.shift());
    }
    processing = false;
  }

  function confirm(title, message, options = {}) {
    init();
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'notification-modal-overlay';
      modal.innerHTML = `
        <div class="notification-modal">
          <div class="modal-icon">${escapeHtml(options.icon || '❓')}</div>
          <h3 class="modal-title">${escapeHtml(title || '')}</h3>
          <p class="modal-message">${escapeHtml(message || '')}</p>
          <div class="modal-actions">
            <button class="btn-cancel">${escapeHtml(options.cancelText || 'Cancelar')}</button>
            <button class="btn-confirm ${options.danger ? 'danger' : ''}">${escapeHtml(options.confirmText || 'Confirmar')}</button>
          </div>
        </div>
      `;

      modal.querySelector('.btn-cancel')?.addEventListener('click', () => {
        modal.remove();
        resolve(false);
      });

      modal.querySelector('.btn-confirm')?.addEventListener('click', () => {
        modal.remove();
        resolve(true);
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
          resolve(false);
        }
      });

      document.documentElement.appendChild(modal);
      window.EventBus?.emit?.(window.EventBus.EVENTS.MODAL_OPENED, { type: 'confirm', title });
    });
  }

  function alert(title, message, options = {}) {
    init();
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'notification-modal-overlay';
      modal.innerHTML = `
        <div class="notification-modal">
          <div class="modal-icon">${escapeHtml(options.icon || 'ℹ️')}</div>
          <h3 class="modal-title">${escapeHtml(title || '')}</h3>
          <p class="modal-message">${escapeHtml(message || '')}</p>
          <div class="modal-actions">
            <button class="btn-confirm">${escapeHtml(options.buttonText || 'OK')}</button>
          </div>
        </div>
      `;

      modal.querySelector('.btn-confirm')?.addEventListener('click', () => {
        modal.remove();
        resolve();
      });

      document.documentElement.appendChild(modal);
    });
  }

  function addToHistory(notification) {
    history.push({ ...notification, dismissedAt: null });
    if (history.length > CONFIG.maxHistory) history.shift();
  }

  function getHistory(type = null) {
    if (!type) return [...history];
    return history.filter(h => h.type === type);
  }

  function clearHistory() {
    history.length = 0;
  }

  function generateId() {
    return `n_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getDefaultIcon(type) {
    const icons = {
      [TYPES.SUCCESS]: '✅',
      [TYPES.ERROR]: '❌',
      [TYPES.WARNING]: '⚠️',
      [TYPES.INFO]: 'ℹ️',
      [TYPES.LOADING]: '⏳'
    };
    return icons[type] || 'ℹ️';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function injectStyles() {
    if (document.getElementById('notification-center-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'notification-center-styles';
    styles.textContent = `
      .notification-center {
        position: fixed;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 420px;
        pointer-events: none;
      }

      .notification-center.position-bottom-right { bottom: 24px; right: 24px; }
      .notification-center.position-top-right { top: 24px; right: 24px; }
      .notification-center.position-bottom-left { bottom: 24px; left: 24px; }
      .notification-center.position-top-left { top: 24px; left: 24px; }

      .notification {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px;
        background: #101336;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        pointer-events: all;
        border-left: 4px solid;
      }
      .notification-success { border-left-color: #8b5cf6; }
      .notification-error { border-left-color: #ea0038; }
      .notification-warning { border-left-color: #f0b429; }
      .notification-info { border-left-color: #53bdeb; }
      .notification-loading { border-left-color: #8696a0; }

      .notification.priority-3 { animation: urgentPulse 2s infinite; }
      @keyframes urgentPulse {
        0%,100% { box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        50% { box-shadow: 0 4px 20px rgba(234,0,56,0.4); }
      }

      .notification-icon { flex-shrink: 0; font-size: 20px; }
      .notification-icon .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #3a4a54;
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      .notification-content { flex: 1; min-width: 0; }
      .notification-title {
        font-weight: 600;
        color: #e9edef;
        font-size: 14px;
        margin-bottom: 4px;
      }
      .notification-message {
        color: #8696a0;
        font-size: 13px;
        line-height: 1.4;
      }
      .notification-details {
        margin-top: 8px;
        padding: 8px;
        background: rgba(0,0,0,0.2);
        border-radius: 6px;
        font-size: 12px;
        color: #8696a0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        white-space: pre-wrap;
      }

      .notification-progress {
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .notification-progress .progress-bar {
        flex: 1;
        height: 4px;
        background: #3a4a54;
        border-radius: 2px;
        overflow: hidden;
      }
      .notification-progress .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #8b5cf6, #3b82f6);
        transition: width 0.3s ease;
      }
      .notification-progress .progress-text {
        font-size: 12px;
        color: #8696a0;
        min-width: 40px;
        text-align: right;
      }

      .notification-actions { margin-top: 12px; }
      .notification-action-btn {
        padding: 6px 12px;
        background: rgba(0,168,132,0.2);
        border: none;
        border-radius: 6px;
        color: #8b5cf6;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }
      .notification-action-btn:hover { background: rgba(0,168,132,0.3); }

      .notification-close {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: #8696a0;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s;
      }
      .notification-close:hover {
        background: rgba(255,255,255,0.1);
        color: #e9edef;
      }

      /* Modal */
      .notification-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000000;
        animation: fadeIn 0.18s ease;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

      .notification-modal {
        background: #101336;
        border-radius: 16px;
        padding: 28px;
        max-width: 420px;
        width: 92%;
        text-align: center;
        animation: scaleIn 0.18s ease;
      }
      @keyframes scaleIn {
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      .notification-modal .modal-icon {
        font-size: 44px;
        margin-bottom: 12px;
      }
      .notification-modal .modal-title {
        font-size: 18px;
        font-weight: 600;
        color: #e9edef;
        margin-bottom: 8px;
      }
      .notification-modal .modal-message {
        font-size: 14px;
        color: #8696a0;
        margin-bottom: 22px;
        line-height: 1.5;
      }
      .notification-modal .modal-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
      }
      .notification-modal .btn-cancel,
      .notification-modal .btn-confirm {
        padding: 10px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .notification-modal .btn-cancel {
        background: #3a4a54;
        border: none;
        color: #e9edef;
      }
      .notification-modal .btn-cancel:hover { background: #4a5a64; }
      .notification-modal .btn-confirm {
        background: #8b5cf6;
        border: none;
        color: white;
      }
      .notification-modal .btn-confirm:hover { background: #00c896; }
      .notification-modal .btn-confirm.danger {
        background: #ea0038;
      }
      .notification-modal .btn-confirm.danger:hover {
        background: #ff1a4d;
      }
    `;

    document.head.appendChild(styles);
  }

  // Export
  window.NotificationCenter = {
    init,
    show,
    success,
    error,
    warning,
    info,
    loading,
    update,
    complete,
    dismiss,
    dismissAll,
    confirm,
    alert,
    getHistory,
    clearHistory,
    TYPES,
    PRIORITY,
    setConfig: (newConfig) => Object.assign(CONFIG, newConfig)
  };
})();
