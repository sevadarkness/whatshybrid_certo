// extractor/extractor_ui.js
// Lógica da interface do extrator

(function() {
    'use strict';

    // ============================================
    // ESTADO DA APLICAÇÃO
    // ============================================
    
    const State = {
        isExtracting: false,
        currentData: null,
        deletedMessages: [],
        editedMessages: [],
        extractionHistory: []
    };

    // ============================================
    // ELEMENTOS DO DOM
    // ============================================
    
    const Elements = {
        // Buttons
        btnClose: null,
        btnExtractAll: null,
        btnExtractContacts: null,
        btnExtractChats: null,
        btnExtractGroups: null,
        btnExtractLabels: null,
        btnRefreshDeleted: null,
        btnRefreshEdited: null,
        btnExportDeleted: null,
        btnExportEdited: null,
        btnClearHistory: null,
        btnClosePreview: null,
        btnDownloadPreview: null,
        btnCancelPreview: null,
        
        // Options
        optIncludeMessages: null,
        optIncludeDeleted: null,
        optIncludeEdited: null,
        optMessageLimit: null,
        
        // Containers
        statusBar: null,
        deletedList: null,
        editedList: null,
        historyList: null,
        deletedCount: null,
        editedCount: null,
        progressOverlay: null,
        progressText: null,
        progressFill: null,
        progressDetail: null,
        resultsPreview: null,
        previewContent: null,
        
        // Tabs
        tabs: null,
        tabContents: null
    };

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    
    function init() {
        cacheElements();
        bindEvents();
        loadHistory();
        refreshDeletedMessages();
        refreshEditedMessages();
        updateStatus('Pronto para extrair', 'success');
    }

    function cacheElements() {
        Elements.btnClose = document.getElementById('btn-close');
        Elements.btnExtractAll = document.getElementById('btn-extract-all');
        Elements.btnExtractContacts = document.getElementById('btn-extract-contacts');
        Elements.btnExtractChats = document.getElementById('btn-extract-chats');
        Elements.btnExtractGroups = document.getElementById('btn-extract-groups');
        Elements.btnExtractLabels = document.getElementById('btn-extract-labels');
        Elements.btnRefreshDeleted = document.getElementById('btn-refresh-deleted');
        Elements.btnRefreshEdited = document.getElementById('btn-refresh-edited');
        Elements.btnExportDeleted = document.getElementById('btn-export-deleted');
        Elements.btnExportEdited = document.getElementById('btn-export-edited');
        Elements.btnClearHistory = document.getElementById('btn-clear-history');
        Elements.btnClosePreview = document.getElementById('btn-close-preview');
        Elements.btnDownloadPreview = document.getElementById('btn-download-preview');
        Elements.btnCancelPreview = document.getElementById('btn-cancel-preview');
        
        Elements.optIncludeMessages = document.getElementById('opt-include-messages');
        Elements.optIncludeDeleted = document.getElementById('opt-include-deleted');
        Elements.optIncludeEdited = document.getElementById('opt-include-edited');
        Elements.optMessageLimit = document.getElementById('opt-message-limit');
        
        Elements.statusBar = document.getElementById('status-bar');
        Elements.deletedList = document.getElementById('deleted-list');
        Elements.editedList = document.getElementById('edited-list');
        Elements.historyList = document.getElementById('history-list');
        Elements.deletedCount = document.getElementById('deleted-count');
        Elements.editedCount = document.getElementById('edited-count');
        Elements.progressOverlay = document.getElementById('progress-overlay');
        Elements.progressText = document.getElementById('progress-text');
        Elements.progressFill = document.getElementById('progress-fill');
        Elements.progressDetail = document.getElementById('progress-detail');
        Elements.resultsPreview = document.getElementById('results-preview');
        Elements.previewContent = document.getElementById('preview-content');
        
        Elements.tabs = document.querySelectorAll('.tab');
        Elements.tabContents = document.querySelectorAll('.tab-content');
    }

    function bindEvents() {
        // Close button
        Elements.btnClose?.addEventListener('click', closePanel);
        
        // Extraction buttons
        Elements.btnExtractAll?.addEventListener('click', () => extractData('all'));
        Elements.btnExtractContacts?.addEventListener('click', () => extractData('contacts'));
        Elements.btnExtractChats?.addEventListener('click', () => extractData('chats'));
        Elements.btnExtractGroups?.addEventListener('click', () => extractData('groups'));
        Elements.btnExtractLabels?.addEventListener('click', () => extractData('labels'));
        
        // Refresh buttons
        Elements.btnRefreshDeleted?.addEventListener('click', refreshDeletedMessages);
        Elements.btnRefreshEdited?.addEventListener('click', refreshEditedMessages);
        
        // Export buttons
        Elements.btnExportDeleted?.addEventListener('click', exportDeletedMessages);
        Elements.btnExportEdited?.addEventListener('click', exportEditedMessages);
        
        // History
        Elements.btnClearHistory?.addEventListener('click', clearHistory);
        
        // Preview
        Elements.btnClosePreview?.addEventListener('click', closePreview);
        Elements.btnDownloadPreview?.addEventListener('click', downloadPreviewData);
        Elements.btnCancelPreview?.addEventListener('click', closePreview);
        
        // Tabs
        Elements.tabs?.forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });
        
        // Listen for messages from content script
        window.addEventListener('message', handleMessage);
    }

    // ============================================
    // COMUNICAÇÃO COM CONTENT SCRIPT
    // ============================================
    
    async function sendToContentScript(action, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                target: 'extractor_content',
                action,
                ...data
            }, response => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response?.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response?.error || 'Erro desconhecido'));
                }
            });
        });
    }

    function handleMessage(event) {
        const { type, changeType, data } = event.data || {};
        
        if (type === 'EXTRACTOR_MESSAGE_CHANGE') {
            if (changeType === 'deleted') {
                State.deletedMessages.push(data);
                renderDeletedMessages();
                showNotification('Mensagem apagada detectada!');
            } else if (changeType === 'edited') {
                State.editedMessages.push(data);
                renderEditedMessages();
                showNotification('Mensagem editada detectada!');
            }
        }
    }

    // ============================================
    // EXTRAÇÃO DE DADOS
    // ============================================
    
    async function extractData(type) {
        if (State.isExtracting) return;
        
        State.isExtracting = true;
        showProgress(`Extraindo ${getTypeName(type)}...`);
        
        try {
            const options = {
                includeMessages: Elements.optIncludeMessages?.checked || false,
                includeDeleted: Elements.optIncludeDeleted?.checked !== false,
                includeEdited: Elements.optIncludeEdited?.checked !== false,
                messageLimit: parseInt(Elements.optMessageLimit?.value) || 50
            };
            
            let result;
            
            switch (type) {
                case 'all':
                    updateProgress(10, 'Extraindo contatos...');
                    result = await sendToContentScript('extractEverything', { options });
                    break;
                    
                case 'contacts':
                    result = { contacts: await sendToContentScript('extractAllContacts') };
                    break;
                    
                case 'chats':
                    result = { chats: await sendToContentScript('extractAllChats', { options }) };
                    break;
                    
                case 'groups':
                    result = { groups: await sendToContentScript('extractAllGroups') };
                    break;
                    
                case 'labels':
                    result = { labels: await sendToContentScript('extractAllLabels') };
                    break;
            }
            
            State.currentData = result;
            updateProgress(100, 'Concluído!');
            
            // Salvar no histórico
            saveToHistory(type, result);
            
            // Mostrar preview
            setTimeout(() => {
                hideProgress();
                showPreview(result);
            }, 300);
            
            updateStatus('Extração concluída com sucesso!', 'success');
            
        } catch (error) {
            console.error('[ExtractorUI] Erro na extração:', error);
            hideProgress();
            updateStatus('Erro: ' + error.message, 'error');
        } finally {
            State.isExtracting = false;
        }
    }

    function getTypeName(type) {
        const names = {
            all: 'todos os dados',
            contacts: 'contatos',
            chats: 'chats',
            groups: 'grupos',
            labels: 'rótulos'
        };
        return names[type] || type;
    }

    // ============================================
    // MENSAGENS APAGADAS/EDITADAS
    // ============================================
    
    async function refreshDeletedMessages() {
        try {
            const result = await sendToContentScript('getDeletedMessages');
            // Null check for result
            if (result && typeof result === 'object') {
                State.deletedMessages = [
                    ...(result.fromStore || []),
                    ...(result.fromDOM || [])
                ];
            } else {
                State.deletedMessages = [];
            }
            renderDeletedMessages();
        } catch (error) {
            console.error('[ExtractorUI] Erro ao atualizar mensagens apagadas:', error);
            State.deletedMessages = [];
            renderDeletedMessages();
        }
    }

    async function refreshEditedMessages() {
        try {
            const result = await sendToContentScript('getEditedMessages');
            // Null check for result
            if (result && typeof result === 'object') {
                State.editedMessages = [
                    ...(result.fromStore || []),
                    ...(result.fromDOM || [])
                ];
            } else {
                State.editedMessages = [];
            }
            renderEditedMessages();
        } catch (error) {
            console.error('[ExtractorUI] Erro ao atualizar mensagens editadas:', error);
            State.editedMessages = [];
            renderEditedMessages();
        }
    }

    function renderDeletedMessages() {
        const container = Elements.deletedList;
        if (!container) return;
        
        Elements.deletedCount.textContent = `${State.deletedMessages.length} mensagens`;
        
        if (State.deletedMessages.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhuma mensagem apagada detectada ainda.</p>';
            return;
        }
        
        container.innerHTML = State.deletedMessages.map(msg => `
            <div class="message-item">
                <div class="msg-header">
                    <span>${msg.from || 'Desconhecido'}</span>
                    <span>${formatDate(msg.deletedAt)}</span>
                </div>
                <div class="msg-original">
                    <strong>Conteúdo original:</strong><br>
                    ${escapeHtml(msg.originalBody || '[Não capturado]')}
                </div>
            </div>
        `).join('');
    }

    function renderEditedMessages() {
        const container = Elements.editedList;
        if (!container) return;
        
        Elements.editedCount.textContent = `${State.editedMessages.length} mensagens`;
        
        if (State.editedMessages.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhuma mensagem editada detectada ainda.</p>';
            return;
        }
        
        container.innerHTML = State.editedMessages.map(msg => {
            const edits = msg.editHistory || [msg];
            return `
                <div class="message-item">
                    <div class="msg-header">
                        <span>${msg.from || edits[0]?.from || 'Desconhecido'}</span>
                        <span>${formatDate(edits[edits.length - 1]?.editedAt || msg.detectedAt)}</span>
                    </div>
                    <div class="msg-original">
                        <strong>Original:</strong> ${escapeHtml(edits[0]?.originalBody || '[Não capturado]')}
                    </div>
                    <div class="msg-edited">
                        <strong>Atual:</strong> ${escapeHtml(edits[edits.length - 1]?.newBody || msg.currentText || '')}
                    </div>
                </div>
            `;
        }).join('');
    }

    function exportDeletedMessages() {
        if (State.deletedMessages.length === 0) {
            updateStatus('Nenhuma mensagem apagada para exportar', 'error');
            return;
        }
        
        const format = getSelectedFormat();
        ExportUtils.downloadComplete({ deletedMessages: State.deletedMessages }, format, 'mensagens_apagadas');
        updateStatus('Mensagens apagadas exportadas!', 'success');
    }

    function exportEditedMessages() {
        if (State.editedMessages.length === 0) {
            updateStatus('Nenhuma mensagem editada para exportar', 'error');
            return;
        }
        
        const format = getSelectedFormat();
        ExportUtils.downloadComplete({ editedMessages: State.editedMessages }, format, 'mensagens_editadas');
        updateStatus('Mensagens editadas exportadas!', 'success');
    }

    // ============================================
    // HISTÓRICO
    // ============================================
    
    function loadHistory() {
        chrome.storage.local.get('extractor_history', (result) => {
            State.extractionHistory = result.extractor_history || [];
            renderHistory();
        });
    }

    function saveToHistory(type, data) {
        const entry = {
            id: Date.now(),
            type,
            date: new Date().toISOString(),
            summary: generateSummary(data)
        };
        
        State.extractionHistory.unshift(entry);
        
        // Manter apenas últimos 20
        if (State.extractionHistory.length > 20) {
            State.extractionHistory = State.extractionHistory.slice(0, 20);
        }
        
        chrome.storage.local.set({ extractor_history: State.extractionHistory });
        renderHistory();
    }

    function generateSummary(data) {
        const parts = [];
        if (data.contacts?.length) parts.push(`${data.contacts.length} contatos`);
        if (data.chats?.length) parts.push(`${data.chats.length} chats`);
        if (data.groups?.length) parts.push(`${data.groups.length} grupos`);
        if (data.labels?.length) parts.push(`${data.labels.length} rótulos`);
        return parts.join(', ') || 'Extração vazia';
    }

    function renderHistory() {
        const container = Elements.historyList;
        if (!container) return;
        
        if (State.extractionHistory.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhuma extração realizada ainda.</p>';
            return;
        }
        
        container.innerHTML = State.extractionHistory.map(entry => `
            <div class="history-item">
                <div class="history-info">
                    <div class="history-date">${formatDate(entry.date)}</div>
                    <div class="history-summary">${entry.summary}</div>
                </div>
            </div>
        `).join('');
    }

    function clearHistory() {
        State.extractionHistory = [];
        chrome.storage.local.remove('extractor_history');
        renderHistory();
        updateStatus('Histórico limpo', 'success');
    }

    // ============================================
    // UI HELPERS
    // ============================================
    
    function switchTab(tabId) {
        Elements.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });
        
        Elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabId}`);
        });
    }

    function updateStatus(message, type = '') {
        if (!Elements.statusBar) return;
        
        Elements.statusBar.className = `status-bar ${type}`;
        Elements.statusBar.innerHTML = `
            <span class="status-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : '⏳'}</span>
            <span class="status-text">${message}</span>
        `;
    }

    function showProgress(message) {
        if (!Elements.progressOverlay) return;
        
        Elements.progressOverlay.classList.remove('hidden');
        Elements.progressText.textContent = message;
        Elements.progressFill.style.width = '0%';
        Elements.progressDetail.textContent = '';
    }

    function updateProgress(percent, detail = '') {
        if (!Elements.progressFill) return;
        
        Elements.progressFill.style.width = `${percent}%`;
        if (detail) {
            Elements.progressDetail.textContent = detail;
        }
    }

    function hideProgress() {
        if (!Elements.progressOverlay) return;
        Elements.progressOverlay.classList.add('hidden');
    }

    function showPreview(data) {
        if (!Elements.resultsPreview) return;
        
        Elements.resultsPreview.classList.remove('hidden');
        Elements.previewContent.textContent = JSON.stringify(data, null, 2);
    }

    function closePreview() {
        if (!Elements.resultsPreview) return;
        Elements.resultsPreview.classList.add('hidden');
    }

    function downloadPreviewData() {
        if (!State.currentData) return;
        
        const format = getSelectedFormat();
        ExportUtils.downloadComplete(State.currentData, format, 'whatsapp_export');
        closePreview();
        updateStatus('Arquivo exportado com sucesso!', 'success');
    }

    function getSelectedFormat() {
        const selected = document.querySelector('input[name="export-format"]:checked');
        return selected?.value || 'xlsx';
    }

    function closePanel() {
        const panel = document.getElementById('extractor-panel');
        if (panel) {
            panel.style.display = 'none';
        }
        // Notificar a página pai (content_main.js) para esconder o container
        window.parent.postMessage({ type: 'CLOSE_EXTRACTOR_PANEL' }, '*');
    }

    function showNotification(message) {
        console.log('[ExtractorUI] Notificação:', message);
    }

    // ============================================
    // UTILITIES
    // ============================================
    
    function formatDate(dateStr) {
        if (!dateStr) return 'Data desconhecida';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();