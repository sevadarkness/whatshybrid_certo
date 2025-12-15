// recovery_content.js
// ------------------------------------------------------------
// Recovery de mensagens/fotos apagadas ou editadas (WhatsApp Web)
// Controle via popup: chrome.storage.sync key "wpp_recovery_enabled"
// ------------------------------------------------------------

(() => {
  const RECOVERY_STORAGE_KEY = 'wpp_recovery_enabled';

  // Cache em memória: id da mensagem -> { originalText, currentText, originalImage, currentImage }
  const messageCache = new Map();

  // Expressões pra detectar textos de "apagado" em vários idiomas
  const deletedPatterns = [
    /esta mensagem foi apagada/i,
    /mensagem apagada/i,
    /this message was deleted/i,
    /mensaje eliminado/i,
    /messaggio eliminato/i,
    /message deleted/i,
    /vous avez supprimé ce message/i,
    /ce message a été supprimé/i,
    /diese nachricht wurde gelöscht/i
  ];

  // Pequeno delay helper
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Controle de lifecycle
  let isEnabled = false;
  let isRunning = false;
  let runToken = 0;
  let observer = null;
  let styleEl = null;
  let animStyleEl = null;

  // =========================
  // Helpers de Storage
  // =========================
  function getEnabledSetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get([RECOVERY_STORAGE_KEY], (res) => {
          resolve(Boolean(res?.[RECOVERY_STORAGE_KEY]));
        });
      } catch (_) {
        resolve(false);
      }
    });
  }

  // Espera o WhatsApp Web carregar o container principal
  async function waitForWhatsAppReady(token) {
    // Espera o app geral
    while (token === runToken && !document.querySelector('#app, #pane-side')) {
      await sleep(500);
    }
    if (token !== runToken) return;

    // Dá mais um tempinho pros chats renderizarem
    await sleep(2000);
  }

  // Pega o container da mensagem a partir de qualquer nó interno
  function getMessageContainerFromNode(node) {
    if (!(node instanceof Element)) return null;
    return node.closest('[data-id]');
  }

  // Identifica se a mensagem é recebida (de quem fala com você)
  function isIncomingMessage(container) {
    if (!container) return false;
    const wrapper = container.closest('.message-in, .message-out');
    if (!wrapper) return true; // fallback: se não identificar, não bloqueia
    return wrapper.classList.contains('message-in');
  }

  // Extrai o texto principal da mensagem
  function extractMessageText(container) {
    if (!container) return '';
    // Seleciona spans onde geralmente ficam os textos
    const spans = container.querySelectorAll('span[dir="ltr"], span[dir="auto"]');
    let text = '';
    spans.forEach((span) => {
      // Ignora spans de metadados (horário, etc)
      if (span.closest('[data-testid="msg-meta"]')) return;
      const t = (span.textContent || '').trim();
      if (t) text += (text ? ' ' : '') + t;
    });
    return text.trim();
  }

  // ============================================
  // FUNÇÕES PARA CAPTURA DE IMAGENS
  // ============================================

  // Seletores para encontrar imagens nas mensagens do WhatsApp
  // OBS: CSS selector correto para "starts with" é ^=
  const imageSelectors = [
    'img[src^="blob:"]',
    'img[src^="data:"]',
    '[data-testid="image-thumb"] img',
    '[data-testid="media-url-provider"] img',
    '.image-thumb img',
    '._a3gq img', // classe comum de imagens
    'img.jciay' // outra classe de imagens
  ];

  // Extrai a imagem de um container de mensagem
  function extractMessageImage(container) {
    if (!container) return null;

    // Tenta encontrar imagem com os vários seletores
    for (const selector of imageSelectors) {
      try {
        const img = container.querySelector(selector);
        if (img && img.src) {
          return img;
        }
      } catch (e) {
        // seletor inválido (defensivo)
      }
    }

    // Busca genérica por qualquer img dentro do container de mídia
    const mediaContainer = container.querySelector('[data-testid*="image"], [data-testid*="media"], .media-inner');
    if (mediaContainer) {
      const img = mediaContainer.querySelector('img');
      if (img && img.src) {
        return img;
      }
    }

    return null;
  }

  // Converte uma imagem para Base64
  async function imageToBase64(imgElement) {
    return new Promise((resolve) => {
      try {
        // Se já é base64, retorna direto
        if (imgElement.src && imgElement.src.startsWith('data:')) {
          resolve(imgElement.src);
          return;
        }

        // Se é blob URL, converte via fetch
        if (imgElement.src && imgElement.src.startsWith('blob:')) {
          fetch(imgElement.src)
            .then((response) => response.blob())
            .then((blob) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            })
            .catch(() => {
              // Se fetch falhar, tenta via canvas
              convertViaCanvas(imgElement, resolve);
            });
          return;
        }

        // Tenta via canvas para outros casos
        convertViaCanvas(imgElement, resolve);
      } catch (e) {
        console.warn('[WPP Recovery] Erro ao converter imagem:', e);
        resolve(null);
      }
    });
  }

  // Converte imagem via canvas (fallback)
  function convertViaCanvas(imgElement, resolve) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Usa dimensões naturais ou renderizadas
      const width = imgElement.naturalWidth || imgElement.width || 300;
      const height = imgElement.naturalHeight || imgElement.height || 300;

      if (width === 0 || height === 0) {
        resolve(null);
        return;
      }

      canvas.width = width;
      canvas.height = height;

      // Desenha a imagem no canvas
      ctx.drawImage(imgElement, 0, 0, width, height);

      // Converte para base64
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve(dataUrl);
    } catch (e) {
      // CORS pode bloquear - isso é esperado em alguns casos
      console.warn('[WPP Recovery] Canvas bloqueado (CORS):', e.message);
      resolve(null);
    }
  }

  // Captura a imagem de um container e retorna base64
  async function captureImage(container) {
    const imgElement = extractMessageImage(container);
    if (!imgElement) return null;

    // Espera a imagem carregar completamente
    if (!imgElement.complete) {
      await new Promise((resolve) => {
        imgElement.onload = resolve;
        imgElement.onerror = resolve;
        // Timeout de segurança
        setTimeout(resolve, 3000);
      });
    }

    return await imageToBase64(imgElement);
  }

  // ============================================
  // FUNÇÕES DE DETECÇÃO E DECORAÇÃO
  // ============================================

  // Verifica se o container virou uma mensagem apagada
  function isDeletedMessageContainer(container) {
    if (!container) return false;
    const textAll = (container.innerText || '').trim();
    return deletedPatterns.some((re) => re.test(textAll));
  }

  // Marca visualmente mensagem apagada com o conteúdo original
  function decorateDeleted(container, entry) {
    if (!container) return;
    if (container.dataset.wppRecovered === 'deleted') return;

    const hasContent = entry.originalText || entry.originalImage;
    if (!hasContent) return;

    container.dataset.wppRecovered = 'deleted';

    // Container principal do badge
    const badge = document.createElement('div');
    badge.className = 'wpp-recovery-badge wpp-recovery-badge-deleted';
    badge.style.marginTop = '8px';
    badge.style.padding = '8px';
    badge.style.backgroundColor = 'rgba(241, 92, 92, 0.1)';
    badge.style.borderLeft = '3px solid #f15c5c';
    badge.style.borderRadius = '4px';

    // Título
    const title = document.createElement('div');
    title.style.fontSize = '11px';
    title.style.color = '#f15c5c';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    title.textContent = '🗑️ Mensagem apagada - Conteúdo recuperado:';
    badge.appendChild(title);

    // Se tem imagem, mostra ela
    if (entry.originalImage) {
      const imgContainer = document.createElement('div');
      imgContainer.style.marginBottom = '6px';

      const img = document.createElement('img');
      img.src = entry.originalImage;
      img.style.maxWidth = '200px';
      img.style.maxHeight = '200px';
      img.style.borderRadius = '4px';
      img.style.border = '1px solid rgba(241, 92, 92, 0.3)';
      img.style.cursor = 'pointer';
      img.title = 'Clique para ampliar';

      // Clique para ver em tamanho maior
      img.addEventListener('click', () => {
        openImageModal(entry.originalImage);
      });

      imgContainer.appendChild(img);
      badge.appendChild(imgContainer);
    }

    // Se tem texto, mostra ele
    if (entry.originalText) {
      const textDiv = document.createElement('div');
      textDiv.style.fontSize = '12px';
      textDiv.style.color = '#333';
      textDiv.style.fontStyle = 'italic';
      textDiv.style.wordBreak = 'break-word';
      textDiv.textContent = `"${entry.originalText}"`;
      badge.appendChild(textDiv);
    }

    container.appendChild(badge);
  }

  // Modal para visualizar imagem em tamanho maior
  function openImageModal(imageSrc) {
    // Remove modal existente se houver
    const existingModal = document.getElementById('wpp-recovery-modal');
    if (existingModal) existingModal.remove();

    // Cria overlay
    const modal = document.createElement('div');
    modal.id = 'wpp-recovery-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        cursor: pointer;
    `;

    // Imagem grande
    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;

    // Botão de fechar
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
        position: absolute;
        top: 20px;
        right: 30px;
        font-size: 30px;
        color: white;
        cursor: pointer;
        opacity: 0.8;
    `;
    closeBtn.onmouseover = () => (closeBtn.style.opacity = '1');
    closeBtn.onmouseout = () => (closeBtn.style.opacity = '0.8');

    // Botão de download
    const downloadBtn = document.createElement('div');
    downloadBtn.innerHTML = '⬇️ Baixar';
    downloadBtn.style.cssText = `
        position: absolute;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        background: #8b5cf6;
        color: white;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
    `;
    downloadBtn.onclick = (e) => {
      e.stopPropagation();
      downloadImage(imageSrc);
    };

    const cleanup = () => {
      modal.remove();
      document.removeEventListener('keydown', handleEsc);
    };

    // Fecha ao clicar no overlay
    modal.onclick = cleanup;
    img.onclick = (e) => e.stopPropagation();
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      cleanup();
    };

    // Fecha com ESC
    const handleEsc = (e) => {
      if (e.key === 'Escape') cleanup();
    };
    document.addEventListener('keydown', handleEsc);

    modal.appendChild(img);
    modal.appendChild(closeBtn);
    modal.appendChild(downloadBtn);
    document.body.appendChild(modal);
  }

  // Função para baixar a imagem
  function downloadImage(imageSrc) {
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = `whatsapp-recuperado-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Marca visualmente mensagem editada com o texto anterior
  function decorateEdited(container, previousText, previousImage) {
    if (!container) return;

    const hasContent = previousText || previousImage;
    if (!hasContent) return;

    // Permite várias edições: cria badge novo para cada edição
    const badge = document.createElement('div');
    badge.className = 'wpp-recovery-badge wpp-recovery-badge-edited';
    badge.style.marginTop = '4px';
    badge.style.padding = '6px';
    badge.style.backgroundColor = 'rgba(240, 165, 0, 0.1)';
    badge.style.borderLeft = '3px solid #f0a500';
    badge.style.borderRadius = '4px';

    const title = document.createElement('div');
    title.style.fontSize = '10px';
    title.style.color = '#f0a500';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '4px';
    title.textContent = '✏️ Versão anterior:';
    badge.appendChild(title);

    // Se tinha imagem diferente
    if (previousImage) {
      const img = document.createElement('img');
      img.src = previousImage;
      img.style.maxWidth = '100px';
      img.style.maxHeight = '100px';
      img.style.borderRadius = '4px';
      img.style.marginBottom = '4px';
      img.style.cursor = 'pointer';
      img.onclick = () => openImageModal(previousImage);
      badge.appendChild(img);
    }

    if (previousText) {
      const textDiv = document.createElement('div');
      textDiv.style.fontSize = '11px';
      textDiv.style.color = '#666';
      textDiv.style.fontStyle = 'italic';
      textDiv.textContent = `"${previousText}"`;
      badge.appendChild(textDiv);
    }

    container.appendChild(badge);
  }

  // ============================================
  // INDEXAÇÃO E PROCESSAMENTO
  // ============================================

  // Indexa uma única mensagem (texto + imagem)
  async function indexSingleMessage(container) {
    if (!container) return;
    if (!isIncomingMessage(container)) return;

    const id = container.getAttribute('data-id');
    if (!id) return;

    const text = extractMessageText(container);
    const image = await captureImage(container);

    // Se não tem texto nem imagem, ignora
    if (!text && !image) return;

    const existing = messageCache.get(id);

    if (!existing) {
      // Nova mensagem - salva tudo como original
      messageCache.set(id, {
        originalText: text,
        currentText: text,
        originalImage: image,
        currentImage: image
      });
    } else {
      // Atualiza valores atuais, mantém originais
      if (!existing.originalText && text) {
        existing.originalText = text;
      }
      if (!existing.originalImage && image) {
        existing.originalImage = image;
      }
      if (text) existing.currentText = text;
      if (image) existing.currentImage = image;
      messageCache.set(id, existing);
    }
  }

  // Faz um índice inicial de todas as mensagens já renderizadas
  async function indexExistingMessages(token) {
    const containers = document.querySelectorAll('[data-id]');
    console.log(`[WPP Recovery] Indexando ${containers.length} nós (filtrando apenas recebidas)...`);

    // Processa em batches para não travar
    const batchSize = 10;
    for (let i = 0; i < containers.length; i += batchSize) {
      if (token !== runToken || !isRunning) return;
      const batch = Array.from(containers).slice(i, i + batchSize);
      await Promise.all(
        batch.map((c) =>
          indexSingleMessage(c).catch((e) => console.warn('[WPP Recovery] indexSingleMessage erro:', e))
        )
      );
      // Pequena pausa entre batches
      await sleep(50);
    }

    console.log(`[WPP Recovery] ${messageCache.size} mensagens recebidas indexadas`);
  }

  // Trata um container de mensagem quando algo mudou nele
  async function handleMessageContainerChange(container) {
    if (!container) return;
    if (!isIncomingMessage(container)) return;

    const id = container.getAttribute('data-id');
    if (!id) return;

    const entry = messageCache.get(id);

    // Caso 1: ficou apagada
    if (isDeletedMessageContainer(container)) {
      if (entry && (entry.originalText || entry.originalImage)) {
        decorateDeleted(container, entry);
      }
      return;
    }

    // Caso 2: possível edição
    const newText = extractMessageText(container);
    const newImage = await captureImage(container);

    if (!entry) {
      // primeira vez que vemos essa mensagem
      if (newText || newImage) {
        messageCache.set(id, {
          originalText: newText,
          currentText: newText,
          originalImage: newImage,
          currentImage: newImage
        });
      }
      return;
    }

    // Verifica se houve edição de texto
    const textChanged = Boolean(newText && entry.currentText && newText !== entry.currentText);
    // Verifica se houve edição de imagem (mais raro)
    const imageChanged = Boolean(newImage && entry.currentImage && newImage !== entry.currentImage);

    if (textChanged || imageChanged) {
      // Houve alteração -> considerar como edição
      decorateEdited(container, textChanged ? entry.currentText : null, imageChanged ? entry.currentImage : null);

      // Atualiza cache
      if (newText) entry.currentText = newText;
      if (newImage) entry.currentImage = newImage;
      messageCache.set(id, entry);
    }
  }

  // Processa nós adicionados ou alterados pelo MutationObserver
  async function processMutationNode(node) {
    if (!isRunning) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const container = getMessageContainerFromNode(node.parentElement);
      await handleMessageContainerChange(container);
      return;
    }

    if (!(node instanceof Element)) return;

    // Se o próprio nó é um container de mensagem
    if (node.hasAttribute('data-id')) {
      await indexSingleMessage(node);
      await handleMessageContainerChange(node);
    }

    // Ou se ele tem containers de mensagem dentro
    const innerContainers = node.querySelectorAll('[data-id]');
    for (const c of innerContainers) {
      await indexSingleMessage(c);
      await handleMessageContainerChange(c);
    }
  }

  // Inicia o MutationObserver no body inteiro
  function startObserver() {
    if (observer) {
      try {
        observer.disconnect();
      } catch (_) {}
    }

    observer = new MutationObserver((mutations) => {
      if (!isRunning) return;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            void processMutationNode(node).catch((e) => console.warn('[WPP Recovery] mutation node erro:', e));
          });
        } else if (mutation.type === 'characterData') {
          void processMutationNode(mutation.target).catch((e) => console.warn('[WPP Recovery] characterData erro:', e));
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    console.log('[WPP Recovery] Observer iniciado');
  }

  // Injeta estilos CSS
  function injectStyles() {
    // Estilo principal
    styleEl = document.createElement('style');
    styleEl.id = 'wpp-recovery-style';
    styleEl.textContent = `
        [data-wpp-recovered="deleted"] {
            background: linear-gradient(to right, rgba(241, 92, 92, 0.05), transparent) !important;
        }
    `;
    document.head.appendChild(styleEl);

    // Animação
    animStyleEl = document.createElement('style');
    animStyleEl.id = 'wpp-recovery-style-anim';
    animStyleEl.textContent = `
        @keyframes wppRecoverySlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(animStyleEl);
  }

  // Mostra notificação de inicialização
  function showInitNotification() {
    const notification = document.createElement('div');
    notification.id = 'wpp-recovery-notification';
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: #8b5cf6;
        color: white;
        border-radius: 8px;
        font-size: 13px;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: wppRecoverySlideIn 0.3s ease;
    `;
    notification.innerHTML = '✅ <strong>WPP Recovery</strong> ativo! Mensagens recebidas sendo monitoradas.';

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      notification.style.transition = 'all 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  function cleanupDomArtifacts() {
    // Remove badges
    document.querySelectorAll('.wpp-recovery-badge').forEach((el) => el.remove());

    // Remove dataset flags
    document.querySelectorAll('[data-wpp-recovered]').forEach((el) => {
      try {
        delete el.dataset.wppRecovered;
      } catch (_) {}
    });

    // Remove modal se existir
    const modal = document.getElementById('wpp-recovery-modal');
    if (modal) modal.remove();

    // Remove styles
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
    if (animStyleEl) {
      animStyleEl.remove();
      animStyleEl = null;
    }

    // Remove notification se ainda estiver na tela
    const notification = document.getElementById('wpp-recovery-notification');
    if (notification) notification.remove();
  }

  async function startRecovery() {
    if (isRunning) return;
    isRunning = true;
    runToken++;
    const token = runToken;

    console.log('[WPP Recovery] Iniciando...');
    await waitForWhatsAppReady(token);
    if (token !== runToken || !isRunning) return;

    injectStyles();
    await indexExistingMessages(token);
    if (token !== runToken || !isRunning) return;

    startObserver();
    showInitNotification();
    console.log('[WPP Recovery] Pronto! Monitorando mensagens recebidas.');
  }

  function stopRecovery() {
    if (!isRunning) return;
    isRunning = false;
    runToken++;

    try {
      if (observer) observer.disconnect();
    } catch (_) {}
    observer = null;

    messageCache.clear();
    cleanupDomArtifacts();
    console.log('[WPP Recovery] Desativado.');
  }

  // =========================
  // Boot: lê setting e observa mudanças
  // =========================
  (async () => {
    try {
      isEnabled = await getEnabledSetting();
      if (isEnabled) startRecovery();
    } catch (_) {
      // ignore
    }

    // Ouvir alterações do toggle no popup
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;
        if (!changes || !changes[RECOVERY_STORAGE_KEY]) return;

        const next = Boolean(changes[RECOVERY_STORAGE_KEY].newValue);
        isEnabled = next;
        if (next) startRecovery();
        else stopRecovery();
      });
    } catch (e) {
      // ignore
    }
  })();
})();
