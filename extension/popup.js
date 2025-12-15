// popup.js

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar conexão
    checkConnection();

    // Toggle: Recovery (mensagens/fotos apagadas ou editadas)
    initRecoveryToggle();

    // Event listeners
    document.getElementById('btn-open-panel').addEventListener('click', openPanel);
    document.getElementById('btn-quick-message').addEventListener('click', () => openPanelAt('quick-message'));
    document.getElementById('btn-dashboard').addEventListener('click', () => openPanelAt('dashboard'));
    document.getElementById('btn-bulk').addEventListener('click', () => openPanelAt('bulk'));
    document.getElementById('btn-flows').addEventListener('click', () => openPanelAt('smart-replies'));
    document.getElementById('btn-extractor').addEventListener('click', () => openPanelAt('extractor'));
    document.getElementById('btn-settings').addEventListener('click', () => openPanelAt('settings'));
});

const RECOVERY_STORAGE_KEY = 'wpp_recovery_enabled';

async function initRecoveryToggle() {
    const btn = document.getElementById('btn-recovery-toggle');
    const pill = document.getElementById('recovery-toggle-pill');
    if (!btn || !pill) return;

    const getEnabled = async () => {
        return new Promise((resolve) => {
            chrome.storage.sync.get([RECOVERY_STORAGE_KEY], (res) => {
                resolve(Boolean(res?.[RECOVERY_STORAGE_KEY]));
            });
        });
    };

    const setEnabled = async (enabled) => {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [RECOVERY_STORAGE_KEY]: Boolean(enabled) }, () => resolve());
        });
    };

    const updateUI = (enabled) => {
        pill.textContent = enabled ? 'Desativar' : 'Ativar';
        pill.classList.toggle('on', enabled);
    };

    // Inicial
    try {
        const enabled = await getEnabled();
        updateUI(enabled);
    } catch (e) {
        pill.textContent = 'Erro';
    }

    // Clique: alterna
    btn.addEventListener('click', async () => {
        try {
            const current = await getEnabled();
            const next = !current;
            await setEnabled(next);
            updateUI(next);

            // Opcional: tenta mostrar um feedback rápido se WhatsApp estiver aberto.
            // O content script (recovery_content.js) escuta mudanças do storage e ativa/desativa automaticamente.
        } catch (e) {
            pill.textContent = 'Erro';
            console.warn('Erro ao alternar Recovery:', e);
        }
    });
}

async function checkConnection() {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    try {
        const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });

        if (tabs.length > 0) {
            // Verificar se content script (extractor_content) está ativo.
            // OBS: o extractor_content filtra por `target: 'extractor_content'`.
            const response = await chrome.tabs.sendMessage(tabs[0].id, { target: 'extractor_content', action: 'ping' });

            if (response?.success) {
                statusDot.classList.add('connected');
                statusText.textContent = 'Conectado ao WhatsApp';
                return;
            }
        }

        statusText.textContent = 'WhatsApp não conectado';
    } catch (error) {
        statusText.textContent = 'WhatsApp não conectado';
    }
}

function openPanel() {
    chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') });
}

function openPanelAt(module) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`panel.html#${module}`) });
}
