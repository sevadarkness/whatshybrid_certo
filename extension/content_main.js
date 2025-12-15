
// Toast Notification System
function showToast(message, duration = 3000) {
    // Preferir o NotificationCenter (quando disponível)
    try {
        if (window.NotificationCenter?.info) {
            window.NotificationCenter.info('', message, { duration });
            return;
        }
    } catch (e) {
        // Fallback silencioso
    }

    let toast = document.createElement('div');
    toast.innerText = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(40, 40, 50, 0.95)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 22px';
    toast.style.borderRadius = '7px';
    toast.style.zIndex = 99999;
    toast.style.fontSize = '15px';
    toast.style.boxShadow = '0 2px 12px rgba(0,0,0,0.16)';
    document.body.appendChild(toast);
    setTimeout(()=>{toast.remove();}, duration);
}


// ---------------------------------------------------------------------------
// Feedback da IA (aprendizado contínuo)
// - Detecta envio e marca como "aprovado" (igual) ou "editado" (diferente)
// - Também mostra um mini painel para feedback manual (boa / editei / ruim)
// ---------------------------------------------------------------------------
let __whAiFeedbackHooksInstalled = false;

function normalizeTextForCompare(t) {
    return String(t || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function sendAiFeedback({ interactionId, chatExternalId, feedbackType, editedText, originalText }) {
    try {
        const config = await new Promise((resolve) => {
            chrome.storage.sync.get(['backendUrl', 'extensionKey', 'licenseKey'], resolve);
        });

        if (!config?.backendUrl || !config?.licenseKey) return;

        await fetch(`${config.backendUrl}/ai/training/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-extension-key': config.extensionKey || '',
                'x-license-key': config.licenseKey
            },
            body: JSON.stringify({
                interactionId: interactionId || null,
                chatExternalId: chatExternalId || null,
                feedbackType,
                editedText: editedText || null,
                originalText: originalText || null
            })
        }).catch(() => {});
    } catch (e) {
        // silencioso
    }
}

function getSendButtonFromTarget(target) {
    try {
        const btn = target?.closest?.('button');
        if (!btn) return null;

        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        const testid = (btn.getAttribute('data-testid') || '').toLowerCase();

        if (aria.includes('enviar') || aria.includes('send')) return btn;
        if (testid === 'send') return btn;
        if (btn.querySelector?.('[data-icon="send"], [data-testid="send"]')) return btn;

        return null;
    } catch (_) {
        return null;
    }
}

function showAiFeedbackPanel(last) {
    try {
        let panel = document.getElementById('whAiFeedbackPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'whAiFeedbackPanel';
            panel.style.position = 'fixed';
            panel.style.right = '14px';
            panel.style.bottom = '14px';
            panel.style.zIndex = '999999';
            panel.style.padding = '10px 12px';
            panel.style.borderRadius = '12px';
            panel.style.background = 'rgba(15, 23, 42, 0.92)';
            panel.style.border = '1px solid rgba(148, 163, 184, 0.35)';
            panel.style.boxShadow = '0 18px 50px rgba(0,0,0,0.45)';
            panel.style.color = '#E2E8F0';
            panel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
            panel.style.fontSize = '12px';
            panel.style.maxWidth = '320px';

            const title = document.createElement('div');
            title.textContent = 'A resposta da IA ajudou?';
            title.style.fontWeight = '700';
            title.style.marginBottom = '8px';

            const btnRow = document.createElement('div');
            btnRow.style.display = 'flex';
            btnRow.style.gap = '8px';
            btnRow.style.flexWrap = 'wrap';

            function mkBtn(label) {
                const b = document.createElement('button');
                b.textContent = label;
                b.style.padding = '6px 10px';
                b.style.borderRadius = '10px';
                b.style.border = '1px solid rgba(148,163,184,0.35)';
                b.style.background = 'rgba(2,6,23,0.55)';
                b.style.color = '#E2E8F0';
                b.style.cursor = 'pointer';
                b.style.fontSize = '12px';
                return b;
            }

            const okBtn = mkBtn('👍 Boa');
            const editBtn = mkBtn('✍️ Editei');
            const badBtn = mkBtn('👎 Ruim');
            const closeBtn = mkBtn('Fechar');
            closeBtn.style.opacity = '0.85';

            okBtn.addEventListener('click', async () => {
                if (last?.__feedbackSent) return;
                last.__feedbackSent = true;
                await sendAiFeedback({ interactionId: last.interactionId, chatExternalId: last.chatExternalId, feedbackType: 'approved', originalText: last.text });
                panel.remove();
                showToast('Feedback enviado 👍', 1800);
            });
            editBtn.addEventListener('click', async () => {
                if (last?.__feedbackSent) return;
                last.__feedbackSent = true;
                await sendAiFeedback({ interactionId: last.interactionId, chatExternalId: last.chatExternalId, feedbackType: 'edited', originalText: last.text });
                panel.remove();
                showToast('Feedback enviado ✍️', 1800);
            });
            badBtn.addEventListener('click', async () => {
                if (last?.__feedbackSent) return;
                last.__feedbackSent = true;
                await sendAiFeedback({ interactionId: last.interactionId, chatExternalId: last.chatExternalId, feedbackType: 'rejected', originalText: last.text });
                panel.remove();
                showToast('Feedback enviado 👎', 1800);
            });
            closeBtn.addEventListener('click', () => {
                panel.remove();
            });

            btnRow.appendChild(okBtn);
            btnRow.appendChild(editBtn);
            btnRow.appendChild(badBtn);
            btnRow.appendChild(closeBtn);

            panel.appendChild(title);
            panel.appendChild(btnRow);

            document.body.appendChild(panel);
        } else {
            // atualiza "session" e mantém botões
        }

        // auto-remove após 25s (se não interagir)
        setTimeout(() => {
            try { panel?.remove(); } catch (_) {}
        }, 25000);
    } catch (_) {}
}

function setupAiFeedbackHooks() {
    if (__whAiFeedbackHooksInstalled) return;
    __whAiFeedbackHooksInstalled = true;

    // Click no botão enviar
    document.addEventListener('click', (e) => {
        const last = window.__whAiLastSuggestion;
        if (!last || last.__feedbackSent) return;
        if (!last.text || !last.chatExternalId) return;
        if (Date.now() - (last.at || 0) > 15 * 60 * 1000) return;

        const btn = getSendButtonFromTarget(e.target);
        if (!btn) return;

        // Captura o texto antes do envio (a caixa ainda contém a mensagem)
        const box = getMessageBox();
        const finalText = normalizeTextForCompare(box?.innerText || box?.textContent || '');
        const origText = normalizeTextForCompare(last.text || '');
        if (!finalText) return;

        const feedbackType = finalText === origText ? 'approved' : 'edited';
        last.__feedbackSent = true;

        sendAiFeedback({
            interactionId: last.interactionId,
            chatExternalId: last.chatExternalId,
            feedbackType,
            editedText: feedbackType === 'edited' ? finalText : null,
            originalText: origText
        });

        // não apaga imediatamente para evitar duplicidade com enter/click duplicados
        setTimeout(() => { try { window.__whAiLastSuggestion = null; } catch (_) {} }, 500);
    }, true);

    // Envio via Enter (sem Shift)
    document.addEventListener('keydown', (e) => {
        const last = window.__whAiLastSuggestion;
        if (!last || last.__feedbackSent) return;
        if (!last.text || !last.chatExternalId) return;
        if (Date.now() - (last.at || 0) > 15 * 60 * 1000) return;

        if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
            const box = getMessageBox();
            const isInBox = box && (e.target === box || box.contains(e.target));
            if (!isInBox) return;

            const finalText = normalizeTextForCompare(box?.innerText || box?.textContent || '');
            const origText = normalizeTextForCompare(last.text || '');
            if (!finalText) return;

            const feedbackType = finalText === origText ? 'approved' : 'edited';
            last.__feedbackSent = true;

            sendAiFeedback({
                interactionId: last.interactionId,
                chatExternalId: last.chatExternalId,
                feedbackType,
                editedText: feedbackType === 'edited' ? finalText : null,
                originalText: origText
            });

            setTimeout(() => { try { window.__whAiLastSuggestion = null; } catch (_) {} }, 500);
        }
    }, true);
}



console.log("[WhatsHybrid v3] content_main carregado");

// Global error capture for content_main
(function(){
  function sendErrToBg(payload) {
    try {
      chrome.runtime.sendMessage({ type: 'EXTENSION_ERROR', payload });
    } catch (e) {
      // fallback save locally
      try {
        chrome.storage.local.get(['extension_errors'], (res) => {
          const arr = res && res.extension_errors ? res.extension_errors : [];
          arr.push({ ...payload, ts: new Date().toISOString() });
          chrome.storage.local.set({ extension_errors: arr });
        });
      } catch(_){}
    }
  }

  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const payload = { type: 'unhandledrejection', message: ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason), stack: ev.reason && ev.reason.stack ? ev.reason.stack : null, url: location.href, ua: navigator.userAgent };
      console.error('[content_main] unhandledrejection', payload);
      sendErrToBg(payload);
    } catch(_){}
  });

  window.addEventListener('error', (ev) => {
    try {
      const payload = { type: 'error', message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, stack: ev.error && ev.error.stack ? ev.error.stack : null, url: location.href, ua: navigator.userAgent };
      console.error('[content_main] error', payload);
      sendErrToBg(payload);
    } catch(_){}
  });
})();


let config = {
  backendUrl: "",
  extensionKey: "",
  licenseKey: "",
  pipelineStages: ["Novo", "Em contato", "Em negociação", "Fechado", "Perdido"],
  defaultTags: [],
  aiEnabled: true,
  aiTone: "profissional",
  quickRepliesRaw: "",
  insightsEnabled: true
};

// Estado do chat atual (obtido via inject.js / QUANTUM_INJECT)
let __whatsHybridCurrentChatId = null;

// Nome/assinatura do operador (configurado nas opções da extensão)
let __whatsHybridOperatorName = "atendente";

// Captura chatId atual enviado pelo inject.js (quando disponível)
try {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.source !== "QUANTUM_INJECT") return;
    if (d.type === "CURRENT_CHAT_ID" && d.chatId) {
      __whatsHybridCurrentChatId = d.chatId;
    }
  });
} catch (e) {}

// Carregar nome do operador do storage local (usado em {{vendedor}})
try {
  chrome.storage.local.get(["userName"], (localData) => {
    if (localData && typeof localData.userName === "string" && localData.userName.trim()) {
      __whatsHybridOperatorName = localData.userName.trim();
    }
  });
} catch (e) {}

// Atualizar config em tempo real quando o usuário salva opções/licença (evita precisar recarregar o WhatsApp Web)
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (changes.backendUrl) config.backendUrl = changes.backendUrl.newValue || "";
      if (changes.extensionKey) config.extensionKey = changes.extensionKey.newValue || "";
      if (changes.licenseKey) config.licenseKey = changes.licenseKey.newValue || "";

      if (changes.pipelineStages && Array.isArray(changes.pipelineStages.newValue)) {
        config.pipelineStages = changes.pipelineStages.newValue;
      }
      if (changes.defaultTags && Array.isArray(changes.defaultTags.newValue)) {
        config.defaultTags = changes.defaultTags.newValue;
      }
      if (changes.aiEnabled && typeof changes.aiEnabled.newValue === "boolean") {
        config.aiEnabled = changes.aiEnabled.newValue;
      }
      if (changes.aiTone && changes.aiTone.newValue) {
        config.aiTone = changes.aiTone.newValue;
      }
      if (changes.quickReplies && typeof changes.quickReplies.newValue === "string") {
        config.quickRepliesRaw = changes.quickReplies.newValue;
      }
      if (changes.insightsEnabled && typeof changes.insightsEnabled.newValue === "boolean") {
        config.insightsEnabled = changes.insightsEnabled.newValue;
      }

      // Reaplicar UI (quando existir)
      try {
        if (typeof ensureAiAndQuickUI === "function") ensureAiAndQuickUI();
      } catch (_) {}
      // Atualizar status de plano/créditos no painel (quando existir)
      try {
        const watchedLic = ['licenseStatus','licensePlan','licenseAiEnabled','licenseAiCredits','licenseKey','licenseIsMaster'];
        if (watchedLic.some(k => !!changes[k])) {
          if (typeof whEnsureLicenseLoadedInPanel === 'function') whEnsureLicenseLoadedInPanel();
        }
      } catch (_) {}
      try {
        if (typeof updateCrmPanel === "function" && document.getElementById("whatsHybrid-crm-panel")) updateCrmPanel();
      } catch (_) {}
    }

    if (area === "local") {
      if (changes.userName && typeof changes.userName.newValue === "string") {
        __whatsHybridOperatorName = (changes.userName.newValue || "").trim() || "atendente";
      }
    }
  });
} catch (e) {}


chrome.storage.sync.get(
  [
    "backendUrl",
    "extensionKey",
    "licenseKey",
    "pipelineStages",
    "defaultTags",
    "aiEnabled",
    "aiTone",
    "quickReplies",
    "insightsEnabled",
    "licenseAiEnabled",
    "licenseAiCredits"
  ],
  (data) => {
    if (data.backendUrl) config.backendUrl = data.backendUrl;
    if (data.extensionKey) config.extensionKey = data.extensionKey;
    if (data.licenseKey) config.licenseKey = data.licenseKey;
    if (data.licenseAiEnabled === true) config.aiEnabled = true;
    if (Array.isArray(data.pipelineStages) && data.pipelineStages.length) {
      config.pipelineStages = data.pipelineStages;
    }
    if (Array.isArray(data.defaultTags)) config.defaultTags = data.defaultTags;
    if (typeof data.aiEnabled === "boolean") config.aiEnabled = data.aiEnabled;
    if (data.aiTone) config.aiTone = data.aiTone;
    if (data.quickReplies) config.quickRepliesRaw = data.quickReplies;
    if (typeof data.insightsEnabled === "boolean") config.insightsEnabled = data.insightsEnabled;
  }
);

// Util: contato + chat
function getCurrentContactName() {
  const header = document.querySelector("header span[title]");
  if (header) return header.getAttribute("title");
  return null;
}

function getCurrentChatIdFallback() {
  if (__whatsHybridCurrentChatId) return __whatsHybridCurrentChatId;
  const name = getCurrentContactName();
  if (!name) return null;
  return "chat:" + name;
}

// Unread count
function getUnreadCount() {
  const badges = document.querySelectorAll("span[aria-label][data-testid='icon-unread-count']");
  let total = 0;
  badges.forEach((b) => {
    const text = b.textContent;
    const n = parseInt(text || "0", 10);
    if (!isNaN(n)) total += n;
  });
  return total;
}

// QUICK REPLIES
function parseQuickReplies() {
  const map = [];
  const raw = config.quickRepliesRaw || "";
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const parts = trimmed.split("=>");
    if (parts.length < 2) return;
    const key = parts[0].trim();
    const msg = parts.slice(1).join("=>").trim();
    if (!key || !msg) return;
    map.push({ key, msg });
  });
  return map;
}

function fillTemplate(template) {
  const name = getCurrentContactName() || "cliente";
  const phone = "";
  const vendedor = __whatsHybridOperatorName || "atendente";
  return template
    .replace(/\{\{nome\}\}/gi, name)
    .replace(/\{\{telefone\}\}/gi, phone)
    .replace(/\{\{vendedor\}\}/gi, vendedor);
}

function getMessageBox() {
  return (
    document.querySelector('[contenteditable="true"][data-tab="10"]') ||
    document.querySelector('[contenteditable="true"][data-tab="6"]') ||
    document.querySelector('[contenteditable="true"][data-tab="1"]')
  );
}

function fillMessageBox(text) {
  const editableDiv = getMessageBox();
  if (!editableDiv) {
    showToast("Não encontrei o campo de mensagem do WhatsApp Web.");
    return;
  }
  editableDiv.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
  const event = new InputEvent("input", { bubbles: true });
  editableDiv.textContent = text;
  editableDiv.dispatchEvent(event);
}


// ===== License & Trial helpers (content script) =====
const WH_TRIAL_DAYS = 3;
const WH_MASTER_KEY = "Cristi@no123";
const WH_MASTER_AI_CREDITS = 2147483647;

function whGetClientId(callback) {
  try {
    chrome.storage.sync.get(["whClientId"], (data) => {
      if (data.whClientId) {
        callback(data.whClientId);
        return;
      }
      const id = "whc_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      chrome.storage.sync.set({ whClientId: id }, () => callback(id));
    });
  } catch (e) {
    callback("whc_fallback");
  }
}

function whGetLicenseState(callback) {
  chrome.storage.sync.get(
    [
      "firstInstallAt",
      "licenseKey",
      "licenseStatus",
      "licensePlan",
      "licenseMessage",
      "licenseAiEnabled",
      "licenseAiCredits",
      "licenseIsMaster"
    ],
    (data) => {
      const firstInstallAt = data.firstInstallAt || Date.now();
      const diffMs = Date.now() - firstInstallAt;
      const days = diffMs / (1000 * 60 * 60 * 24);
      const licenseKey = (data.licenseKey || "").toString().trim();
      const isMaster = licenseKey === WH_MASTER_KEY || data.licenseIsMaster === true;
      const isLicensed = data.licenseStatus === "licensed" || isMaster;
      const isTrialActive = !isLicensed && days <= WH_TRIAL_DAYS;
      const aiEnabled = isMaster ? true : (data.licenseAiEnabled === true);
      const aiCredits = isMaster
        ? (typeof data.licenseAiCredits === "number" ? data.licenseAiCredits : WH_MASTER_AI_CREDITS)
        : (typeof data.licenseAiCredits === "number" ? data.licenseAiCredits : null);
      callback({
        firstInstallAt,
        licenseKey,
        licenseStatus: isMaster ? "licensed" : (data.licenseStatus || (isLicensed ? "licensed" : "free_trial")),
        licensePlan: isMaster ? "enterprise" : (data.licensePlan || null),
        licenseMessage: data.licenseMessage || "",
        isLicensed,
        isTrialActive,
        aiEnabled,
        aiCredits,
        isMaster,
        TRIAL_DAYS: WH_TRIAL_DAYS,
        daysUsed: days
      });
    }
  );
}

function whEnsureLicenseLoadedInPanel() {
  const statusEl = document.getElementById("whatsHybrid-license-status");
  const inputEl = document.getElementById("whatsHybrid-license-key");
  const planStatusEl = document.getElementById("whatsHybrid-license-plan-status");
  const tokensEl = document.getElementById("whatsHybrid-license-tokens");
  if (!statusEl || !inputEl) return;
  whGetLicenseState((state) => {
    inputEl.value = state.licenseKey || "";
    const isPlanActive = !!(state.isLicensed || state.isTrialActive || state.isMaster);

    if (planStatusEl) {
      planStatusEl.textContent = isPlanActive ? "Ativo" : "Inativo";
      planStatusEl.style.color = isPlanActive ? "#c4b5fd" : "#fecaca";
    }

    if (tokensEl) {
      tokensEl.textContent = (typeof state.aiCredits === "number") ? String(state.aiCredits) : "—";
    }

    if (state.isMaster) {
      statusEl.textContent = "Master key ativa. Recursos liberados.";
      statusEl.style.color = "#c4b5fd";
    } else if (state.isLicensed) {
      statusEl.textContent = "Plano ativo.";
      statusEl.style.color = "#93c5fd";
    } else if (state.isTrialActive) {
      const remaining = Math.max(0, WH_TRIAL_DAYS - Math.floor(state.daysUsed));
      statusEl.textContent = "Modo gratuito ativo. Dias restantes: " + remaining;
      statusEl.style.color = "#e5e7eb";
    } else {
      statusEl.textContent = "Plano inativo. Insira uma chave para liberar recursos.";
      statusEl.style.color = "#fecaca";
    }
  });
}

function whValidateLicenseFromPanel() {
  const inputEl = document.getElementById("whatsHybrid-license-key");
  const statusEl = document.getElementById("whatsHybrid-license-status");
  if (!inputEl || !statusEl) return;
  const key = inputEl.value.trim();
  if (!key) {
    statusEl.textContent = "Insira uma chave de acesso.";
    statusEl.style.color = "#fecaca";
    return;
  }

  // Master key: ativa localmente (não depende de backend) e libera tudo.
  if (key === WH_MASTER_KEY) {
    try {
      chrome.storage.sync.set(
        {
          licenseKey: key,
          licenseIsMaster: true,
          licenseStatus: "licensed",
          licensePlan: "enterprise",
          licenseMessage: "Master key ativa",
          licenseAiEnabled: true,
          licenseAiCredits: WH_MASTER_AI_CREDITS
        },
        () => {
          statusEl.textContent = "Master key ativada. Recursos liberados.";
          statusEl.style.color = "#c4b5fd";
          showToast("Master key ativada!");
          try { whEnsureLicenseLoadedInPanel(); } catch (_) {}
        }
      );
    } catch (e) {
      statusEl.textContent = "Falha ao ativar master key.";
      statusEl.style.color = "#fecaca";
    }
    return;
  }
  if (!config.backendUrl) {
    statusEl.textContent = "Configure a URL do backend nas opções da extensão.";
    statusEl.style.color = "#fecaca";
    return;
  }
  whGetClientId((clientId) => {
    fetch(`${config.backendUrl}/license/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ key, clientId })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.valid) {
          chrome.storage.sync.set(
            {
              licenseKey: key,
              licenseIsMaster: false,
              licenseStatus: "licensed",
              licensePlan: data.plan || "empreendedor_mensal",
              licenseMessage: "Licença ativa",
              licenseAiEnabled: data.aiEnabled === true,
              licenseAiCredits: typeof data.aiCredits === "number" ? data.aiCredits : null
            },
            () => {
              statusEl.textContent = "Licença validada com sucesso. Recursos premium liberados.";
              statusEl.style.color = "#93c5fd";
              showToast("Plano Empreendedor ativado com sucesso!");
              try { whEnsureLicenseLoadedInPanel(); } catch (_) {}
            }
          );
        } else {
          const msg = data && data.message ? data.message : "Chave inválida ou já em uso em outro dispositivo.";
          statusEl.textContent = msg;
          statusEl.style.color = "#fecaca";
          chrome.storage.sync.set(
            {
              licenseStatus: "invalid",
              licenseMessage: msg,
              licenseIsMaster: false
            },
            () => {}
          );
        }
      })
      .catch((err) => {
        console.error("Erro ao validar licença:", err);
        statusEl.textContent = "Erro ao validar licença. Tente novamente.";
        statusEl.style.color = "#fecaca";
      });
  });
}

// ===== End License & Trial helpers =====


// Painel CRM

// Sincroniza dados do mini-painel CRM (crmContacts/sync) com o Kanban Runtime (quantum_crm_*/local).
// Isso evita o cenário em que o botão "Abrir Kanban" abre o dashboard.html vazio.
function whSyncQuantumCrmContact({ chatId, name, phone, stage, notes, tags }) {
  try {
    if (!chatId) return;

    chrome.storage.local.get(["quantum_crm_contacts", "quantum_crm_stages"], (res) => {
      const contacts = res.quantum_crm_contacts || {};
      const existing = contacts[chatId] || {};

      let stages = Array.isArray(res.quantum_crm_stages) ? res.quantum_crm_stages : [];
      const stageInput = (stage || existing.stage || "Novo");

      // Tenta mapear pelo id ou pelo nome, para aproveitar estágios já existentes.
      const match = stages.find((s) => s && (s.id === stageInput || s.name === stageInput));
      const stageId = match ? match.id : stageInput;

      // Garante que o estágio exista no Kanban. Se não existir, cria sem sobrescrever os demais.
      if (!stages.some((s) => s && s.id === stageId)) {
        const palette = [
          "#6B7280", "#3B82F6", "#8B5CF6", "#F59E0B", "#EC4899", "#10B981", "#EF4444"
        ];
        stages = stages.concat({
          id: stageId,
          name: stageInput,
          color: palette[stages.length % palette.length],
          icon: "",
          order: stages.length
        });
        chrome.storage.local.set({ quantum_crm_stages: stages }, () => {});
      }

      contacts[chatId] = {
        ...existing,
        id: chatId,
        chatId: chatId,
        name: typeof name === "string" ? name : (existing.name || ""),
        phone: typeof phone === "string" ? phone : (existing.phone || ""),
        stage: stageId,
        tags: Array.isArray(tags) ? tags : (existing.tags || []),
        notes: typeof notes === "string" ? notes : (existing.notes || ""),
        updatedAt: new Date().toISOString(),
        createdAt: existing.createdAt || new Date().toISOString(),
      };

      chrome.storage.local.set({ quantum_crm_contacts: contacts }, () => {});
    });
  } catch (e) {
    // Nunca bloquear o fluxo do WhatsApp por causa do Kanban.
    console.warn("[WhatsHybrid] Falha ao sincronizar com quantum_crm_*:", e);
  }
}

function ensureCrmPanel() {
  let panel = document.getElementById("whatsHybrid-crm-panel");
  if (panel) {
    updateCrmPanel();
    return;
  }
  panel = document.createElement("div");
  panel.id = "whatsHybrid-crm-panel";
  panel.innerHTML = `
    <div id="whatsHybrid-crm-panel-header">
      <span>WhatsHybrid CRM</span>
      <button id="whatsHybrid-crm-close" style="background:none;border:none;color:#fff;cursor:pointer;">✕</button>
    </div>
    <div id="whatsHybrid-crm-panel-body">
      <div>
        <strong id="whatsHybrid-crm-contact-name"></strong>
      </div>
      <div>
        <label>Estágio</label>
        <select id="whatsHybrid-crm-stage"></select>
      </div>
      <div>
        <label>Tags</label>
        <div id="whatsHybrid-crm-tags"></div>
      </div>
      <div>
        <label>Telefone (opcional)</label>
        <input id="whatsHybrid-crm-phone" />
      </div>
      <div>
        <label>Notas</label>
        <textarea id="whatsHybrid-crm-notes" rows="3"></textarea>
      </div>
      <div id="whatsHybrid-license-block">
        <label>Chave de acesso (plano / master)</label>
        <div class="whatsHybrid-license-row">
          <input id="whatsHybrid-license-key" placeholder="XXXX-XXXX-XXXX" style="flex:1;" />
          <button id="whatsHybrid-license-validate" class="whatsHybrid-license-validate">Validar</button>
        </div>
        <div class="whatsHybrid-license-kpis">
          <div class="whatsHybrid-license-kpi">
            <span>Plano</span>
            <strong id="whatsHybrid-license-plan-status">—</strong>
          </div>
          <div class="whatsHybrid-license-kpi">
            <span>Tokens IA</span>
            <strong id="whatsHybrid-license-tokens">—</strong>
          </div>
        </div>
        <small id="whatsHybrid-license-status" style="display:block;margin-top:2px;font-size:11px;"></small>
      </div>
    </div>
    <div id="whatsHybrid-crm-panel-footer">
      <button id="whatsHybrid-crm-open">Abrir Kanban</button>
      <button id="whatsHybrid-crm-save">Salvar</button>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById("whatsHybrid-crm-close").addEventListener('click', () => panel.remove());
  document.getElementById("whatsHybrid-crm-open").addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: "OPEN_KANBAN_PAGE" });
  });
  document.getElementById("whatsHybrid-crm-save").addEventListener('click', () => saveCrmData());
  const licenseBtn = document.getElementById("whatsHybrid-license-validate");
  if (licenseBtn) {
    licenseBtn.addEventListener('click', () => whValidateLicenseFromPanel());
  }
  whEnsureLicenseLoadedInPanel();


  const stageSelect = document.getElementById("whatsHybrid-crm-stage");
  stageSelect.innerHTML = "";
  config.pipelineStages.forEach((stage) => {
    const opt = document.createElement("option");
    opt.value = stage;
    opt.textContent = stage;
    stageSelect.appendChild(opt);
  });

  const tagsContainer = document.getElementById("whatsHybrid-crm-tags");
  tagsContainer.innerHTML = "";
  config.defaultTags.forEach((t) => {
    const tagName = typeof t === "string" ? t : (t && (t.name || t.label)) || "";
    if (!tagName) return;
    const chip = document.createElement("span");
    chip.className = "whatsHybrid-tag-chip";
    chip.textContent = tagName;
    chip.style.background = (typeof t === "object" && t && t.color) ? t.color : "#ffc107";
    chip.dataset.tagName = tagName;
    chip.addEventListener('click', () => chip.classList.toggle("selected"));
    tagsContainer.appendChild(chip);
  });

  updateCrmPanel();
}

function updateCrmPanel() {
  const name = getCurrentContactName();
  const contactEl = document.getElementById("whatsHybrid-crm-contact-name");
  if (contactEl) contactEl.textContent = name || "(contato não identificado)";

  const key = getCurrentChatIdFallback();
  if (!key) return;

  const legacyKey = (__whatsHybridCurrentChatId && name) ? "chat:" + name : null;

  chrome.storage.sync.get(["crmContacts"], (data) => {
    const all = data.crmContacts || {};
    let record = all[key];
    if (!record && legacyKey && all[legacyKey]) {
      record = all[legacyKey];
      // Migrar para o chatId real quando disponível
      if (legacyKey !== key) {
        all[key] = record;
        delete all[legacyKey];
        chrome.storage.sync.set({ crmContacts: all }, () => {});
      }
    }
    record = record || {};
    const stageSelect = document.getElementById("whatsHybrid-crm-stage");
    const phoneInput = document.getElementById("whatsHybrid-crm-phone");
    const notesInput = document.getElementById("whatsHybrid-crm-notes");

    if (stageSelect && record.stage) stageSelect.value = record.stage;
    if (phoneInput && record.phone) phoneInput.value = record.phone;
    if (notesInput && record.notes) notesInput.value = record.notes;

    if (record.tags && Array.isArray(record.tags)) {
      document.querySelectorAll("#whatsHybrid-crm-tags .whatsHybrid-tag-chip").forEach((chip) => {
        chip.classList.toggle("selected", record.tags.includes(chip.dataset.tagName));
      });
    }
  });
}

function saveCrmData() {
  const key = getCurrentChatIdFallback();
  if (!key) return;

  const stage = document.getElementById("whatsHybrid-crm-stage").value;
  const phone = document.getElementById("whatsHybrid-crm-phone").value.trim();
  const notes = document.getElementById("whatsHybrid-crm-notes").value.trim();
  const name = getCurrentContactName() || "";
  const selectedTags = Array.from(
    document.querySelectorAll("#whatsHybrid-crm-tags .whatsHybrid-tag-chip.selected")
  ).map((chip) => chip.dataset.tagName).filter(Boolean);

  const legacyKey = (__whatsHybridCurrentChatId && name) ? "chat:" + name : null;

  chrome.storage.sync.get(["crmContacts"], (data) => {
    const all = data.crmContacts || {};
    const previous = all[key] || (legacyKey && all[legacyKey]) || {};
    all[key] = { ...previous, name, stage, phone, notes, tags: selectedTags };
    if (legacyKey && legacyKey !== key) {
      delete all[legacyKey];
    }
    chrome.storage.sync.set({ crmContacts: all }, () => {
      // Mantém o Kanban (dashboard.html) sincronizado
      whSyncQuantumCrmContact({ chatId: key, name, phone, stage, notes, tags: selectedTags });
      if (config.backendUrl) {
        fetch(`${config.backendUrl}/crm/deals`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-extension-key": config.extensionKey || "",
          },
          body: JSON.stringify({
            externalId: key,
            name,
            phone,
            stage,
            notes,
            tags: selectedTags
          }),
        }).catch(() => {});
      }
    });
  });
}

// IA button + quick replies popup
function ensureMagicWandButton() {
  try {
    const attachBtn = document.querySelector('button[data-testid="attach-menu-plus"]');
    if (!attachBtn) return;

    let wand = document.getElementById("whatsHybrid-ai-wand");
    if (!wand) {
      wand = document.createElement("button");
      wand.id = "whatsHybrid-ai-wand";
      wand.type = "button";
      wand.setAttribute("aria-label", "Gerar resposta com IA");
      wand.title = "Gerar resposta com IA";
      wand.innerHTML = `
        <span class="whatsHybrid-wand-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 21l9-9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M14 5l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M12 7l5-5 5 5-5 5-5-5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M6.5 17.5l-2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M8 15l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </span>
      `;
      wand.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        aiSuggestReply();
      });
    }

    // Inserir ao lado do botão "+" (upload)
    if (wand.parentElement !== attachBtn.parentElement) {
      try {
        attachBtn.insertAdjacentElement('afterend', wand);
      } catch (_) {
        attachBtn.parentElement?.appendChild(wand);
      }
    } else {
      // se já está no mesmo container, garante ordem logo após o +
      if (attachBtn.nextSibling !== wand) {
        try { attachBtn.parentElement.insertBefore(wand, attachBtn.nextSibling); } catch (_) {}
      }
    }

    // IA sempre opcional: se desabilitada, apenas ocultar o ícone (sem bloquear envio manual)
    wand.style.display = config.aiEnabled ? "inline-flex" : "none";
  } catch (_) {
    // ignore
  }
}

function ensureAiAndQuickUI() {
  // Keep-alive do botão de varinha: o WhatsApp re-renderiza o compositor ao trocar de conversa
  if (!window.__whatsHybridWandInterval) {
    window.__whatsHybridWandInterval = setInterval(() => {
      try {
        ensureMagicWandButton();
      } catch (_) {}
    }, 1500);
  }

  // Remover gatilho antigo (botão flutuante) para não sobrepor o botão de envio
  const oldBtn = document.getElementById("whatsHybrid-ai-button");
  if (oldBtn) oldBtn.remove();

  // Novo gatilho: varinha mágica ao lado do botão "+" do WhatsApp
  ensureMagicWandButton();

  let qr = document.getElementById("whatsHybrid-quick-replies");
  if (!qr) {
    qr = document.createElement("div");
    qr.id = "whatsHybrid-quick-replies";
    qr.innerHTML = `
      <header>
        <span>Respostas rápidas</span>
        <button id="whatsHybrid-quick-close" style="background:none;border:none;color:#fff;cursor:pointer;">✕</button>
      </header>
      <ul id="whatsHybrid-quick-list"></ul>
    `;
    document.body.appendChild(qr);
    document.getElementById("whatsHybrid-quick-close").addEventListener('click', () => {
      qr.style.display = "none";
    });
  }
}

function openQuickReplies() {
  ensureAiAndQuickUI();
  const qr = document.getElementById("whatsHybrid-quick-replies");
  const list = document.getElementById("whatsHybrid-quick-list");
  const replies = parseQuickReplies();
  list.innerHTML = "";
  replies.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r.key + " → " + r.msg.slice(0, 60);
    li.addEventListener('click', () => {
      const text = fillTemplate(r.msg);
      fillMessageBox(text);
      qr.style.display = "none";
    });
    list.appendChild(li);
  });
  qr.style.display = "block";
}

function getLastMessages(limit = 8) {
  const msgs = [];
  const msgNodes = document.querySelectorAll("div[role='row'] div.copyable-text");
  const arr = Array.from(msgNodes).slice(-limit);
  arr.forEach((node) => {
    const text = node.innerText || node.textContent || "";
    if (text.trim()) msgs.push(text.trim());
  });
  return msgs;
}

async function aiSuggestReply() {
  return new Promise((resolve, reject) => {
    whGetLicenseState((state) => {
      if (!state.isMaster && (!state.aiEnabled || typeof state.aiCredits !== "number" || state.aiCredits <= 0)) {
        showToast("Chatbot disponível apenas no plano com IA e créditos ativos.");
        resolve();
        return;
      }
      (async () => {

  if (!config.backendUrl || !config.aiEnabled) {
    showToast("Configure backend e IA nas opções da extensão.");
    return;
  }
  const lastMessages = getLastMessages(8);
  if (!lastMessages.length) {
    showToast("Não foi possível ler o contexto do chat.");
    return;
  }
  const name = getCurrentContactName() || "Contato";
  try {
    const res = await fetch(`${config.backendUrl}/ai/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-extension-key": config.extensionKey || "",
        "x-license-key": state.licenseKey || config.licenseKey || "",
      },
      body: JSON.stringify({
        contactName: name,
        messages: lastMessages,
        tone: config.aiTone,
        chatExternalId
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Erro na IA");
    }
    const data = await res.json();
    if (!data || !data.reply) throw new Error("Resposta vazia da IA");

    if (typeof data.aiCreditsRemaining === "number" && chrome && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ licenseAiCredits: data.aiCreditsRemaining }, () => {});
    }

    fillMessageBox(data.reply);

    try {
      window.__whAiLastSuggestion = {
        interactionId: data.interactionId || null,
        text: data.reply,
        chatExternalId,
        contactName: name,
        at: Date.now(),
        __feedbackSent: false
      };
      setupAiFeedbackHooks();
      showAiFeedbackPanel(window.__whAiLastSuggestion);
    } catch (_) {}

    showToast("✅ Sugestão inserida.");
  } catch (e) {
    console.error(e);
    showToast("Erro ao obter sugestão da IA: " + e.message);
  }

      })().then(resolve).catch(reject);
    });
  });
}

// Insights de conversa
function ensureInsightsPanel() {
  let panel = document.getElementById("whatsHybrid-insights-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "whatsHybrid-insights-panel";
    panel.innerHTML = `
      <header>
        <span>Insights da conversa</span>
        <button id="whatsHybrid-insights-close" style="background:none;border:none;color:#fff;cursor:pointer;">✕</button>
      </header>
      <div class="body">
        <div id="whatsHybrid-insights-content">Carregando insights...</div>
      </div>
    `;
    document.body.appendChild(panel);
    document.getElementById("whatsHybrid-insights-close").addEventListener('click', () => {
      panel.style.display = "none";
    });
  }
  return panel;
}

async function aiConversationInsights() {
  return new Promise((resolve, reject) => {
    whGetLicenseState((state) => {
      if (!state.isMaster && (!state.aiEnabled || typeof state.aiCredits !== "number" || state.aiCredits <= 0)) {
        showToast("Chatbot disponível apenas no plano com IA e créditos ativos.");
        resolve();
        return;
      }
      (async () => {

  if (!config.backendUrl || !config.insightsEnabled) {
    showToast("Habilite insights e configure o backend nas opções.");
    return;
  }
  const lastMessages = getLastMessages(15);
  if (!lastMessages.length) {
    showToast("Não foi possível ler o contexto do chat.");
    return;
  }
  const name = getCurrentContactName() || "Contato";
  const panel = ensureInsightsPanel();
  const contentEl = document.getElementById("whatsHybrid-insights-content");
  panel.style.display = "block";
  contentEl.innerHTML = "Gerando insights com IA...";

  try {
    const res = await fetch(`${config.backendUrl}/ai/insights`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-extension-key": config.extensionKey || "",
        "x-license-key": state.licenseKey || config.licenseKey || "",
      },
      body: JSON.stringify({
        contactName: name,
        messages: lastMessages,
        chatExternalId
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Erro na IA");
    }
    const data = await res.json();

    if (typeof data.aiCreditsRemaining === "number" && chrome && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ licenseAiCredits: data.aiCreditsRemaining }, () => {});
    }

    const sentiment = data.sentiment || "desconhecido";
    const summary = data.summary || "(sem resumo)";
    const nextAction = data.nextAction || "(sem sugestão)";

    const pillClass =
      sentiment === "positivo"
        ? "positive"
        : sentiment === "negativo"
        ? "negative"
        : "neutral";

    contentEl.innerHTML = `
      <div class="pill ${pillClass}">Sentimento: ${sentiment}</div>
      <p><strong>Resumo:</strong><br/>${summary}</p>
      <p><strong>Próxima ação sugerida:</strong><br/>${nextAction}</p>
    `;
  } catch (e) {
    console.error(e);
    contentEl.innerHTML = "Erro ao gerar insights: " + e.message;
  }

      })().then(resolve).catch(reject);
    });
  });
}

// DOM automations: highlight + msg actions + events
function sendMessageEventToBackend(type, payload) {
  if (!config.backendUrl) return;
  const key = getCurrentChatIdFallback();
  const name = getCurrentContactName() || "";
  const body = {
    type,
    chatExternalId: key,
    contactName: name,
    ...payload
  };
  fetch(`${config.backendUrl}/events/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-extension-key": config.extensionKey || ""
    },
    body: JSON.stringify(body)
  }).catch(() => {});
}

function createTaskFromMessage(text) {
  if (!config.backendUrl) {
    showToast("Configure o backend para criar tarefas.");
    return;
  }
  const key = getCurrentChatIdFallback();
  const name = getCurrentContactName() || "";
  fetch(`${config.backendUrl}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-extension-key": config.extensionKey || ""
    },
    body: JSON.stringify({
      dealExternalId: key,
      title: `Follow-up: ${name}`,
      description: text
    })
  }).then(() => {
    showToast("Tarefa criada no backend.");
  }).catch(() => {});
}

function highlightImportantMessages(container) {
  const nodes = container.querySelectorAll("div.copyable-text");
  nodes.forEach((node) => {
    if (node.dataset.whatsHybridProcessed === "1") return;
    node.dataset.whatsHybridProcessed = "1";

    const text = node.innerText || node.textContent || "";
    if (!text) return;
    const lower = text.toLowerCase();
    const keywords = ["preço", "valor", "prazo", "orçamento", "desconto", "comprar", "vender", "pagamento", "pix"];
    const isQuestion = text.includes("?");
    const hit = keywords.some((k) => lower.includes(k)) || isQuestion;
    if (hit) {
      node.classList.add("whatsHybrid-highlight");
    }

    const bubble = node.closest("div[data-id]") || node.parentElement;
    if (bubble && !bubble.querySelector(".whatsHybrid-msg-actions")) {
      const wrapper = document.createElement("div");
      wrapper.className = "whatsHybrid-msg-actions";
      const btnTask = document.createElement("button");
      btnTask.textContent = "T";
      btnTask.title = "Criar tarefa com base nesta mensagem";
      btnTask.addEventListener('click', (e) => {
        e.stopPropagation();
        createTaskFromMessage(text);
      });
      wrapper.appendChild(btnTask);
      bubble.style.position = "relative";
      bubble.appendChild(wrapper);
    }

    // Rastreio de eventos para flows/analytics
    if (!node.dataset.whatsHybridEventSent && config.backendUrl) {
      node.dataset.whatsHybridEventSent = "1";
      let type = "incoming_message";
      const bubble = node.closest("div[data-id]");
      if (bubble && bubble.classList.contains("message-out")) {
        type = "outgoing_message";
      }
      sendMessageEventToBackend(type, { text });
    }
  });
}

function observeMessages() {
  const chat = document.querySelector("#main");
  if (!chat) return;
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        highlightImportantMessages(n);
      });
    });
  });
  observer.observe(chat, { childList: true, subtree: true });
  highlightImportantMessages(chat);
}

// Salvar texto selecionado como nota no CRM
function saveSelectionAsNote(text) {
  const name = getCurrentContactName() || "";
  const key = getCurrentChatIdFallback();
  if (!key) return;
  const legacyKey = (__whatsHybridCurrentChatId && name) ? "chat:" + name : null;
  chrome.storage.sync.get(["crmContacts"], (data) => {
    const all = data.crmContacts || {};
    const record = all[key] || (legacyKey && all[legacyKey]) || {};
    record.notes = (record.notes || "") + "\n" + text;
    all[key] = record;
    if (legacyKey && legacyKey !== key) {
      delete all[legacyKey];
    }
    chrome.storage.sync.set({ crmContacts: all }, () => {
      // Mantém o Kanban (dashboard.html) sincronizado
      whSyncQuantumCrmContact({ chatId: key, name, notes: record.notes });
      if (config.backendUrl) {
        fetch(`${config.backendUrl}/crm/deals`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-extension-key": config.extensionKey || "",
          },
          body: JSON.stringify({
            externalId: key,
            name: name || "",
            notes: record.notes
          }),
        }).catch(() => {});
      }
    });
  });
}

// Listener mensagens do background/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  switch (message.type) {
    case "OPEN_CRM_PANEL":
      ensureCrmPanel();
      sendResponse({ ok: true });
      return true;

    case "AI_SUGGEST_REPLY":
      aiSuggestReply();
      sendResponse({ ok: true });
      return true;

    case "GET_UNREAD_COUNT": {
      const count = getUnreadCount();
      sendResponse({ count });
      return true;
    }

    case "OPEN_QUICK_REPLIES":
      openQuickReplies();
      sendResponse({ ok: true });
      return true;

    case "SAVE_SELECTION_AS_NOTE":
      if (message.text) saveSelectionAsNote(message.text);
      sendResponse({ ok: true });
      return true;

    case "AI_CONVERSATION_INSIGHTS":
      aiConversationInsights();
      sendResponse({ ok: true });
      return true;

    default:
      // Important: do NOT return true for unknown types, otherwise
      // message ports can remain open and break other modules.
      return false;
  }
});

function waitForWhatsAppUi(callback) {
  const maxWaitMs = 15000;
  const checkInterval = 500;
  let elapsed = 0;

  let emittedReadyEvent = false;

  function isReady() {
    // Preferir engine resiliente (quando disponível)
    if (window.SelectorEngine?.isWhatsAppReady) {
      try {
        return window.SelectorEngine.isWhatsAppReady();
      } catch (_) {
        // fallback abaixo
      }
    }

    const app = document.querySelector('.app-wrapper .app, #app .app');
    const main = document.getElementById('main');
    return !!(app && main);
  }

  const tick = () => {
    if (isReady()) {
      if (!emittedReadyEvent && window.EventBus?.emit && window.EventBus?.EVENTS?.WHATSAPP_READY) {
        emittedReadyEvent = true;
        try {
          window.EventBus.emit(window.EventBus.EVENTS.WHATSAPP_READY);
        } catch (e) {
          // não bloquear inicialização
          console.warn('[Quantum] Falha ao emitir WHATSAPP_READY:', e);
        }
      }

      callback();
      return;
    }
    if (elapsed >= maxWaitMs) {
      // fallback: mesmo que o WhatsApp demore, inicializamos o painel
      callback();
      return;
    }
    elapsed += checkInterval;
    setTimeout(tick, checkInterval);
  };

  if (isReady()) {
    // Emite o evento também no caminho "rápido"
    if (!emittedReadyEvent && window.EventBus?.emit && window.EventBus?.EVENTS?.WHATSAPP_READY) {
      emittedReadyEvent = true;
      window.EventBus.emit(window.EventBus.EVENTS.WHATSAPP_READY);
    }
    callback();
  } else {
    tick();
  }
}

waitForWhatsAppUi(() => {
  ensureAiAndQuickUI();
  observeMessages();
});


// ============================================
// INTEGRAÇÃO COM EXTRACTOR (Fase 6)
// ============================================

// Listener para toggle do painel extractor
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TOGGLE_EXTRACTOR_PANEL') {
        toggleExtractorPanel();
        if (typeof sendResponse === 'function') {
            sendResponse({ success: true });
        }
    }
});

// Toggle do painel
function toggleExtractorPanel() {
    let panel = document.getElementById('quantum-extractor-container');
    
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    } else {
        createExtractorPanel();
    }
}

// Criar painel do extractor
function createExtractorPanel() {
    const container = document.createElement('div');
    container.id = 'quantum-extractor-container';
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 999998;
        pointer-events: none;
    `;
    
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('extractor/extractor_ui.html');
    iframe.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 420px;
        height: 600px;
        border: none;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        pointer-events: auto;
    `;
    
    container.appendChild(iframe);
    document.body.appendChild(container);
    
    // Listener para fechar
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CLOSE_EXTRACTOR_PANEL') {
            container.style.display = 'none';
        }
    });
}

// Criar botão flutuante para abrir extractor
function createExtractorFAB() {
    const fab = document.createElement('button');
    fab.id = 'quantum-extractor-fab';
    fab.className = 'extractor-fab';
    fab.innerHTML = '📊';
    fab.title = 'Abrir Extrator de Dados';
    fab.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        width: 56px;
        height: 56px;
        background: #00a884;
        border: none;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: white;
        z-index: 999997;
        transition: all 0.2s ease;
    `;
    
    fab.addEventListener('click', toggleExtractorPanel);
    fab.addEventListener('mouseenter', () => {
        fab.style.transform = 'scale(1.1)';
    });
    fab.addEventListener('mouseleave', () => {
        fab.style.transform = 'scale(1)';
    });
    
    document.body.appendChild(fab);
}

// Inicializar FAB quando DOM estiver pronto
setTimeout(createExtractorFAB, 3000);



// ============================================
// Inicialização de Quantum Features (Overlays & Assinaturas)
// ============================================

(() => {
    if (typeof window === 'undefined') return;

    async function initQuantumFeatures() {
        try {
            // Preferir inicialização sequencial (quando disponível)
            if (window.InitializationManager && typeof window.InitializationManager.initialize === 'function') {
                console.log('[WhatsHybrid] Usando InitializationManager');

                await window.InitializationManager.initialize({
                    waitForWhatsApp: true,
                    stopOnError: false
                });

                console.log('[WhatsHybrid] Quantum features inicializadas (InitManager)');
                return;
            }

            // Fallback: inicialização manual (compatibilidade)
            console.log('[WhatsHybrid] InitializationManager não encontrado. Usando fallback manual');

            if (window.SubscriptionManager && typeof SubscriptionManager.init === 'function') {
                await SubscriptionManager.init();
            }

            if (window.CreditsManager && typeof CreditsManager.init === 'function') {
                await CreditsManager.init();
            }

            if (window.NotificationCenter && typeof NotificationCenter.init === 'function') {
                NotificationCenter.init();
            }

            if (window.OverlayManager && typeof OverlayManager.init === 'function') {
                OverlayManager.init();
            }

            if (window.SubscriptionUI && typeof SubscriptionUI.init === 'function') {
                SubscriptionUI.init();
            }

            if (window.WhatsHybridBridge && typeof window.WhatsHybridBridge.init === 'function') {
                await window.WhatsHybridBridge.init();
            }

            if (window.QuickActionsInjector && typeof QuickActionsInjector.init === 'function') {
                QuickActionsInjector.init();
            }

            console.log('[WhatsHybrid] Quantum features inicializadas (fallback)');
        } catch (error) {
            console.error('[WhatsHybrid] Erro ao inicializar Quantum features:', error);
        }
    }

    // Aguardar DOM do WhatsApp
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQuantumFeatures);
    } else {
        initQuantumFeatures();
    }
})();
