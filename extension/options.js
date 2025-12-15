// WhatsHybrid Configurações - v11 (refinado, sem chave OpenAI no cliente)

function showToast(message, duration = 3000) {
  try {
    const toast = document.createElement("div");
    toast.innerText = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "30px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(40, 40, 50, 0.95)",
      color: "#fff",
      padding: "10px 22px",
      borderRadius: "7px",
      zIndex: 99999,
      fontSize: "13px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.16)",
      letterSpacing: "0.02em"
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(4px)";
      toast.style.transition = "opacity 0.18s ease-out, transform 0.18s ease-out";
      setTimeout(() => toast.remove(), 220);
    }, duration);
  } catch (e) {
    console.warn("Toast error:", e);
  }
}

const backendUrlInput = document.getElementById("backendUrl");
const extensionKeyInput = document.getElementById("extensionKey");
const pipelineStagesInput = document.getElementById("pipelineStages");
const defaultTagsInput = document.getElementById("defaultTags");
const aiEnabledSelect = document.getElementById("aiEnabled");
const aiToneSelect = document.getElementById("aiTone");
const quickRepliesInput = document.getElementById("quickReplies");
const insightsEnabledSelect = document.getElementById("insightsEnabled");
// Apenas nome/assinatura do operador é configurável no cliente; 
// a chave da API OpenAI fica SOMENTE no backend (.env).
const userNameInput = document.getElementById("userNameInput");
const saveBtn = document.getElementById("save");

// ===== Plano / Tokens (licença) =====
const MASTER_KEY = "Cristi@no123";
const MASTER_AI_CREDITS = 2147483647;

const licenseKeyInput = document.getElementById("licenseKeyInput");
const licenseValidateBtn = document.getElementById("licenseValidate");
const licenseStatusText = document.getElementById("licenseStatusText");
const planStatusText = document.getElementById("planStatusText");
const tokensText = document.getElementById("tokensText");

// Esconde seções técnicas para clientes (mostra apenas para admin/master)
function updateAdminVisibility(state) {
  try {
    const backendSection = document.getElementById("backendAuthSection");
    if (backendSection) {
      backendSection.style.display = state && state.isMaster ? "" : "none";
    }
  } catch (_) {}
}


function getClientId(callback) {
  try {
    chrome.storage.sync.get(["whClientId"], (data) => {
      if (data.whClientId) return callback(data.whClientId);
      const id = "whc_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      chrome.storage.sync.set({ whClientId: id }, () => callback(id));
    });
  } catch (e) {
    callback("whc_fallback");
  }
}

function refreshLicenseUI() {
  try {
    if (!window.whatsHybridLicense || typeof window.whatsHybridLicense.getState !== "function") return;
    window.whatsHybridLicense.getState((state) => {
      const isActive = !!(state.isLicensed || state.isTrialActive || state.isMaster);
      updateAdminVisibility(state);
      if (licenseKeyInput) licenseKeyInput.value = state.licenseKey || "";
      if (planStatusText) {
        planStatusText.textContent = isActive ? "Ativo" : "Inativo";
      }
      if (tokensText) {
        tokensText.textContent = (typeof state.aiCredits === "number") ? String(state.aiCredits) : "—";
      }
      if (licenseStatusText) {
        if (state.isMaster) {
          licenseStatusText.textContent = "Master key ativa. Tudo liberado.";
        } else if (state.isLicensed) {
          licenseStatusText.textContent = "Plano ativo.";
        } else if (state.isTrialActive) {
          licenseStatusText.textContent = "Modo gratuito ativo (trial).";
        } else {
          licenseStatusText.textContent = "Plano inativo. Insira uma chave para ativar.";
        }
      }
    });
  } catch (e) {
    // ignore
  }
}

async function validateLicenseKey(key) {
  const cleaned = (key || "").toString().trim();
  if (!cleaned) {
    showToast("Insira uma chave de acesso.");
    return;
  }

  // Master key: ativa localmente e ignora restrições (sem depender do backend)
  if (cleaned === MASTER_KEY) {
    chrome.storage.sync.set(
      {
        licenseKey: cleaned,
        licenseIsMaster: true,
        licenseStatus: "licensed",
        licensePlan: "enterprise",
        licenseMessage: "Master key ativa",
        licenseAiEnabled: true,
        licenseAiCredits: MASTER_AI_CREDITS
      },
      () => {
        showToast("Master key ativada!");
        refreshLicenseUI();
      }
    );
    return;
  }

  const { backendUrl } = await chrome.storage.sync.get(["backendUrl"]);
  if (!backendUrl) {
    showToast("Configure a URL do backend para validar a chave.");
    return;
  }

  return new Promise((resolve) => {
    getClientId(async (clientId) => {
      try {
        const res = await fetch(`${backendUrl}/license/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: cleaned, clientId })
        });
        const data = await res.json().catch(() => null);
        if (data && data.valid) {
          chrome.storage.sync.set(
            {
              licenseKey: cleaned,
              licenseIsMaster: false,
              licenseStatus: "licensed",
              licensePlan: data.plan || "empreendedor_mensal",
              licenseMessage: "Licença ativa",
              licenseAiEnabled: data.aiEnabled === true,
              licenseAiCredits: (typeof data.aiCredits === "number") ? data.aiCredits : null
            },
            () => {
              showToast("Chave validada. Recursos liberados.");
              refreshLicenseUI();
              resolve();
            }
          );
        } else {
          const msg = (data && data.message) ? data.message : "Chave inválida.";
          chrome.storage.sync.set({ licenseStatus: "invalid", licenseMessage: msg, licenseIsMaster: false }, () => {});
          if (licenseStatusText) licenseStatusText.textContent = msg;
          showToast(msg);
          resolve();
        }
      } catch (e) {
        console.error(e);
        showToast("Erro ao validar a chave.");
        resolve();
      }
    });
  });
}

function load() {
  if (!chrome || !chrome.storage || !chrome.storage.sync) return;

  chrome.storage.sync.get(
    [
      "backendUrl",
      "extensionKey",
      "pipelineStages",
      "defaultTags",
      "aiEnabled",
      "aiTone",
      "quickReplies",
      "insightsEnabled"
    ],
    (data) => {
      try {
        if (data.backendUrl && backendUrlInput) backendUrlInput.value = data.backendUrl;
        if (data.extensionKey && extensionKeyInput) extensionKeyInput.value = data.extensionKey;

        if (Array.isArray(data.pipelineStages) && data.pipelineStages.length && pipelineStagesInput) {
          pipelineStagesInput.value = data.pipelineStages.join("\n");
        }
        if (Array.isArray(data.defaultTags) && defaultTagsInput) {
          defaultTagsInput.value = data.defaultTags
            .map((t) => (typeof t === "string" ? t : `${t.label}:${t.color || "#8b5cf6"}`))
            .join("\n");
        }

        if (typeof data.aiEnabled === "boolean" && aiEnabledSelect) {
          aiEnabledSelect.value = data.aiEnabled ? "true" : "false";
        }
        if (data.aiTone && aiToneSelect) {
          aiToneSelect.value = data.aiTone;
        }
        if (data.quickReplies && quickRepliesInput) {
          quickRepliesInput.value = data.quickReplies;
        }
        if (typeof data.insightsEnabled === "boolean" && insightsEnabledSelect) {
          insightsEnabledSelect.value = data.insightsEnabled ? "true" : "false";
        }
      } catch (e) {
        console.warn("Erro ao carregar config da extensão:", e);
      }
    }
  );

  // Carrega apenas nome/assinatura do operador (não há mais chave OpenAI no cliente)
  if (chrome && chrome.storage && chrome.storage.local && userNameInput) {
    chrome.storage.local.get(["userName"], (localData) => {
      try {
        if (localData.userName) {
          userNameInput.value = localData.userName;
        }
      } catch (e) {
        console.warn("Erro ao carregar userName local:", e);
      }
    });
  }
}

if (saveBtn) {
  saveBtn.addEventListener("click", () => {
    const stages = pipelineStagesInput && pipelineStagesInput.value
      ? pipelineStagesInput.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      : [];

    const tags = [];
    if (defaultTagsInput && defaultTagsInput.value) {
      defaultTagsInput.value.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const [label, color] = trimmed.split(":");
        tags.push({ label: label.trim(), color: (color || "#8b5cf6").trim() });
      });
    }

    chrome.storage.sync.set(
      {
        backendUrl: backendUrlInput ? backendUrlInput.value.trim() : "",
        extensionKey: extensionKeyInput ? extensionKeyInput.value.trim() : "",
        pipelineStages: stages,
        defaultTags: tags,
        aiEnabled: aiEnabledSelect ? aiEnabledSelect.value === "true" : true,
        aiTone: aiToneSelect ? aiToneSelect.value : "profissional",
        quickReplies: quickRepliesInput ? quickRepliesInput.value : "",
        insightsEnabled: insightsEnabledSelect ? insightsEnabledSelect.value === "true" : true
      },
      () => {
        // Salva apenas o nome/assinatura localmente
        if (chrome && chrome.storage && chrome.storage.local && userNameInput) {
          chrome.storage.local.set(
            {
              userName: userNameInput.value.trim() || ""
            },
            () => {}
          );
        }

        saveBtn.textContent = "Salvo!";
        showToast("Configurações atualizadas com sucesso.");
        setTimeout(() => (saveBtn.textContent = "Salvar configurações"), 1500);
      }
    );
  });
}

load();

// Bind UI licença
if (licenseValidateBtn) {
  licenseValidateBtn.addEventListener("click", () => {
    validateLicenseKey(licenseKeyInput ? licenseKeyInput.value : "");
  });
}
if (licenseKeyInput) {
  licenseKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      validateLicenseKey(licenseKeyInput.value);
    }
  });


// ---------------------------------------------------------------------------
// AI Training Center (Options)
// ---------------------------------------------------------------------------
async function getApiConfig() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(["backendUrl", "extensionKey", "licenseKey", "pipelineStages", "defaultTags", "quickReplies"], (data) => {
        resolve(data || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

async function apiRequest(path, { method = "GET", body = null } = {}) {
  const cfg = await getApiConfig();
  const backendUrl = (cfg.backendUrl || "").trim();
  const extensionKey = (cfg.extensionKey || "").trim();
  const licenseKey = (cfg.licenseKey || "").trim();

  if (!backendUrl) throw new Error("Backend não configurado.");
  if (!licenseKey) throw new Error("Chave de licença não configurada.");

  const headers = {
    "Content-Type": "application/json",
    "x-license-key": licenseKey
  };
  if (extensionKey) headers["x-extension-key"] = extensionKey;

  const res = await fetch(`${backendUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data && data.error ? data.error : "Falha na requisição.");
  }
  return data;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fileToBase64(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  return bytesToBase64(buf);
}

function renderKnowledgeList(items) {
  const list = document.getElementById("aiKnowledgeList");
  if (!list) return;
  list.innerHTML = "";
  const safeItems = Array.isArray(items) ? items : [];

  if (!safeItems.length) {
    list.innerHTML = `<div class="muted-note">Nenhum conhecimento salvo ainda.</div>`;
    return;
  }

  safeItems.slice(0, 30).forEach((it) => {
    const el = document.createElement("div");
    el.className = "knowledge-item";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "k-title";
    title.textContent = it.title || "Item";
    const meta = document.createElement("div");
    meta.className = "k-meta";
    meta.textContent = `${it.sourceType || "texto"} • ${it.createdAt ? new Date(it.createdAt).toLocaleString() : ""}`;

    left.appendChild(title);
    left.appendChild(meta);

    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.type = "button";
    btn.textContent = "Remover";
    btn.addEventListener("click", async () => {
      try {
        await apiRequest(`/ai/training/knowledge/${encodeURIComponent(it.id)}`, { method: "DELETE" });
        showToast("Removido.");
        await loadTrainingState();
      } catch (e) {
        showToast(e.message || "Falha ao remover.");
      }
    });

    el.appendChild(left);
    el.appendChild(btn);
    list.appendChild(el);
  });
}

function updateReadiness(state) {
  const bar = document.getElementById("aiTrainReadinessBar");
  const txt = document.getElementById("aiTrainReadinessText");
  const stateEl = document.getElementById("aiTrainState");
  const autoInfo = document.getElementById("aiAutoTrainInfo");
  const autoToggle = document.getElementById("aiAutoTrainEnabled");

  const score = Number(state?.readinessScore || 0);
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, score))}%`;
  if (txt) {
    if ((state?.metrics?.approved || 0) + (state?.metrics?.edited || 0) + (state?.metrics?.rejected || 0) < 10) {
      txt.textContent = "Precisa de mais histórico (use a IA e envie mensagens algumas vezes).";
    } else {
      txt.textContent = `Prontidão estimada: ${score}% • aprovadas: ${state?.metrics?.approved || 0} • editadas: ${state?.metrics?.edited || 0} • rejeitadas: ${state?.metrics?.rejected || 0}`;
    }
  }
  if (stateEl) {
    stateEl.textContent = `Itens de conhecimento: ${state?.totalKnowledgeItems || 0} • Créditos: ${typeof state?.aiCredits === "number" ? state.aiCredits : "—"} • Plano: ${state?.plan || "—"}`;
  }
  if (autoToggle) {
    autoToggle.checked = !!state?.autoTrainEnabled;
  }
  if (autoInfo) {
    autoInfo.textContent = state?.autoTrainEnabled
      ? `Ligado. Última execução: ${state?.autoTrainLastRun ? new Date(state.autoTrainLastRun).toLocaleString() : "—"}`
      : "Desligado.";
  }
}

async function loadTrainingState() {
  try {
    const state = await apiRequest("/ai/training/state");
    updateReadiness(state);
    const kb = await apiRequest("/ai/training/knowledge");
    renderKnowledgeList(kb.items || []);
  } catch (e) {
    const stateEl = document.getElementById("aiTrainState");
    if (stateEl) stateEl.textContent = e.message || "Falha ao carregar.";
  }
}

function buildSystemImportPayload(cfg) {
  const payload = {
    pipelineStages: cfg.pipelineStages || [],
    defaultTags: cfg.defaultTags || [],
    quickReplies: cfg.quickReplies || {}
  };
  return payload;
}

function initAITraining() {
  const addTextBtn = document.getElementById("aiTrainAddText");
  const importBtn = document.getElementById("aiTrainImportSystem");
  const uploadFileBtn = document.getElementById("aiTrainUploadFile");
  const uploadAudioBtn = document.getElementById("aiTrainUploadAudio");
  const generateSugBtn = document.getElementById("aiTrainGenerateSuggestions");
  const applySugBtn = document.getElementById("aiTrainApplySuggestions");
  const autoToggle = document.getElementById("aiAutoTrainEnabled");

  const policyEditor = document.getElementById("aiPolicyEditor");
  const policySave = document.getElementById("aiPolicySaveBtn");
  const policyReload = document.getElementById("aiPolicyReloadBtn");

  const recordBtn = document.getElementById("aiTrainRecordBtn");
  const recordStatus = document.getElementById("aiTrainRecordStatus");

  if (!addTextBtn) return; // página sem training section

  addTextBtn.addEventListener("click", async () => {
    const title = (document.getElementById("aiTrainTitle")?.value || "").trim();
    const text = (document.getElementById("aiTrainText")?.value || "").trim();
    if (!text) return showToast("Cole um texto para treinar.");
    try {
      addTextBtn.disabled = true;
      addTextBtn.textContent = "Enviando...";
      await apiRequest("/ai/training/ingest/text", { method: "POST", body: { title, text, sourceType: "text" } });
      showToast("Treinamento adicionado!");
      if (document.getElementById("aiTrainText")) document.getElementById("aiTrainText").value = "";
      await loadTrainingState();
    } catch (e) {
      showToast(e.message || "Falha ao treinar.");
    } finally {
      addTextBtn.disabled = false;
      addTextBtn.textContent = "Adicionar ao conhecimento";
    }
  });

  importBtn?.addEventListener("click", async () => {
    try {
      importBtn.disabled = true;
      importBtn.textContent = "Importando...";
      const cfg = await getApiConfig();
      const data = buildSystemImportPayload(cfg);
      await apiRequest("/ai/training/ingest/system", { method: "POST", body: { title: "Dados do sistema", data } });
      showToast("Importado!");
      await loadTrainingState();
    } catch (e) {
      showToast(e.message || "Falha ao importar.");
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = "Importar do sistema";
    }
  });

  uploadFileBtn?.addEventListener("click", async () => {
    const fileInput = document.getElementById("aiTrainFile");
    const file = fileInput?.files?.[0];
    if (!file) return showToast("Selecione um arquivo.");
    try {
      uploadFileBtn.disabled = true;
      uploadFileBtn.textContent = "Enviando...";
      const base64 = await fileToBase64(file);
      await apiRequest("/ai/training/ingest/file", { method: "POST", body: { fileName: file.name, mimeType: file.type || "", base64 } });
      showToast("Arquivo importado!");
      if (fileInput) fileInput.value = "";
      await loadTrainingState();
    } catch (e) {
      showToast(e.message || "Falha ao importar arquivo.");
    } finally {
      uploadFileBtn.disabled = false;
      uploadFileBtn.textContent = "Importar arquivo";
    }
  });

  uploadAudioBtn?.addEventListener("click", async () => {
    const title = (document.getElementById("aiTrainTitle")?.value || "").trim();
    const fileInput = document.getElementById("aiTrainAudioFile");
    const file = fileInput?.files?.[0];
    if (!file) return showToast("Selecione um áudio.");
    try {
      uploadAudioBtn.disabled = true;
      uploadAudioBtn.textContent = "Transcrevendo...";
      const base64 = await fileToBase64(file);
      await apiRequest("/ai/training/ingest/audio", { method: "POST", body: { title: title || file.name || "Áudio", mimeType: file.type || "", base64 } });
      showToast("Áudio treinado!");
      if (fileInput) fileInput.value = "";
      await loadTrainingState();
    } catch (e) {
      showToast(e.message || "Falha ao transcrever.");
    } finally {
      uploadAudioBtn.disabled = false;
      uploadAudioBtn.textContent = "Transcrever e treinar";
    }
  });

  generateSugBtn?.addEventListener("click", async () => {
    try {
      generateSugBtn.disabled = true;
      generateSugBtn.textContent = "Gerando...";
      await apiRequest("/ai/training/generate-suggestions", { method: "POST", body: { limit: 40 } });
      showToast("Sugestões geradas!");
      await loadTrainingState();
    } catch (e) {
      showToast(e.message || "Falha ao gerar sugestões.");
    } finally {
      generateSugBtn.disabled = false;
      generateSugBtn.textContent = "Gerar sugestões do histórico";
    }
  });

  applySugBtn?.addEventListener("click", async () => {
    try {
      applySugBtn.disabled = true;
      applySugBtn.textContent = "Aplicando...";
      await apiRequest("/ai/training/apply-suggestions", { method: "POST", body: {} });
      showToast("Sugestões aplicadas nas regras!");
      await loadTrainingState();
    } catch (e) {
      showToast(e.message || "Falha ao aplicar sugestões.");
    } finally {
      applySugBtn.disabled = false;
      applySugBtn.textContent = "Aplicar sugestões";
    }
  });

  autoToggle?.addEventListener("change", async () => {
    try {
      await apiRequest("/ai/training/autotrain", { method: "POST", body: { enabled: !!autoToggle.checked } });
      showToast(autoToggle.checked ? "Auto-aprimoramento ligado." : "Auto-aprimoramento desligado.");
      await loadTrainingState();
    } catch (e) {
      showToast(e.message || "Falha ao atualizar.");
    }
  });

  async function loadPolicyEditor() {
    if (!policyEditor) return;
    try {
      const data = await apiRequest("/ai/training/policy");
      policyEditor.value = data.policy || "";
    } catch (e) {
      // silencioso
    }
  }

  policyReload?.addEventListener("click", async () => {
    await loadPolicyEditor();
    showToast("Regras recarregadas.");
  });

  policySave?.addEventListener("click", async () => {
    if (!policyEditor) return;
    try {
      policySave.disabled = true;
      policySave.textContent = "Salvando...";
      await apiRequest("/ai/training/policy", { method: "POST", body: { policy: policyEditor.value || "" } });
      showToast("Regras salvas!");
      await loadTrainingState();
    } catch (e) {
      showToast(e.message || "Falha ao salvar regras.");
    } finally {
      policySave.disabled = false;
      policySave.textContent = "Salvar regras";
    }
  });

  // Gravação de áudio (microfone)
  let mediaRecorder = null;
  let chunks = [];
  let recording = false;

  recordBtn?.addEventListener("click", async () => {
    try {
      if (!recording) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          try {
            const blob = new Blob(chunks, { type: "audio/webm" });
            const arrayBuf = await blob.arrayBuffer();
            const base64 = bytesToBase64(new Uint8Array(arrayBuf));
            const title = (document.getElementById("aiTrainTitle")?.value || "").trim();
            await apiRequest("/ai/training/ingest/audio", { method: "POST", body: { title: title || "Áudio gravado", mimeType: "audio/webm", base64 } });
            showToast("Áudio treinado!");
            await loadTrainingState();
          } catch (e) {
            showToast(e.message || "Falha ao enviar áudio.");
          } finally {
            try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
          }
        };
        mediaRecorder.start();
        recording = true;
        recordBtn.textContent = "Parar gravação";
        if (recordStatus) recordStatus.textContent = "Gravando… clique novamente para parar.";
      } else {
        recording = false;
        recordBtn.textContent = "Gravar áudio";
        if (recordStatus) recordStatus.textContent = "Processando…";
        try { mediaRecorder && mediaRecorder.stop(); } catch (_) {}
      }
    } catch (e) {
      showToast("Permissão de microfone negada ou indisponível.");
    }
  });

  // Load initial state
  loadTrainingState();
  loadPolicyEditor();
}

// inicializa se existir a seção
try { initAITraining(); } catch (_) {}


}

// Primeira renderização e sincronização automática
refreshLicenseUI();
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const watched = ["licenseKey", "licenseStatus", "licensePlan", "licenseAiEnabled", "licenseAiCredits", "licenseIsMaster", "licenseMessage"];
    if (watched.some((k) => !!changes[k])) {
      refreshLicenseUI();
    }
  });
} catch (_) {}
