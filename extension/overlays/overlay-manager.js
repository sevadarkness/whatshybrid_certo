// overlays/overlay-manager.js
// Gerenciador central de overlays no DOM do WhatsApp

const OverlayManager = (function() {
    'use strict';

    // Container de overlays
    let overlayContainer = null;
    const activeOverlays = new Map();

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    function init() {
        createOverlayContainer();
        console.log('[OverlayManager] Inicializado');
    }

    function createOverlayContainer() {
        if (overlayContainer) return;

        overlayContainer = document.createElement('div');
        overlayContainer.id = 'quantum-overlay-container';
        overlayContainer.className = 'quantum-overlay-container';
        document.body.appendChild(overlayContainer);

        // Injetar estilos
        injectStyles();
    }

    function injectStyles() {
        if (document.getElementById('quantum-overlay-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'quantum-overlay-styles';
        styles.textContent = `
            .quantum-overlay-container {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 99999;
            }

            .quantum-overlay {
                position: absolute;
                pointer-events: all;
            }

            /* Progress Overlay */
            .progress-overlay {
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(17, 27, 33, 0.95);
                backdrop-filter: blur(8px);
                border-radius: 16px;
                padding: 32px 48px;
                text-align: center;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                min-width: 320px;
            }

            .progress-overlay .progress-icon {
                font-size: 48px;
                margin-bottom: 16px;
                animation: bounce 1s infinite;
            }

            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }

            .progress-overlay .progress-title {
                font-size: 18px;
                font-weight: 600;
                color: #e9edef;
                margin-bottom: 8px;
            }

            .progress-overlay .progress-subtitle {
                font-size: 14px;
                color: #8696a0;
                margin-bottom: 20px;
            }

            .progress-overlay .progress-bar-container {
                background: #0b0d22;
                border-radius: 8px;
                height: 8px;
                overflow: hidden;
                margin-bottom: 12px;
            }

            .progress-overlay .progress-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #8b5cf6, #3b82f6);
                border-radius: 8px;
                transition: width 0.3s ease;
            }

            .progress-overlay .progress-stats {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                color: #8696a0;
            }

            .progress-overlay .progress-percentage {
                font-size: 24px;
                font-weight: 700;
                color: #8b5cf6;
                margin-bottom: 8px;
            }

            .progress-overlay .btn-cancel {
                margin-top: 20px;
                padding: 10px 24px;
                background: #3a4a54;
                border: none;
                border-radius: 8px;
                color: #e9edef;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }

            .progress-overlay .btn-cancel:hover {
                background: #4a5a64;
            }

            /* Success/Error Overlay */
            .result-overlay {
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(17, 27, 33, 0.95);
                backdrop-filter: blur(8px);
                border-radius: 16px;
                padding: 32px;
                text-align: center;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                animation: scaleIn 0.3s ease;
            }

            @keyframes scaleIn {
                from { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
                to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }

            .result-overlay .result-icon {
                font-size: 64px;
                margin-bottom: 16px;
            }

            .result-overlay.success .result-icon {
                animation: successPop 0.5s ease;
            }

            @keyframes successPop {
                0% { transform: scale(0); }
                50% { transform: scale(1.2); }
                100% { transform: scale(1); }
            }

            .result-overlay .result-title {
                font-size: 20px;
                font-weight: 600;
                color: #e9edef;
                margin-bottom: 8px;
            }

            .result-overlay .result-message {
                font-size: 14px;
                color: #8696a0;
                margin-bottom: 20px;
            }

            .result-overlay .result-details {
                background: #0b0d22;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 20px;
                text-align: left;
            }

            .result-overlay .detail-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #3a4a54;
                font-size: 13px;
            }

            .result-overlay .detail-item:last-child {
                border-bottom: none;
            }

            .result-overlay .detail-label {
                color: #8696a0;
            }

            .result-overlay .detail-value {
                color: #e9edef;
                font-weight: 500;
            }

            .result-overlay .btn-close {
                padding: 10px 32px;
                background: #8b5cf6;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            }

            /* Toast Notifications */
            .quantum-toast-container {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 999999;
                display: flex;
                flex-direction: column;
                gap: 12px;
                pointer-events: none;
            }

            .quantum-toast {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 20px;
                background: #101336;
                border-radius: 12px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                pointer-events: all;
                animation: toastIn 0.3s ease;
                max-width: 380px;
            }

            @keyframes toastIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }

            .quantum-toast.toast-out {
                animation: toastOut 0.3s ease forwards;
            }

            @keyframes toastOut {
                to { transform: translateX(100%); opacity: 0; }
            }

            .quantum-toast .toast-icon {
                font-size: 20px;
            }

            .quantum-toast .toast-content {
                flex: 1;
            }

            .quantum-toast .toast-title {
                font-weight: 600;
                color: #e9edef;
                font-size: 14px;
            }

            .quantum-toast .toast-message {
                font-size: 13px;
                color: #8696a0;
            }

            .quantum-toast.success {
                border-left: 4px solid #8b5cf6;
            }

            .quantum-toast.error {
                border-left: 4px solid #ea0038;
            }

            .quantum-toast.warning {
                border-left: 4px solid #f0b429;
            }

            .quantum-toast.info {
                border-left: 4px solid #53bdeb;
            }

            /* Mini Progress (inline) */
            .mini-progress {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 6px 12px;
                background: rgba(0, 168, 132, 0.2);
                border-radius: 20px;
                font-size: 12px;
                color: #8b5cf6;
            }

            .mini-progress .spinner {
                width: 14px;
                height: 14px;
                border: 2px solid transparent;
                border-top-color: #8b5cf6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;

        document.head.appendChild(styles);
    }

    // ============================================
    // CRIAR OVERLAYS
    // ============================================

    function create(id, type, options = {}) {
        if (activeOverlays.has(id)) {
            return update(id, options);
        }

        const overlay = document.createElement('div');
        overlay.id = `quantum-overlay-${id}`;
        overlay.className = `quantum-overlay ${type}-overlay`;
        overlay.dataset.type = type;

        switch (type) {
            case 'progress':
                overlay.innerHTML = createProgressHTML(options);
                break;
            case 'result':
                overlay.innerHTML = createResultHTML(options);
                break;
            case 'custom':
                overlay.innerHTML = options.html || '';
                break;
        }

        overlayContainer.appendChild(overlay);
        activeOverlays.set(id, { element: overlay, type, options });

        return overlay;
    }

    function createProgressHTML(options) {
        const {
            icon = '📤',
            title = 'Processando...',
            subtitle = '',
            progress = 0,
            current = 0,
            total = 0,
            showCancel = true,
            cancelText = 'Cancelar'
        } = options;

        return `
            <div class="progress-icon">${icon}</div>
            <div class="progress-title">${title}</div>
            <div class="progress-subtitle">${subtitle}</div>
            <div class="progress-percentage">${progress}%</div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progress}%"></div>
            </div>
            <div class="progress-stats">
                <span class="progress-current">${current} de ${total}</span>
                <span class="progress-eta"></span>
            </div>
            ${showCancel ? `<button class="btn-cancel">${cancelText}</button>` : ''}
        `;
    }

    function createResultHTML(options) {
        const {
            success = true,
            icon = success ? '✅' : '❌',
            title = success ? 'Concluído!' : 'Erro',
            message = '',
            details = [],
            buttonText = 'Fechar'
        } = options;

        let detailsHTML = '';
        if (details && details.length > 0) {
            detailsHTML = `
                <div class="result-details">
                    ${details.map(d => `
                        <div class="detail-item">
                            <span class="detail-label">${d.label}</span>
                            <span class="detail-value">${d.value}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        return `
            <div class="result-icon">${icon}</div>
            <div class="result-title">${title}</div>
            <div class="result-message">${message}</div>
            ${detailsHTML}
            <button class="btn-close">${buttonText}</button>
        `;
    }

    // ============================================
    // ATUALIZAR OVERLAYS
    // ============================================

    function update(id, options) {
        const overlay = activeOverlays.get(id);
        if (!overlay) return null;

        const { element, type } = overlay;

        if (type === 'progress') {
            if (options.progress !== undefined) {
                const bar = element.querySelector('.progress-bar-fill');
                const percentage = element.querySelector('.progress-percentage');
                if (bar) bar.style.width = `${options.progress}%`;
                if (percentage) percentage.textContent = `${options.progress}%`;
            }

            if (options.current !== undefined && options.total !== undefined) {
                const stats = element.querySelector('.progress-current');
                if (stats) stats.textContent = `${options.current} de ${options.total}`;
            }

            if (options.title) {
                const title = element.querySelector('.progress-title');
                if (title) title.textContent = options.title;
            }

            if (options.subtitle) {
                const subtitle = element.querySelector('.progress-subtitle');
                if (subtitle) subtitle.textContent = options.subtitle;
            }

            if (options.eta) {
                const eta = element.querySelector('.progress-eta');
                if (eta) eta.textContent = `~${options.eta} restante`;
            }
        }

        overlay.options = { ...overlay.options, ...options };
        return element;
    }

    // ============================================
    // REMOVER OVERLAYS
    // ============================================

    function remove(id, delay = 0) {
        setTimeout(() => {
            const overlay = activeOverlays.get(id);
            if (overlay) {
                overlay.element.remove();
                activeOverlays.delete(id);
            }
        }, delay);
    }

    function removeAll() {
        activeOverlays.forEach((_, id) => remove(id));
    }

    // ============================================
    // HELPERS DE PROGRESSO
    // ============================================

    function showProgress(id, options) {
        return create(id, 'progress', options);
    }

    function updateProgress(id, progress, current, total) {
        return update(id, { progress, current, total });
    }

    function completeProgress(id, options = {}) {
        const overlay = activeOverlays.get(id);
        if (!overlay) return;

        // Transformar em resultado
        overlay.element.className = 'quantum-overlay result-overlay success';
        overlay.element.innerHTML = createResultHTML({
            success: true,
            ...options
        });

        // Bind close button
        const closeBtn = overlay.element.querySelector('.btn-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => remove(id));
        }

        // Auto-fechar após 5 segundos
        if (options.autoClose !== false) {
            setTimeout(() => remove(id), 5000);
        }
    }

    function failProgress(id, options = {}) {
        const overlay = activeOverlays.get(id);
        if (!overlay) return;

        overlay.element.className = 'quantum-overlay result-overlay error';
        overlay.element.innerHTML = createResultHTML({
            success: false,
            ...options
        });

        const closeBtn = overlay.element.querySelector('.btn-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => remove(id));
        }
    }

    // ============================================
    // TOASTS
    // ============================================

    let toastContainer = null;

    function getToastContainer() {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'quantum-toast-container';
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    function showToast(title, message, type = 'info', duration = 4000) {
        // Prefer NotificationCenter quando disponível (notificações unificadas)
        const nc = window.NotificationCenter;
        if (nc && typeof nc.show === 'function') {
            const normalized = (type === 'danger') ? 'error' : type;
            nc.show({ type: normalized, title: title || '', message: message || '', duration });
            try {
                if (window.EventBus && typeof window.EventBus.emit === 'function') {
                    const evt = (window.EventBus.EVENTS && window.EventBus.EVENTS.TOAST_SHOWN) ? window.EventBus.EVENTS.TOAST_SHOWN : 'overlay:toast_shown';
                    window.EventBus.emit(evt, { title, message, type: normalized });
                }
            } catch (e) {}
            return null;
        }

        const container = getToastContainer();

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `quantum-toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
        `;

        container.appendChild(toast);

        // Auto-remover
        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);

        return toast;
    }

    // ============================================
    // EXPORT
    // ============================================

    return {
        init,
        create,
        update,
        remove,
        removeAll,
        showProgress,
        updateProgress,
        completeProgress,
        failProgress,
        showToast
    };
})();

// Export global
window.OverlayManager = OverlayManager;
