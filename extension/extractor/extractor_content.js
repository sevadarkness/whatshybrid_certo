// extractor/extractor_content.js
// Content script que gerencia comunicação e MutationObserver

(function() {
    'use strict';

    console.log('[ExtractorContent] Inicializando...');

    // ============================================
    // INJEÇÃO DO SCRIPT NO CONTEXTO DA PÁGINA
    // ============================================
    
    function injectScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('extractor/extractor_inject.js');
            script.onload = () => {
                script.remove();
                resolve();
            };
            script.onerror = reject;
            (document.head || document.documentElement).appendChild(script);
        });
    }

    // ============================================
    // STORAGE MANAGER
    // ============================================
    
    const StorageManager = {
        STORAGE_KEY: 'whatsapp_extractor_data',
        
        async save(data) {
            try {
                await chrome.storage.local.set({
                    [this.STORAGE_KEY]: data
                });
            } catch (e) {
                console.error('[ExtractorContent] Erro ao salvar:', e);
            }
        },
        
        async load() {
            try {
                const result = await chrome.storage.local.get(this.STORAGE_KEY);
                return result[this.STORAGE_KEY] || null;
            } catch (e) {
                console.error('[ExtractorContent] Erro ao carregar:', e);
                return null;
            }
        },
        
        async clear() {
            try {
                await chrome.storage.local.remove(this.STORAGE_KEY);
            } catch (e) {
                console.error('[ExtractorContent] Erro ao limpar:', e);
            }
        }
    };

    // ============================================
    // MUTATION OBSERVER PARA DOM
    // ============================================
    
    const DOMObserver = {
        observer: null,
        deletedMessagesFromDOM: [],
        editedMessagesFromDOM: [],
        
        init() {
            this.observer = new MutationObserver(this._handleMutations.bind(this));
            this._startObserving();
            console.log('[ExtractorContent] DOMObserver inicializado');
        },
        
        _startObserving() {
            // Aguardar o container de mensagens aparecer
            const checkContainer = setInterval(() => {
                const container = document.querySelector('#main');
                if (container) {
                    clearInterval(checkContainer);
                    this.observer.observe(container, {
                        childList: true,
                        subtree: true,
                        characterData: true,
                        attributes: true,
                        attributeFilter: ['class', 'data-pre-plain-text']
                    });
                    console.log('[ExtractorContent] Observando container de mensagens');
                }
            }, 1000);
        },
        
        _handleMutations(mutations) {
            for (const mutation of mutations) {
                // Detectar mensagens apagadas pelo DOM
                if (mutation.type === 'childList') {
                    this._checkDeletedMessages(mutation);
                }
                
                // Detectar edições pelo DOM
                if (mutation.type === 'characterData' || mutation.type === 'childList') {
                    this._checkEditedMessages(mutation);
                }
            }
        },
        
        _checkDeletedMessages(mutation) {
            // Procurar por ícones de "mensagem apagada"
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                
                // Seletores para mensagem apagada (WhatsApp muda periodicamente)
                const deletedIndicators = node.querySelectorAll
                    ? node.querySelectorAll('[data-icon="recalled"], [data-icon="msg-dblcheck-ack"]')
                    : [];
                
                if (deletedIndicators.length > 0 || 
                    node.textContent?.includes('Esta mensagem foi apagada') ||
                    node.textContent?.includes('This message was deleted') ||
                    node.textContent?.includes('You deleted this message')) {
                    
                    const messageRow = node.closest('[data-id]');
                    if (messageRow) {
                        const msgId = messageRow.getAttribute('data-id');
                        this._recordDeletedFromDOM(msgId, messageRow);
                    }
                }
            }
        },
        
        _checkEditedMessages(mutation) {
            // Procurar por indicador de "Editada"
            const target = mutation.target;
            if (!target) return;
            
            const element = target.nodeType === Node.ELEMENT_NODE 
                ? target 
                : target.parentElement;
            
            if (!element) return;
            
            // Verificar se contém indicador de edição
            const editIndicator = element.querySelector
                ? element.querySelector('[data-icon="edited"]')
                : null;
            
            if (editIndicator || 
                element.textContent?.includes('Editada') ||
                element.textContent?.includes('Edited')) {
                
                const messageRow = element.closest('[data-id]');
                if (messageRow) {
                    const msgId = messageRow.getAttribute('data-id');
                    const currentText = this._extractMessageText(messageRow);
                    this._recordEditedFromDOM(msgId, currentText, messageRow);
                }
            }
        },
        
        _extractMessageText(messageRow) {
            // Tentar extrair texto da mensagem
            const textSpan = messageRow.querySelector('.selectable-text');
            return textSpan?.textContent || '';
        },
        
        _recordDeletedFromDOM(msgId, element) {
            if (!msgId) return;
            
            const existing = this.deletedMessagesFromDOM.find(m => m.id === msgId);
            if (existing) return;
            
            const record = {
                id: msgId,
                detectedAt: new Date().toISOString(),
                source: 'DOM'
            };
            
            this.deletedMessagesFromDOM.push(record);
            this._notifyBackground('deleted', record);
        },
        
        _recordEditedFromDOM(msgId, currentText, element) {
            if (!msgId) return;
            
            const record = {
                id: msgId,
                currentText: currentText,
                detectedAt: new Date().toISOString(),
                source: 'DOM'
            };
            
            const existing = this.editedMessagesFromDOM.find(m => m.id === msgId);
            if (!existing) {
                this.editedMessagesFromDOM.push(record);
            }
            
            this._notifyBackground('edited', record);
        },
        
        _notifyBackground(type, data) {
            chrome.runtime.sendMessage({
                action: 'EXTRACTOR_DOM_DETECTION',
                detectionType: type,
                data: data
            }, () => {});
        },
        
        getDetections() {
            return {
                deleted: this.deletedMessagesFromDOM,
                edited: this.editedMessagesFromDOM
            };
        }
    };

    // ============================================
    // COMUNICAÇÃO COM SCRIPT INJETADO
    // ============================================
    
    const PageBridge = {
        pendingRequests: new Map(),
        requestIdCounter: 0,
        ready: false,
        
        init() {
            window.addEventListener('message', this._handleMessage.bind(this));
        },
        
        _handleMessage(event) {
            if (event.source !== window) return;
            
            const { type, requestId, result, error, changeType, data } = event.data;
            
            switch (type) {
                case 'EXTRACTOR_READY':
                    this.ready = true;
                    console.log('[ExtractorContent] Extractor pronto');
                    break;
                    
                case 'EXTRACTOR_RESPONSE':
                    const pending = this.pendingRequests.get(requestId);
                    if (pending) {
                        if (error) {
                            pending.reject(new Error(error));
                        } else {
                            pending.resolve(result);
                        }
                        this.pendingRequests.delete(requestId);
                    }
                    break;
                    
                case 'EXTRACTOR_PERSIST_DATA':
                    StorageManager.save(data);
                    break;
                    
                case 'EXTRACTOR_LOAD_DATA':
                    StorageManager.load().then(storedData => {
                        if (storedData) {
                            window.postMessage({
                                type: 'EXTRACTOR_STORED_DATA',
                                data: storedData
                            }, '*');
                        }
                    });
                    break;
                    
                case 'EXTRACTOR_MESSAGE_CHANGE':
                    // Notificar background sobre mudança
                    chrome.runtime.sendMessage({
                        action: 'EXTRACTOR_MESSAGE_CHANGE',
                        changeType: changeType,
                        data: data
                    }, () => {});
                    break;
            }
        },
        
        async request(action, params = {}) {
            if (!this.ready) {
                await this._waitForReady();
            }
            
            return new Promise((resolve, reject) => {
                const requestId = ++this.requestIdCounter;
                
                this.pendingRequests.set(requestId, { resolve, reject });
                
                // Timeout - resolve null instead of reject
                setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        this.pendingRequests.delete(requestId);
                        console.warn('[ExtractorContent] Request timeout, resolvendo com null');
                        resolve(null);
                    }
                }, 60000);
                
                window.postMessage({
                    type: 'EXTRACTOR_REQUEST',
                    requestId,
                    action,
                    params
                }, '*');
            });
        },
        
        _waitForReady(timeout = 30000) {
            return new Promise((resolve) => {
                if (this.ready) {
                    resolve();
                    return;
                }
                
                const startTime = Date.now();
                const check = () => {
                    if (this.ready) {
                        resolve();
                        return;
                    }
                    if (Date.now() - startTime > timeout) {
                        console.warn('[ExtractorContent] Timeout aguardando extractor, resolvendo com null');
                        resolve(); // Resolve instead of reject
                        return;
                    }
                    setTimeout(check, 100);
                };
                check();
            });
        }
    };

    // ============================================
    // API EXPOSTA PARA BACKGROUND/POPUP
    // ============================================
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // A maior parte das ações do extractor exige `target: 'extractor_content'`.
        // Entretanto, alguns pontos do código (ex.: popup / versões antigas do bridge)
        // enviavam `action: 'ping'` sem target, fazendo o handshake falhar.
        const isPing = !!(message && message.action === 'ping');
        if (message.target !== 'extractor_content' && !isPing) return;
        
        const handleAsync = async () => {
            try {
                switch (message.action) {
                    case 'extractAllContacts':
                        return await PageBridge.request('extractAllContacts');
                        
                    case 'extractAllChats':
                        return await PageBridge.request('extractAllChats', message.options || {});
                        
                    case 'extractAllGroups':
                        return await PageBridge.request('extractAllGroups');
                        
                    case 'extractAllLabels':
                        return await PageBridge.request('extractAllLabels');
                        
                    case 'extractEverything':
                        return await PageBridge.request('extractEverything', message.options || {});
                        
                    case 'getDeletedMessages':
                        const deletedFromStore = await PageBridge.request('getDeletedMessages');
                        const deletedFromDOM = DOMObserver.deletedMessagesFromDOM;
                        return { fromStore: deletedFromStore, fromDOM: deletedFromDOM };
                        
                    case 'getEditedMessages':
                        const editedFromStore = await PageBridge.request('getEditedMessages');
                        const editedFromDOM = DOMObserver.editedMessagesFromDOM;
                        return { fromStore: editedFromStore, fromDOM: editedFromDOM };
                        
                    case 'extractChatMessages':
                        return await PageBridge.request('extractChatMessages', {
                            chatId: message.chatId,
                            limit: message.limit || 50
                        });
                        
                    case 'extractGroupParticipants':
                        return await PageBridge.request('extractGroupParticipants', {
                            groupId: message.groupId
                        });
                        
                    case 'getDOMDetections':
                        return DOMObserver.getDetections();
                        
                    case 'ping':
                        return { status: 'ok', ready: PageBridge.ready };
                        
                    default:
                        throw new Error('Ação desconhecida: ' + message.action);
                }
            } catch (e) {
                throw e;
            }
        };
        
        handleAsync()
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        
        return true; // Indica resposta assíncrona
    });

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    
    async function initialize() {
        try {
            PageBridge.init();
            await injectScript();
            DOMObserver.init();
            
            console.log('[ExtractorContent] Inicialização completa');
            
            // Notificar background que está pronto
            chrome.runtime.sendMessage({
                action: 'EXTRACTOR_CONTENT_READY'
            }, () => {});
            
        } catch (e) {
            console.error('[ExtractorContent] Erro na inicialização:', e);
        }
    }

    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();