console.log("[WhatsHybrid v2] Background iniciado");

chrome.runtime.onInstalled.addListener((details) => {
  chrome.action.setBadgeBackgroundColor({ color: "#8b5cf6" });
  chrome.contextMenus.create({
    id: "whatsHybrid_save_note",
    title: "Salvar texto no CRM atual",
    contexts: ["selection"]
  });

  // Menu do ícone da extensão (ação) para iniciar backup completo
  try {
    chrome.contextMenus.create({
      id: "whatsHybrid_full_backup",
      title: "💾 Backup WhatsApp (ZIP + Bloqueados)",
      contexts: ["action"]
    });
  } catch (e) {
    // Pode falhar em atualização se já existir; ignora.
  }

  // Initialize trial start if not set
  chrome.storage.sync.get(["firstInstallAt", "licenseStatus"], (data) => {
    if (!data.firstInstallAt) {
      chrome.storage.sync.set({
        firstInstallAt: Date.now(),
        licenseStatus: data.licenseStatus || "free_trial"
      });
    }
  });
});

// única aba de WhatsApp Web
async function ensureSingleWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length > 1) {
    for (let i = 1; i < tabs.length; i++) {
      if (tabs[i].id) chrome.tabs.remove(tabs[i].id);
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.startsWith("https://web.whatsapp.com")) {
    ensureSingleWhatsAppTab();
  }
});

async function queryActiveWhatsAppTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    url: "https://web.whatsapp.com/*"
  });
  return tabs[0];
}

// Retorna QUALQUER aba do WhatsApp (não necessariamente a ativa)
async function queryAnyWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  return tabs && tabs.length ? tabs[0] : null;
}

async function waitForTabReady(tabId, timeoutMs = 30000) {
  try {
    const t = await chrome.tabs.get(tabId);
    if (t && t.status === 'complete') return true;
  } catch (_) {}

  return await new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);

    const listener = (updatedId, changeInfo) => {
      if (updatedId !== tabId) return;
      if (changeInfo.status === 'complete') {
        if (done) return;
        done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function sendMessageWithRetry(tabId, message, attempts = 8, delayMs = 900) {
  for (let i = 0; i < attempts; i++) {
    const ok = await new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, message, () => {
          if (chrome.runtime.lastError) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } catch (e) {
        resolve(false);
      }
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function getOrOpenWhatsAppTab() {
  // Primeiro tenta achar alguma aba já aberta
  const existing = await queryAnyWhatsAppTab();
  if (existing && existing.id) return existing;

  // Se não houver, abre uma nova
  try {
    const created = await chrome.tabs.create({
      url: "https://web.whatsapp.com/",
      active: true
    });
    if (created && created.id) {
      await waitForTabReady(created.id, 30000);
    }
    return created;
  } catch (e) {
    console.warn('Não foi possível abrir WhatsApp Web:', e);
    return null;
  }
}

async function updateBadge() {
  const tab = await queryActiveWhatsAppTab();
  if (!tab || !tab.id) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: "GET_UNREAD_COUNT" });
    if (result && typeof result.count === "number") {
      chrome.action.setBadgeText({ text: result.count > 0 ? String(result.count) : "" });
    }
  } catch (e) {
    // content script ainda não carregado
  }
}

chrome.tabs.onActivated.addListener(() => updateBadge());
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") updateBadge();
});
chrome.alarms.create("badge-refresh", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "badge-refresh") updateBadge();
  if (alarm.name === "tasks-due") checkTasksDue();
});

// Notificações de tarefas vencendo
async function getBackendConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["backendUrl", "extensionKey"], (data) => resolve(data || {}));
  });
}

async function checkTasksDue() {
  const { backendUrl, extensionKey } = await getBackendConfig();
  if (!backendUrl) return;
  try {
    const res = await fetch(`${backendUrl}/tasks/due-soon`, {
      headers: {
        "Content-Type": "application/json",
        "x-extension-key": extensionKey || ""
      }
    });
    if (!res.ok) return;
    const tasks = await res.json();
    tasks.forEach((t) => {
      chrome.notifications.create(`task-${t.id}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Tarefa pendente no WhatsHybrid",
        message: `${t.title} - contato: ${t.dealName || ""}`,
        priority: 1
      });
    });
  } catch (e) {
    console.warn("Erro ao buscar tarefas", e);
  }
}

chrome.alarms.create("tasks-due", { periodInMinutes: 5 });

// Comunicação central -> content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "CONTENT") return false;

  // Forward message to the active WhatsApp tab (if any)
  queryActiveWhatsAppTab()
    .then((tab) => {
      if (!tab || !tab.id) {
        try {
          sendResponse({ success: false, error: "Nenhuma aba ativa do WhatsApp Web encontrada" });
        } catch (_) {}
        return;
      }

      chrome.tabs.sendMessage(tab.id, message, (resp) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          try {
            sendResponse({ success: false, error: err.message || String(err) });
          } catch (_) {}
          return;
        }
        try {
          sendResponse(resp);
        } catch (_) {}
      });
    })
    .catch((e) => {
      try {
        sendResponse({ success: false, error: e?.message || String(e) });
      } catch (_) {}
    });

  return true; // async
});

// Context menu "salvar texto no CRM atual"
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "whatsHybrid_save_note") {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, {
      type: "SAVE_SELECTION_AS_NOTE",
      text: info.selectionText || ""
    });
  }

  if (info.menuItemId === "whatsHybrid_full_backup") {
    // Tenta enviar para uma aba do WhatsApp Web (ativa ou não). Se não existir, abre.
    (async () => {
      const waTab = await getOrOpenWhatsAppTab();
      if (!waTab || !waTab.id) return;
      try { await chrome.tabs.update(waTab.id, { active: true }); } catch (_) {}
      await sendMessageWithRetry(waTab.id, { type: "START_FULL_BACKUP" }, 10, 1000);
    })();
  }
});


// ===== Integrated WhatsApp Web.js background manager (bioenable) =====

// WhatsApp Web.js Manager - Enhanced Background Script
// This script manages the extension's background processes and communication

class WhatsAppBackgroundManager {
    constructor() {
        this.isConnected = false;
        this.currentState = 'UNLAUNCHED';
        this.whatsappTab = null;
        this.sidebarPort = null;
        this.messageQueue = [];
        this.retryCount = 0;
        this.maxRetries = 3;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupSidePanel();
        this.checkWhatsAppTab();
        console.log('WhatsApp Web.js Manager background script initialized');
    }

    setupEventListeners() {
        // Listen for messages from content scripts and popup.
        // IMPORTANTE: o background tem outros listeners que trabalham com `message.type`.
        // Se retornarmos `true` aqui para qualquer mensagem (mesmo sem `action`),
        // podemos manter a porta aberta desnecessariamente e causar timeouts em envs
        // que usam Promises para `sendMessage`.
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // O background possui vários roteadores de mensagens. Para evitar
            // conflitos (ex.: extractor_ui -> background -> extractor_content),
            // este handler deve processar APENAS as ações do manager.
            if (!message || !message.action) {
                // Deixa outros listeners (ex.: CRM/Flows/Extractor) tratarem.
                return;
            }

            // Mensagens com `target` (ex.: extractor_content / CONTENT) ou `type`
            // são tratadas por outros listeners neste mesmo background.
            if (message.target || message.type) {
                return;
            }

            // Lista explícita de actions deste manager.
            const allowedActions = new Set([
                'check_connection',
                'execute_script',
                'whatsapp_event',
                'open_whatsapp',
                'get_extension_info'
            ]);

            if (!allowedActions.has(message.action)) {
                // Não responde aqui para não interceptar ações de outros módulos.
                return;
            }

            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Listen for tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url && tab.url.includes('web.whatsapp.com')) {
                this.whatsappTab = tabId;
                this.retryCount = 0;
                this.checkConnection();
            }
        });

        // Listen for tab removal
        chrome.tabs.onRemoved.addListener((tabId) => {
            if (tabId === this.whatsappTab) {
                this.whatsappTab = null;
                this.isConnected = false;
                this.currentState = 'UNLAUNCHED';
                this.broadcastStateChange();
            }
        });

        // Listen for extension installation/update
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                console.log('WhatsApp Web.js Manager installed');
                this.openWhatsAppTab();
            } else if (details.reason === 'update') {
                console.log('WhatsApp Web.js Manager updated to version', chrome.runtime.getManifest().version);
            }
        });

        // Listen for extension startup
        chrome.runtime.onStartup.addListener(() => {
            console.log('WhatsApp Web.js Manager started');
            this.checkWhatsAppTab();
        });
    }

    setupSidePanel() {
        // Set up side panel
        // Obs: o Side Panel API exige a permissão "sidePanel" no manifest.
        // Para não quebrar a inicialização em ambientes sem a permissão,
        // protegemos a chamada e evitamos sobrescrever o popup por padrão.
        try {
            if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
                const p = chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
                if (p && typeof p.catch === 'function') {
                    p.catch((e) => console.warn('SidePanel setPanelBehavior falhou:', e));
                }
            }
        } catch (e) {
            console.warn('SidePanel indisponível/sem permissão:', e);
        }
    }

    async checkWhatsAppTab() {
        try {
            const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
            if (tabs.length > 0) {
                this.whatsappTab = tabs[0].id;
                return this.whatsappTab;
            }

            // No WhatsApp tab found, create one (await para garantir whatsappTab definido)
            const createdId = await this.openWhatsAppTab();
            return createdId;
        } catch (error) {
            console.error('Error checking WhatsApp tab:', error);
            return null;
        }
    }

    async openWhatsAppTab() {
        try {
            const tab = await chrome.tabs.create({
                url: 'https://web.whatsapp.com/',
                active: true
            });
            this.whatsappTab = tab.id;
            return this.whatsappTab;
        } catch (error) {
            console.error('Error opening WhatsApp tab:', error);
            return null;
        }
    }

    async checkConnection() {
        if (!this.whatsappTab) {
            this.updateConnectionStatus(false, 'NO_TAB');
            return;
        }

        try {
            const response = await this.executeScript({
                type: 'get_connection_state'
            });
            
            // Validate response before using it
            if (response && typeof response === 'object') {
                this.updateConnectionStatus(
                    response.isConnected || false, 
                    response.state || 'UNKNOWN'
                );
            } else {
                console.warn('Invalid connection response:', response);
                this.updateConnectionStatus(false, 'INVALID_RESPONSE');
            }
        } catch (error) {
            console.error('Error checking connection:', error);
            this.updateConnectionStatus(false, 'ERROR');
            
            // Retry if we haven't exceeded max retries
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                setTimeout(() => this.checkConnection(), 2000);
            }
        }
    }

    updateConnectionStatus(isConnected, state) {
        this.isConnected = isConnected;
        this.currentState = state;
        this.retryCount = 0;
        
        this.broadcastStateChange();
    }

    broadcastStateChange() {
        const message = {
            type: 'whatsapp_event',
            data: {
                type: 'state_changed',
                data: {
                    isConnected: this.isConnected,
                    state: this.currentState
                }
            }
        };

        // Broadcast to all extension views.
        // OBS: `chrome.runtime.sendMessage` pode retornar Promise OU void (dependendo do Chrome/API).
        // Evite chamar `.catch` diretamente em `undefined`.
        try {
            const p = chrome.runtime.sendMessage(message);
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {}
        
        // Broadcast to side panel if available
        if (this.sidebarPort) {
            this.sidebarPort.postMessage(message);
        }
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            if (!message || !message.action) {
                return;
            }
            switch (message.action) {
                case 'check_connection':
                    sendResponse({
                        isConnected: this.isConnected,
                        state: this.currentState
                    });
                    break;

                case 'execute_script':
                    const response = await this.executeScript(message.data);
                    sendResponse(response);
                    break;

                case 'whatsapp_event':
                    // Forward WhatsApp events to all extension views
                    this.broadcastWhatsAppEvent(message.data);
                    sendResponse({ success: true });
                    break;

                case 'open_whatsapp':
                    await this.openWhatsAppTab();
                    sendResponse({ success: true });
                    break;

                case 'get_extension_info':
                    sendResponse({
                        version: chrome.runtime.getManifest().version,
                        isConnected: this.isConnected,
                        state: this.currentState,
                        whatsappTab: this.whatsappTab
                    });
                    break;

                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        }
    }

    async executeScript(command) {
        // Garante que existe uma aba do WhatsApp (service worker pode acordar antes do init terminar)
        if (!this.whatsappTab) {
            await this.checkWhatsAppTab();
        }
        if (!this.whatsappTab) {
            throw new Error('WhatsApp tab not found');
        }

        try {
            const response = await chrome.tabs.sendMessage(this.whatsappTab, {
                action: 'execute_script',
                data: command
            });

            if (chrome.runtime.lastError) {
                throw new Error(chrome.runtime.lastError.message);
            }

            return response;
        } catch (error) {
            console.error('Error executing script:', error);
            
            // If content script is not ready, inject it
            if (error.message.includes('Could not establish connection') || 
                error.message.includes('Receiving end does not exist')) {
                
                await this.injectContentScript();
                
                // Retry after a short delay
                await new Promise(resolve => setTimeout(resolve, 1000));
                return await this.executeScript(command);
            }
            
            throw error;
        }
    }

    async injectContentScript() {
        if (!this.whatsappTab) return;

        try {
            // Check if chrome.scripting is available (Manifest V3)
            if (chrome.scripting && chrome.scripting.executeScript) {
                await chrome.scripting.executeScript({
                    target: { tabId: this.whatsappTab },
                    files: ['wweb_content.js']
                });
                console.log('Content script injected via chrome.scripting');
            } else {
                // Fallback for older Chrome versions or Manifest V2
                await chrome.tabs.executeScript(this.whatsappTab, {
                    file: 'wweb_content.js'
                });
                console.log('Content script injected via chrome.tabs.executeScript');
            }
        } catch (error) {
            console.error('Error injecting content script:', error);
            // Try alternative injection method
            try {
                await chrome.tabs.executeScript(this.whatsappTab, {
                    file: 'wweb_content.js'
                });
                console.log('Content script injected via fallback method');
            } catch (fallbackError) {
                console.error('Fallback injection also failed:', fallbackError);
            }
        }
    }

    broadcastWhatsAppEvent(eventData) {
        const message = {
            type: 'whatsapp_event',
            data: eventData
        };

        // Broadcast to all extension views (compatível com Promise/Callback API)
        try {
            const p = chrome.runtime.sendMessage(message);
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {}
        
        // Broadcast to side panel if available
        if (this.sidebarPort) {
            this.sidebarPort.postMessage(message);
        }
    }

    // Side panel connection management
    handleSidePanelConnection(port) {
        this.sidebarPort = port;
        
        port.onMessage.addListener((message) => {
            this.handleSidePanelMessage(message, port);
        });
        
        port.onDisconnect.addListener(() => {
            this.sidebarPort = null;
            console.log('Side panel disconnected');
        });

        // Send current state to side panel
        port.postMessage({
            type: 'whatsapp_event',
            data: {
                type: 'state_changed',
                data: {
                    isConnected: this.isConnected,
                    state: this.currentState
                }
            }
        });

        console.log('Side panel connected');
    }

    async handleSidePanelMessage(message, port) {
        try {
            if (!message || !message.action) {
                return;
            }
            switch (message.action) {
                case 'check_connection':
                    port.postMessage({
                        type: 'connection_status',
                        data: {
                            isConnected: this.isConnected,
                            state: this.currentState
                        }
                    });
                    break;

                case 'execute_script':
                    const response = await this.executeScript(message.data);
                    port.postMessage({
                        type: 'script_response',
                        data: response
                    });
                    break;

                case 'open_whatsapp':
                    await this.openWhatsAppTab();
                    port.postMessage({
                        type: 'whatsapp_opened',
                        data: { success: true }
                    });
                    break;

                default:
                    port.postMessage({
                        type: 'error',
                        data: { error: 'Unknown action' }
                    });
            }
        } catch (error) {
            console.error('Error handling side panel message:', error);
            port.postMessage({
                type: 'error',
                data: { error: error.message }
            });
        }
    }
}

// Initialize background manager
const backgroundManager = new WhatsAppBackgroundManager();

// Handle side panel connections
if (chrome.runtime.onConnect) {
    chrome.runtime.onConnect.addListener((port) => {
        if (port.name === 'sidebar') {
            backgroundManager.handleSidePanelConnection(port);
        }
    });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WhatsAppBackgroundManager;
}
/**
 * =============================
 * Integração com FlowsRuntime e IA
 * =============================
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'FLOWS_RUNTIME_READY':
      console.log('[Background] FlowsRuntime inicializado na tab:', sender.tab?.id);
      // Armazenar tab ID para comunicação futura
      if (chrome.storage && chrome.storage.session) {
        chrome.storage.session.set({ 
          whatsappTabId: sender.tab?.id,
          runtimeReady: true,
        });
      }
      sendResponse && sendResponse({ acknowledged: true });
      break;
    
    case 'AI_GENERATE_REPLY':
      handleAIGenerateReply(message, sendResponse);
      return true; // Manter canal aberto para resposta assíncrona
    
    case 'WEBHOOK_RECEIVED':
      // Repassar para o content script
      forwardToWhatsAppTab(message);
      sendResponse && sendResponse({ forwarded: true });
      break;
    
    case 'GET_FLOWS':
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['quantum_flows'], (result) => {
          sendResponse && sendResponse({ flows: result.quantum_flows || [] });
        });
        return true;
      }
      break;
    
    case 'SAVE_FLOWS':
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ quantum_flows: message.flows }, () => {
          // Notificar runtime para recarregar
          forwardToWhatsAppTab({ type: 'RELOAD_FLOWS' });
          sendResponse && sendResponse({ success: true });
        });
        return true;
      }
      break;
    
    case 'EXECUTE_FLOW':
      forwardToWhatsAppTab({
        type: 'EXECUTE_FLOW_MANUALLY',
        flowId: message.flowId,
        chatId: message.chatId,
      }, sendResponse);
      return true;
    
    case 'GET_RUNTIME_STATUS':
      forwardToWhatsAppTab({ type: 'GET_RUNTIME_STATUS' }, sendResponse);
      return true;
  }
});

/**
 * Gera resposta com IA via BACKEND (não expõe a chave OpenAI no cliente).
 * Requer que a extensão esteja configurada com backendUrl + extensionKey e que
 * exista uma licença válida (x-license-key) com créditos.
 */
async function handleAIGenerateReply(message, sendResponse) {
  const safeReply = (payload) => {
    try { sendResponse && sendResponse(payload); } catch (_) {}
  };

  try {
    if (!chrome.storage || !chrome.storage.sync) {
      safeReply({ error: 'chrome.storage.sync não disponível' });
      return;
    }

    const getSync = (keys) => new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
    const setSync = (obj) => new Promise((resolve) => chrome.storage.sync.set(obj, resolve));

    const cfg = await getSync(['backendUrl', 'extensionKey', 'licenseKey']);
    const backendUrl = (cfg.backendUrl || '').toString().trim().replace(/\/$/, '');
    const extensionKey = (cfg.extensionKey || '').toString().trim();
    const licenseKey = (cfg.licenseKey || '').toString().trim();

    if (!backendUrl) {
      safeReply({ error: 'Backend URL não configurada. Vá em Opções da extensão e configure.' });
      return;
    }
    if (!extensionKey) {
      safeReply({ error: 'EXTENSION_SHARED_KEY não configurada na extensão (extensionKey). Vá em Opções.' });
      return;
    }
    if (!licenseKey) {
      safeReply({ error: 'Licença não encontrada. Abra o painel do CRM e ative sua licença.' });
      return;
    }

    const history = Array.isArray(message.messageHistory) ? message.messageHistory : [];
    const messages = history
      .filter((m) => m && typeof m.body === 'string' && m.body.trim())
      .slice(-20)
      .map((m) => ({
        role: m.fromMe ? 'assistant' : 'user',
        content: m.body
      }));

    const baseSystem = message.systemPrompt || 'Você é um assistente de atendimento via WhatsApp. Responda de forma profissional, cordial e objetiva.';
    const flowInstruction = (message.prompt || '').toString().trim();
    const systemPrompt = flowInstruction
      ? `${baseSystem}\n\nInstrução do fluxo:\n${flowInstruction}\n\nResponda apenas com a mensagem final (sem aspas e sem explicações).`
      : `${baseSystem}\n\nResponda apenas com a mensagem final (sem aspas e sem explicações).`;

    const temperature = (message.config && typeof message.config.temperature === 'number')
      ? message.config.temperature
      : (typeof message.temperature === 'number' ? message.temperature : 0.7);

    const maxTokens = (message.config && typeof message.config.maxTokens === 'number')
      ? message.config.maxTokens
      : (typeof message.maxTokens === 'number' ? message.maxTokens : 500);

    // Se não houver histórico, garante pelo menos 1 mensagem de usuário
    const finalMessages = messages.length
      ? messages
      : [{ role: 'user', content: flowInstruction || 'Gere uma resposta apropriada para a última mensagem.' }];

    const resp = await fetch(`${backendUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-extension-key': extensionKey,
        'x-license-key': licenseKey,
      },
      body: JSON.stringify({
        messages: finalMessages,
        systemPrompt,
        model: message.model || null,
        temperature,
        maxTokens,
      })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      safeReply({ error: data.error || `HTTP ${resp.status}` });
      return;
    }

    if (typeof data.aiCreditsRemaining === 'number') {
      await setSync({ licenseAiCredits: data.aiCreditsRemaining });
    }

    const reply = (data.content || data.reply || '').toString().trim();
    if (!reply) {
      safeReply({ error: 'Resposta vazia da IA' });
      return;
    }

    safeReply({ reply });
  } catch (error) {
    console.error('[Background] Erro em handleAIGenerateReply:', error);
    safeReply({ error: error.message || String(error) });
  }
}

/**
 * Encaminha mensagem para a tab do WhatsApp Web
 */
async function forwardToWhatsAppTab(message, callback) {
  try {
    let tabId = null;

    if (chrome.storage && chrome.storage.session) {
      const data = await chrome.storage.session.get(['whatsappTabId']);
      tabId = data.whatsappTabId;
    }

    const sendToTab = (id) => {
      if (!id || !chrome.tabs || !chrome.tabs.sendMessage) {
        callback && callback({ error: 'tabs API não disponível' });
        return;
      }
      chrome.tabs.sendMessage(id, message, (response) => {
        if (callback) callback(response);
      });
    };

    if (tabId) {
      sendToTab(tabId);
    } else {
      if (!chrome.tabs || !chrome.tabs.query) {
        callback && callback({ error: 'tabs API não disponível' });
        return;
      }
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      if (tabs && tabs.length > 0) {
        const id = tabs[0].id;
        if (chrome.storage && chrome.storage.session) {
          chrome.storage.session.set({ whatsappTabId: id });
        }
        sendToTab(id);
      } else if (callback) {
        callback({ error: 'Tab do WhatsApp não encontrada' });
      }
    }
  } catch (e) {
    console.error('[Background] Erro em forwardToWhatsAppTab:', e);
    callback && callback({ error: e.message });
  }
}

// Detectar quando a tab do WhatsApp carregar (para manter whatsappTabId atualizado)
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    try {
      if (changeInfo.status === 'complete' && tab.url && tab.url.includes('web.whatsapp.com')) {
        if (chrome.storage && chrome.storage.session) {
          chrome.storage.session.set({ whatsappTabId: tabId });
        }
      }
    } catch (e) {
      console.error('[Background] Erro no tabs.onUpdated listener:', e);
    }
  });
}

// Alarme para verificação periódica de flows agendados
if (chrome.alarms && chrome.alarms.create) {
  chrome.alarms.create('flowsScheduleCheck', { periodInMinutes: 1 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'flowsScheduleCheck') {
      forwardToWhatsAppTab({ type: 'SCHEDULE_TICK' });
    }
  });
}

/**
 * ADIÇÕES CRM - Handlers para CRM e Kanban
 */

// ========== INÍCIO DAS ADIÇÕES CRM ==========

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    // === CRM ===
    case 'GET_CRM_CONTACTS':
      chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
        sendResponse({ contacts: result.quantum_crm_contacts || {} });
      });
      return true;

    case 'GET_CRM_CONTACT':
      chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
        const contacts = result.quantum_crm_contacts || {};
        sendResponse({ contact: contacts[message.chatId] });
      });
      return true;

    case 'CREATE_CONTACT':
    case 'UPDATE_CONTACT':
      handleUpdateContact(message, sendResponse);
      return true;

    case 'UPDATE_CONTACT_STAGE':
      handleUpdateContactStage(message, sendResponse);
      return true;

    case 'DELETE_CONTACT':
      handleDeleteContact(message, sendResponse);
      return true;

    case 'GET_STAGES':
      chrome.storage.local.get(['quantum_crm_stages'], (result) => {
        sendResponse({ stages: result.quantum_crm_stages || getDefaultStages() });
      });
      return true;

    case 'UPDATE_STAGES':
      chrome.storage.local.set({ quantum_crm_stages: message.stages }, () => {
        broadcastToWhatsApp({ type: 'CRM_STAGES_UPDATED', stages: message.stages });
        sendResponse({ success: true });
      });
      return true;

    case 'ADD_NOTE':
      handleAddNote(message, sendResponse);
      return true;

    // Abre a página Kanban (dashboard.html) da extensão.
    // Essa ação é disparada pelo painel CRM injetado no WhatsApp (content_main.js).
    // Antes não havia handler, então o botão "Abrir Kanban" não fazia nada.
    case 'OPEN_KANBAN_PAGE':
      openKanbanPage()
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
      return true;

    case 'OPEN_WHATSAPP_CHAT':
      openWhatsAppChat(message.chatId);
      sendResponse({ success: true });
      break;

    case 'CRM_RUNTIME_READY':
      console.log('[Background] CRM Runtime pronto');
      try {
        chrome.storage.session.set({ crmRuntimeReady: true });
      } catch (e) {
        // ignore if not available
      }
      sendResponse({ acknowledged: true });
      break;
  }
});

/**
 * Atualiza/cria contato
 */
function handleUpdateContact(message, sendResponse) {
  const { chatId, data } = message;

  chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
    const contacts = result.quantum_crm_contacts || {};

    const isNew = !contacts[chatId];

    contacts[chatId] = {
      ...(contacts[chatId] || {}),
      id: chatId,
      chatId: chatId,
      ...data,
      updatedAt: new Date().toISOString(),
      createdAt: contacts[chatId]?.createdAt || new Date().toISOString(),
    };

    chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {
      // Notificar WhatsApp tab
      broadcastToWhatsApp({
        type: 'CRM_CONTACT_UPDATED',
        data: { chatId, contact: contacts[chatId] },
      });

      sendResponse({ success: true, contact: contacts[chatId], isNew });
    });
  });
}

/**
 * Atualiza estágio do contato
 */
function handleUpdateContactStage(message, sendResponse) {
  const { chatId, newStage, options = {} } = message;

  chrome.storage.local.get(['quantum_crm_contacts', 'quantum_crm_stages', 'quantum_crm_stage_actions'], (result) => {
    const contacts = result.quantum_crm_contacts || {};
    const stages = result.quantum_crm_stages || getDefaultStages();
    const stageActions = result.quantum_crm_stage_actions || {};

    const contact = contacts[chatId];
    if (!contact) {
      // Criar novo contato
      contacts[chatId] = {
        id: chatId,
        chatId: chatId,
        stage: newStage,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else {
      const previousStage = contact.stage;
      contact.previousStage = previousStage;
      contact.stage = newStage;
      contact.updatedAt = new Date().toISOString();
    }

    chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {
      // Notificar WhatsApp tab
      broadcastToWhatsApp({
        type: 'CRM_STAGE_CHANGED',
        data: {
          chatId,
          previousStage: options.previousStage || contact?.previousStage,
          newStage,
          contact: contacts[chatId],
        },
      });

      sendResponse({ 
        success: true, 
        contact: contacts[chatId],
        previousStage: options.previousStage,
        newStage,
      });
    });
  });
}

/**
 * Deleta contato
 */
function handleDeleteContact(message, sendResponse) {
  const { chatId } = message;

  chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
    const contacts = result.quantum_crm_contacts || {};

    if (contacts[chatId]) {
      delete contacts[chatId];

      chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {
        broadcastToWhatsApp({
          type: 'CRM_CONTACT_DELETED',
          data: { chatId },
        });

        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: false, error: 'Contato não encontrado' });
    }
  });
}

/**
 * Adiciona nota ao contato
 */
function handleAddNote(message, sendResponse) {
  const { chatId, note } = message;

  chrome.storage.local.get(['quantum_crm_contacts'], (result) => {
    const contacts = result.quantum_crm_contacts || {};

    if (!contacts[chatId]) {
      contacts[chatId] = {
        id: chatId,
        chatId: chatId,
        stage: 'new',
        notes: [],
        createdAt: new Date().toISOString(),
      };
    }

    contacts[chatId].notes = contacts[chatId].notes || [];
    contacts[chatId].notes.push({
      id: Date.now().toString(),
      content: note,
      createdAt: new Date().toISOString(),
    });
    contacts[chatId].updatedAt = new Date().toISOString();

    chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {
      sendResponse({ success: true, contact: contacts[chatId] });
    });
  });
}

/**
 * Abre chat no WhatsApp
 */
async function openWhatsAppChat(chatId) {
  const phone = chatId.replace('@c.us', '').replace('@g.us', '');
  const url = `https://web.whatsapp.com/send?phone=${phone}`;

  try {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });

    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { url, active: true });
    } else {
      await chrome.tabs.create({ url });
    }
  } catch (e) {
    console.error('[Background] Erro ao abrir chat do WhatsApp:', e);
  }
}

/**
 * Abre (ou foca) a página Kanban da extensão.
 * Utilizada pelo botão "Abrir Kanban" do painel CRM injetado no WhatsApp.
 */
async function openKanbanPage() {
  const url = chrome.runtime.getURL('dashboard.html');

  try {
    // Procura uma aba já aberta com a página do Kanban
    const tabs = await chrome.tabs.query({ url });

    if (tabs && tabs.length > 0 && tabs[0].id) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      return;
    }

    await chrome.tabs.create({ url });
  } catch (e) {
    console.error('[Background] Erro ao abrir Kanban:', e);
    // Como fallback, tenta abrir sem query (em alguns ambientes o filtro por url pode falhar)
    try {
      await chrome.tabs.create({ url });
    } catch (e2) {
      console.error('[Background] Fallback ao abrir Kanban também falhou:', e2);
      throw e2;
    }
  }
}

/**
 * Envia mensagem para aba do WhatsApp
 */
async function broadcastToWhatsApp(message) {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });

    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, message);
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    console.error('[Background] Erro ao enviar para WhatsApp:', e);
  }
}

/**
 * Estágios padrão do CRM
 */
function getDefaultStages() {
  return [
    { id: 'new', name: 'Novo', color: '#6B7280', icon: '🆕', order: 0 },
    { id: 'lead', name: 'Lead', color: '#3B82F6', icon: '🎯', order: 1 },
    { id: 'contact', name: 'Contato', color: '#8B5CF6', icon: '📞', order: 2 },
    { id: 'negotiation', name: 'Negociação', color: '#F59E0B', icon: '💼', order: 3 },
    { id: 'proposal', name: 'Proposta', color: '#EC4899', icon: '📋', order: 4 },
    { id: 'won', name: 'Ganho', color: '#10B981', icon: '✅', order: 5 },
    { id: 'lost', name: 'Perdido', color: '#EF4444', icon: '❌', order: 6 },
  ];
}

// ========== FIM DAS ADIÇÕES CRM ==========


// ============ METRICS HANDLING (real-time DOM metrics) ============

let metricsState = {
  lastSync: null,
  errors: []
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'METRICS_SYNCED':
      metricsState.lastSync = Date.now();
      console.log('[Background] Métricas sincronizadas:', message.data);
      break;

    case 'METRICS_SYNC_ERROR':
      metricsState.errors.push({
        timestamp: Date.now(),
        error: message.data
      });
      console.error('[Background] Erro de sync:', message.data);
      break;

    case 'GET_METRICS_STATE':
      sendResponse(metricsState);
      return true;
  }
});

// Alarm para verificar sync periódico das métricas
chrome.alarms.create('checkMetricsSync', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkMetricsSync') {
    chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const tab = tabs[0];
      if (!tab.id) return;

      chrome.tabs.sendMessage(tab.id, { type: 'GET_SYNC_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
          return; // content script pode não estar carregado
        }
        if (response && !response.isSyncing) {
          chrome.tabs.sendMessage(tab.id, { type: 'FORCE_SYNC' });
        }
      });
    });
  }
});


// ========== SMART REPLIES / COPILOTO PRO - BACKGROUND ==========

// Cria um alarm diário para eventual execução de rotinas do Copiloto (ex: resumos diários)
chrome.runtime.onInstalled.addListener((details) => {
  try {
    const hour = 18; // 18h horário local do navegador
    const now = new Date();
    const first = new Date();
    first.setHours(hour, 0, 0, 0);
    if (first.getTime() <= now.getTime()) {
      first.setDate(first.getDate() + 1);
    }
    chrome.alarms.create('dailySummaryAlarm', {
      when: first.getTime(),
      periodInMinutes: 24 * 60
    });
    console.log('[Background] Alarm dailySummaryAlarm configurado');
  } catch (e) {
    console.warn('[Background] Erro ao configurar alarm dailySummaryAlarm:', e);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailySummaryAlarm') {
    console.log('[Background] Disparou dailySummaryAlarm (placeholder Copiloto Pro)');
    // Aqui poderíamos enviar mensagem para a aba ativa gerar resumos,
    // mantendo a lógica simples e no content script.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'GENERATE_DAILY_SUMMARY' }, () => {
          // Ignora erros de falta de listener
          if (chrome.runtime.lastError) {
            console.debug('[Background] Nenhum listener para GENERATE_DAILY_SUMMARY:', chrome.runtime.lastError.message);
          }
        });
      }
    });
  }
});

// Encaminhamento de comandos do popup/opções para o content script do WhatsApp
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  const relayTypes = [
    'SR_GET_STATS',
    'SR_SET_MODE',
    'SR_SET_PERSONA',
    'SR_FORCE_SUGGESTIONS'
  ];

  if (!relayTypes.includes(message.type) && message.type !== 'GENERATE_DAILY_SUMMARY') {
    return;
  }

  // Se a mensagem já veio de um content script, não redespachar
  if (sender && sender.tab && relayTypes.includes(message.type)) {
    return;
  }

  if (message.type === 'GENERATE_DAILY_SUMMARY') {
    // Já tratado acima no handler de alarm; aqui apenas confirmamos o recebimento
    sendResponse && sendResponse({ ok: true });
    return true;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      sendResponse && sendResponse({ ok: false, error: 'Nenhuma aba ativa encontrada' });
      return;
    }

    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        console.debug('[Background] Erro ao enviar para content script:', chrome.runtime.lastError.message);
        sendResponse && sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse && sendResponse(response);
    });
  });

  return true; // Indica que a resposta será enviada de forma assíncrona
});


// ============================================
// EXTRACTOR MESSAGE HANDLERS (Fase 6)
// ============================================

// Armazenamento de mensagens detectadas
let extractorData = {
    deletedMessages: [],
    editedMessages: [],
    lastUpdated: null
};

// Carregar dados salvos
chrome.storage.local.get('extractor_detected_messages', (result) => {
    if (result.extractor_detected_messages) {
        extractorData = result.extractor_detected_messages;
    }
});

// Handler para mensagens do extractor
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    // Redirecionar mensagens para o content script do extractor
    if (message.target === 'extractor_content') {
        chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
            const tab = (tabs && tabs.length > 0) ? tabs[0] : null;
            if (!tab || !tab.id) {
                if (typeof sendResponse === 'function') {
                    sendResponse({ success: false, error: 'WhatsApp Web não encontrado' });
                }
                return;
            }

            chrome.tabs.sendMessage(tab.id, message, (resp) => {
                const err = chrome.runtime?.lastError;
                if (err) {
                    if (typeof sendResponse === 'function') {
                        sendResponse({ success: false, error: err.message || String(err) });
                    }
                    return;
                }
                if (typeof sendResponse === 'function') {
                    sendResponse(resp);
                }
            });
        });
        return true;
    }
    
    // Handler para mudanças de mensagens detectadas
    if (message.action === 'EXTRACTOR_MESSAGE_CHANGE') {
        handleMessageChange(message.changeType, message.data);
        return false; // Sync response
    }
    
    // Handler para detecção via DOM
    if (message.action === 'EXTRACTOR_DOM_DETECTION') {
        handleMessageChange(message.detectionType, message.data);
        return false; // Sync response
    }
    
    // Handler para content script pronto
    if (message.action === 'EXTRACTOR_CONTENT_READY') {
        console.log('[Background] Extractor content script pronto na tab:', sender.tab?.id);
        return false; // Sync response
    }
    
    // Handler para obter dados do extractor
    if (message.action === 'GET_EXTRACTOR_DATA') {
        if (typeof sendResponse === 'function') {
            sendResponse({ success: true, data: extractorData });
        }
        return true; // Async response
    }
    
    // Handler para limpar dados do extractor
    if (message.action === 'CLEAR_EXTRACTOR_DATA') {
        extractorData = {
            deletedMessages: [],
            editedMessages: [],
            lastUpdated: null
        };
        chrome.storage.local.remove('extractor_detected_messages');
        if (typeof sendResponse === 'function') {
            sendResponse({ success: true });
        }
        return;
    }
});

// Processar mudança de mensagem
function handleMessageChange(type, data) {
    if (type === 'deleted') {
        // Verificar se já existe
        const exists = extractorData.deletedMessages.some(m => m.id === data.id);
        if (!exists) {
            extractorData.deletedMessages.push(data);
            
            // Notificação
            if (chrome.notifications) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Mensagem Apagada Detectada',
                    message: `De: ${data.from || 'Desconhecido'}\nConteúdo salvo.`
                });
            }
        }
    } else if (type === 'edited') {
        const existing = extractorData.editedMessages.find(m => m.id === data.id);
        if (existing) {
            // Adicionar ao histórico de edições
            if (!existing.editHistory) {
                existing.editHistory = [];
            }
            existing.editHistory.push(data);
        } else {
            extractorData.editedMessages.push({
                ...data,
                editHistory: [data]
            });
        }
    }
    
    extractorData.lastUpdated = new Date().toISOString();
    
    // Persistir
    chrome.storage.local.set({ extractor_detected_messages: extractorData });
    
    // Notificar popup/dashboard se abertos
    chrome.runtime.sendMessage({
        action: 'EXTRACTOR_DATA_UPDATED',
        data: extractorData
    }, () => {});
}

// ============================================
// CONTEXT MENU PARA EXTRATOR (Opcional)
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
    chrome.contextMenus.create({
        id: 'open-extractor',
        title: 'Abrir Extrator de Dados',
        contexts: ['page'],
        documentUrlPatterns: ['https://web.whatsapp.com/*']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'open-extractor') {
        chrome.tabs.sendMessage(tab.id, {
            action: 'TOGGLE_EXTRACTOR_PANEL'
        });
    }
});

// ============================================
// ALARM PARA BACKUP PERIÓDICO (Opcional)
// ============================================

chrome.alarms.create('extractor-backup', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'extractor-backup') {
        // Auto-backup dos dados detectados
        if (extractorData.deletedMessages.length > 0 || extractorData.editedMessages.length > 0) {
            chrome.storage.local.set({
                extractor_auto_backup: {
                    ...extractorData,
                    backupDate: new Date().toISOString()
                }
            });
        }
    }
});

// === Metrics real: registra timestamp + versão da instalação/atualização (para filtrar métricas) ===
chrome.runtime.onInstalled.addListener((details) => {
  try {
    const INSTALL_TS_KEY = "quantum_install_timestamp";
    const INSTALL_VER_KEY = "quantum_install_version";
    const PREV_TS_KEY = "quantum_install_previous_timestamp";
    const PREV_VER_KEY = "quantum_install_previous_version";

    const reason = (details && details.reason) || "unknown";
    if (reason === "install" || reason === "update") {
      const now = Date.now();
      const currentVersion = chrome.runtime?.getManifest?.().version || "unknown";

      chrome.storage.local.get([INSTALL_TS_KEY, INSTALL_VER_KEY], (prev) => {
        const payload = {
          [INSTALL_TS_KEY]: now,
          [INSTALL_VER_KEY]: currentVersion
        };

        if (prev && prev[INSTALL_TS_KEY]) payload[PREV_TS_KEY] = prev[INSTALL_TS_KEY];
        if (prev && prev[INSTALL_VER_KEY]) payload[PREV_VER_KEY] = prev[INSTALL_VER_KEY];

        chrome.storage.local.set(payload, () => {
          // Em update, limpamos métricas antigas para evitar mistura entre versões.
          if (reason === "update") {
            chrome.storage.local.remove([
              "quantum_msg_stats",
              "messageHistory",
              "messageStats",
              "metricsData",
              "metricsBuckets"
            ]);
          }
        });
      });
    }
  } catch (e) {
    console.warn("[WhatsHybrid] Falha ao registrar install timestamp/version:", e);
  }
});


// Global error capture (background service worker) - registra erros e promise rejections
self.addEventListener('unhandledrejection', (event) => {
  try {
    console.error('[Background] Unhandled Promise Rejection:', event.reason);
    reportExtensionError({ type: 'unhandledrejection', error: (event.reason && event.reason.message) ? event.reason.message : String(event.reason) });
  } catch (e) {
    // ignore
  }
});

self.addEventListener('error', (event) => {
  try {
    console.error('[Background] Uncaught error:', event.error || event.message);
    reportExtensionError({
      type: 'error',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: (event.error && event.error.message) ? event.error.message : String(event.error || event.message)
    });
  } catch (e) {
    // ignore
  }
});

// Tenta enviar o erro para o backend configurado, ou salva localmente para ser revisado
async function reportExtensionError(payload) {
  try {
    const cfg = await new Promise((resolve) => chrome.storage.sync.get(['backendUrl','extensionKey'], resolve));
    const backendUrl = (cfg && cfg.backendUrl) ? String(cfg.backendUrl).trim().replace(/\/$/, '') : '';
    const extensionKey = (cfg && cfg.extensionKey) ? String(cfg.extensionKey).trim() : '';

    const body = JSON.stringify({
      ...payload,
      ts: new Date().toISOString(),
      version: chrome.runtime.getManifest().version || 'unknown'
    });

    if (backendUrl) {
      fetch(`${backendUrl}/events/extension-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-extension-key': extensionKey || '' },
        body
      }).catch(() => {});
    } else {
      // salva localmente para inspeção manual
      chrome.storage.local.get(['extension_errors'], (res) => {
        const arr = res && res.extension_errors ? res.extension_errors : [];
        arr.push({ ...payload, ts: new Date().toISOString() });
        chrome.storage.local.set({ extension_errors: arr });
      });
    }
  } catch (e) {
    // ignore
  }
}

// Allow content scripts/pages to report errors to background for centralized handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (msg && msg.type === 'EXTENSION_ERROR') {
      reportExtensionError(msg.payload || {});
    }
  } catch (e) {}
});

// Flush stored extension errors to backend (if configured)
async function flushStoredErrors() {
  try {
    chrome.storage.local.get(['extension_errors'], async (res) => {
      const arr = res && res.extension_errors ? res.extension_errors : [];
      if (!arr || arr.length === 0) return;

      const cfg = await new Promise((resolve) => chrome.storage.sync.get(['backendUrl','extensionKey'], resolve));
      const backendUrl = (cfg && cfg.backendUrl) ? String(cfg.backendUrl).trim().replace(/\/$/, '') : '';
      const extensionKey = (cfg && cfg.extensionKey) ? String(cfg.extensionKey).trim() : '';
      if (!backendUrl) return;

      try {
        await fetch(`${backendUrl}/events/extension-error/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-extension-key': extensionKey || '' },
          body: JSON.stringify({ errors: arr })
        });
        chrome.storage.local.remove('extension_errors');
      } catch (e) {
        // ignore
      }
    });
  } catch (e) {
    // ignore
  }
}

// Attempt to flush on startup
flushStoredErrors();

