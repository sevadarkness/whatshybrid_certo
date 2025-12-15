// wpp_backup_tool.js
// Backup completo do WhatsApp Web (conversas + bloqueados) gerando ZIP + XLSX.
// Roda apenas sob ação explícita do usuário (Quick Actions / menu da extensão).

(function() {
    'use strict';

    // Evita redefinir em hot reload
    if (window.WppBackupTool && window.WppBackupTool.__v === 1) return;

    // =============================
    // CONFIG
    // =============================

    const CONFIG = {
        delays: {
            betweenChats: 1200,
            scrollPause: 450,
            afterClick: 700,
            messageLoad: 400,
            scrollMessages: 500,
        },
        limits: {
            messagesPerChat: 500,
            scrollAttempts: 40,
            blockedLastMessages: 10,
            chatListStallRounds: 8,
        },
        files: {
            zipName: 'whatsapp-backup',
            excelName: 'contatos-bloqueados.xlsx',
            chatFolder: 'conversas',
            mediaFolder: 'midias',
        }
    };

    // =============================
    // UTIL
    // =============================

    const te = new TextEncoder();

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function toast(type, title, message) {
        try {
            if (window.NotificationCenter) {
                const fn = NotificationCenter[type] || NotificationCenter.info;
                return fn.call(NotificationCenter, title || 'Info', message || '');
            }
            if (window.OverlayManager?.showToast) {
                return OverlayManager.showToast(`${title || ''} ${message || ''}`.trim(), type || 'info');
            }
        } catch { /* ignore */ }
        console.log('[WPP Backup]', type, title, message);
        return null;
    }

    function formatDate(date) {
        try {
            return new Date(date).toLocaleString('pt-BR');
        } catch {
            return String(date);
        }
    }

    function sanitizeFileName(name) {
        return String(name || 'sem-nome')
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function xmlEscape(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function findFirstScrollable(root) {
        if (!root) return null;
        const el = root;
        const candidates = [el, ...Array.from(el.querySelectorAll('*'))];
        for (const c of candidates) {
            try {
                const cs = getComputedStyle(c);
                const canScroll = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && c.scrollHeight > c.clientHeight;
                if (canScroll) return c;
            } catch { /* ignore */ }
        }
        // fallback
        return el;
    }

    // =============================
    // CRC32 + ZIP writer (store)
    // =============================

    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function dosTime(date) {
        const d = date instanceof Date ? date : new Date();
        const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((Math.floor(d.getSeconds() / 2) & 0x1F));
        const dt = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | ((d.getDate() & 0x1F));
        return { time, date: dt };
    }

    function u16(n) {
        const b = new Uint8Array(2);
        b[0] = n & 0xFF;
        b[1] = (n >>> 8) & 0xFF;
        return b;
    }

    function u32(n) {
        const b = new Uint8Array(4);
        b[0] = n & 0xFF;
        b[1] = (n >>> 8) & 0xFF;
        b[2] = (n >>> 16) & 0xFF;
        b[3] = (n >>> 24) & 0xFF;
        return b;
    }

    function concatBytes(parts) {
        const total = parts.reduce((s, p) => s + p.length, 0);
        const out = new Uint8Array(total);
        let o = 0;
        for (const p of parts) {
            out.set(p, o);
            o += p.length;
        }
        return out;
    }

    class ZipWriter {
        constructor() {
            this.files = [];
        }

        addText(path, text) {
            const nameBytes = te.encode(String(path));
            const data = te.encode(String(text));
            this.files.push({ path, nameBytes, data });
        }

        addBytes(path, bytes) {
            const nameBytes = te.encode(String(path));
            const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            this.files.push({ path, nameBytes, data });
        }

        generate() {
            const localParts = [];
            const centralParts = [];
            let offset = 0;
            const now = dosTime(new Date());
            const utf8Flag = 0x0800;

            for (const f of this.files) {
                const crc = crc32(f.data);
                const size = f.data.length;
                const nameLen = f.nameBytes.length;

                // Local file header
                const localHeader = concatBytes([
                    u32(0x04034b50),
                    u16(20),
                    u16(utf8Flag),
                    u16(0),
                    u16(now.time),
                    u16(now.date),
                    u32(crc),
                    u32(size),
                    u32(size),
                    u16(nameLen),
                    u16(0),
                    f.nameBytes
                ]);

                localParts.push(localHeader, f.data);

                // Central directory header
                const centralHeader = concatBytes([
                    u32(0x02014b50),
                    u16(20),
                    u16(20),
                    u16(utf8Flag),
                    u16(0),
                    u16(now.time),
                    u16(now.date),
                    u32(crc),
                    u32(size),
                    u32(size),
                    u16(nameLen),
                    u16(0),
                    u16(0),
                    u16(0),
                    u16(0),
                    u32(0),
                    u32(offset),
                    f.nameBytes
                ]);

                centralParts.push(centralHeader);
                offset += localHeader.length + f.data.length;
            }

            const centralDir = concatBytes(centralParts);
            const centralOffset = offset;
            const centralSize = centralDir.length;

            const end = concatBytes([
                u32(0x06054b50),
                u16(0),
                u16(0),
                u16(this.files.length),
                u16(this.files.length),
                u32(centralSize),
                u32(centralOffset),
                u16(0)
            ]);

            return concatBytes([...localParts, centralDir, end]);
        }
    }

    // =============================
    // XLSX builder (mínimo)
    // =============================

    function colLetters(n) {
        let s = '';
        let x = n + 1;
        while (x > 0) {
            const r = (x - 1) % 26;
            s = String.fromCharCode(65 + r) + s;
            x = Math.floor((x - 1) / 26);
        }
        return s;
    }

    function buildSheetXml(rows) {
        const sheetRows = rows.map((row, rIndex) => {
            const cells = row.map((val, cIndex) => {
                const ref = `${colLetters(cIndex)}${rIndex + 1}`;
                const v = xmlEscape(val);
                return `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
            }).join('');
            return `<row r="${rIndex + 1}">${cells}</row>`;
        }).join('');

        return `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>
    ${sheetRows}
  </sheetData>
</worksheet>`;
    }

    function buildXlsx(rows, sheetName = 'Bloqueados') {
        const zip = new ZipWriter();

        const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

        const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

        const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

        const workbookRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

        const styles = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

        zip.addText('[Content_Types].xml', contentTypes);
        zip.addText('_rels/.rels', rels);
        zip.addText('xl/workbook.xml', workbook);
        zip.addText('xl/_rels/workbook.xml.rels', workbookRels);
        zip.addText('xl/styles.xml', styles);
        zip.addText('xl/worksheets/sheet1.xml', buildSheetXml(rows));

        return zip.generate();
    }

    // =============================
    // DOWNLOAD helper
    // =============================

    function createDownloadUrl(bytes, mime = 'application/octet-stream') {
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        let revoked = false;
        return {
            url,
            revoke: () => {
                if (revoked) return;
                revoked = true;
                try { URL.revokeObjectURL(url); } catch { /* ignore */ }
            }
        };
    }

    function triggerDownload(url, filename) {
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            return true;
        } catch {
            return false;
        }
    }

    // Mantido por compatibilidade interna. Retorna também a URL caso você queira reusar.
    function downloadBytes(bytes, filename, mime = 'application/octet-stream') {
        const dl = createDownloadUrl(bytes, mime);
        triggerDownload(dl.url, filename);
        // fallback: revoga depois de um tempo, mas a UI pode manter até o usuário fechar.
        setTimeout(() => dl.revoke(), 10 * 60 * 1000);
        return dl;
    }

    function dataUrlToBytes(dataUrl) {
        const parts = String(dataUrl).split(',');
        if (parts.length < 2) return null;
        const bin = atob(parts[1]);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    // =============================
    // UI de progresso (baseado no código do usuário)
    // =============================

    const WPP_BACKUP_UI_CSS = `
        #wpp-backup-progress {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 24px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 999999;
            min-width: 420px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        #wpp-backup-progress h2 {
            margin: 0 0 16px 0;
            color: #8b5cf6;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        #wpp-backup-progress .progress-container {
            background: #e0e0e0;
            border-radius: 10px;
            height: 18px;
            overflow: hidden;
            margin-bottom: 12px;
        }
        #wpp-backup-progress .progress-bar {
            background: linear-gradient(90deg, #8b5cf6, #3b82f6);
            height: 100%;
            width: 0%;
            transition: width 0.25s ease;
            border-radius: 10px;
        }
        #wpp-backup-progress .status {
            font-size: 14px;
            color: #333;
            margin-bottom: 6px;
            font-weight: 600;
        }
        #wpp-backup-progress .detail {
            font-size: 12px;
            color: #666;
            margin-bottom: 16px;
            min-height: 18px;
        }
        #wpp-backup-progress .buttons {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
        #wpp-backup-progress button {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s;
        }
        #wpp-backup-progress .btn-primary {
            background: linear-gradient(135deg, #8b5cf6, #3b82f6);
            color: #fff;
        }
        #wpp-backup-progress .btn-primary:hover { filter: brightness(0.95); }
        #wpp-backup-progress .btn-cancel {
            background: #f5f5f5;
            color: #666;
        }
        #wpp-backup-progress .btn-cancel:hover { background: #e0e0e0; }
        #wpp-backup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.45);
            z-index: 999998;
        }
        #wpp-backup-progress .spinner {
            display: inline-block;
            width: 18px;
            height: 18px;
            border: 3px solid #e0e0e0;
            border-top-color: #8b5cf6;
            border-radius: 50%;
            animation: wpp-spin 1s linear infinite;
        }
        @keyframes wpp-spin { to { transform: rotate(360deg); } }
    `;

    class ProgressUI {
        constructor() {
            this.container = null;
            this.progressBar = null;
            this.statusText = null;
            this.detailText = null;
            this.cancelBtn = null;
            this.cancelled = false;
            this.downloadInfo = null;
        }

        create() {
            this.remove();
            this.cancelled = false;
            this.container = document.createElement('div');
            this.container.id = 'wpp-backup-progress';
            this.container.innerHTML = `
                <style>${WPP_BACKUP_UI_CSS}</style>
                <h2><span class="spinner"></span> Backup do WhatsApp</h2>
                <div class="progress-container"><div class="progress-bar"></div></div>
                <div class="status">Iniciando...</div>
                <div class="detail"></div>
                <div class="buttons"><button class="btn-cancel">Cancelar</button></div>
            `;

            const overlay = document.createElement('div');
            overlay.id = 'wpp-backup-overlay';
            document.body.appendChild(overlay);
            document.body.appendChild(this.container);

            this.progressBar = this.container.querySelector('.progress-bar');
            this.statusText = this.container.querySelector('.status');
            this.detailText = this.container.querySelector('.detail');
            this.cancelBtn = this.container.querySelector('.btn-cancel');
            this.cancelBtn.addEventListener('click', () => {
                this.cancelled = true;
                this.updateStatus('Cancelando...');
            });
        }

        updateProgress(percent) {
            if (this.progressBar) this.progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }

        updateStatus(status) {
            if (this.statusText) this.statusText.textContent = status;
        }

        updateDetail(detail) {
            if (this.detailText) this.detailText.textContent = detail || '';
        }

        isCancelled() { return this.cancelled; }

        remove() {
            document.getElementById('wpp-backup-progress')?.remove();
            document.getElementById('wpp-backup-overlay')?.remove();
            try {
                this.downloadInfo?.revoke?.();
            } catch { /* ignore */ }
            this.downloadInfo = null;
            this.container = null;
        }

        showComplete(stats, downloadInfo) {
            if (!this.container) return;

            // guarda link de download para botão manual (user gesture)
            this.downloadInfo = downloadInfo || null;

            this.container.innerHTML = `
                <style>${WPP_BACKUP_UI_CSS}</style>
                <h2 style="color:#3b82f6;">✅ Backup Concluído!</h2>
                <div style="margin: 16px 0; font-size: 14px; color: #333;">
                    <p><strong>📊 Estatísticas:</strong></p>
                    <ul style="margin: 10px 0; padding-left: 18px;">
                        <li>Conversas: ${stats.totalChats}</li>
                        <li>Mensagens: ${stats.totalMessages}</li>
                        <li>Arquivadas: ${stats.archivedChats}</li>
                        <li>Bloqueados: ${stats.blockedContacts}</li>
                        <li>Mídias: ${stats.totalMedia}</li>
                    </ul>
                </div>
                <div class="buttons">
                    ${this.downloadInfo?.url ? '<button class="btn-primary" id="wpp-backup-download">⬇️ Baixar ZIP</button>' : ''}
                    <button class="btn-cancel" id="wpp-backup-close">Fechar</button>
                </div>
            `;

            // botão de download manual (mais confiável - gesto do usuário)
            this.container.querySelector('#wpp-backup-download')?.addEventListener('click', () => {
                if (!this.downloadInfo?.url) return;
                const name = this.downloadInfo?.filename || 'whatsapp-backup.zip';
                triggerDownload(this.downloadInfo.url, name);
            });
            this.container.querySelector('#wpp-backup-close')?.addEventListener('click', () => this.remove());
        }

        showError(message) {
            if (!this.container) return;
            try {
                this.downloadInfo?.revoke?.();
            } catch { /* ignore */ }
            this.downloadInfo = null;
            this.container.innerHTML = `
                <style>${WPP_BACKUP_UI_CSS}</style>
                <h2 style="color:#f15c5c;">❌ Erro no Backup</h2>
                <div style="margin: 16px 0; font-size: 14px; color: #333;">
                    <p>${escapeHtml(message || 'Erro desconhecido')}</p>
                </div>
                <div class="buttons">
                    <button class="btn-cancel" id="wpp-backup-close">Fechar</button>
                </div>
            `;
            this.container.querySelector('#wpp-backup-close')?.addEventListener('click', () => this.remove());
        }
    }

    // =============================
    // WhatsApp DOM helpers
    // =============================

    async function waitForWhatsAppReady() {
        const timeoutAt = Date.now() + 30_000;
        while (Date.now() < timeoutAt) {
            if (document.querySelector('#app, #pane-side')) {
                await sleep(1200);
                return true;
            }
            await sleep(400);
        }
        return false;
    }

    function findChatListRoot() {
        if (window.SelectorEngine?.find) {
            return SelectorEngine.find('chatList') || document.querySelector('#pane-side');
        }
        return document.querySelector('[data-testid="chat-list"], [aria-label="Lista de conversas"], #pane-side');
    }

    function findScrollableChatList() {
        const root = findChatListRoot();
        return findFirstScrollable(root) || root;
    }

    function findChatItems() {
        if (window.SelectorEngine?.findAll) {
            const items = SelectorEngine.findAll('chatItem');
            if (items && items.length) return items;
        }
        return Array.from(document.querySelectorAll('[data-testid="cell-frame-container"], [data-testid="list-item-content"], #pane-side [role="listitem"]'));
    }

    function getChatTitleFromItem(item) {
        if (!item) return '';
        const titleEl = item.querySelector('span[dir="auto"][title], span[dir="auto"]');
        return (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim();
    }

    function isLockedChatItem(item) {
        return !!item?.querySelector('[data-icon="lock"], [data-testid="locked-chats"], [data-testid="locked-chat"]');
    }

    async function openChatByElement(item) {
        try {
            item.scrollIntoView({ block: 'center' });
            item.click();
            await sleep(CONFIG.delays.afterClick);
            return true;
        } catch {
            return false;
        }
    }

    function findScrollableMessagesContainer() {
        const candidates = [
            document.querySelector('[data-testid="conversation-panel-messages"]'),
            document.querySelector('#main [role="application"]'),
            document.querySelector('#main')
        ].filter(Boolean);
        for (const c of candidates) {
            const sc = findFirstScrollable(c);
            if (sc && sc.scrollHeight > sc.clientHeight) return sc;
        }
        return candidates[0] || null;
    }

    function extractCurrentChatInfo() {
        // Tentativa via SelectorEngine / Bridge
        try {
            if (window.WhatsHybridBridge?.getCurrentChat) {
                // Não await aqui para não depender; só fallback.
            }
        } catch { /* ignore */ }

        const header = document.querySelector('#main header, header');
        const titleEl = header?.querySelector('span[dir="auto"][title], span[dir="auto"]');
        const subtitleEl = header?.querySelector('span[title*="+"]') || header?.querySelector('span._ao3e');
        return {
            name: (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim() || 'Sem nome',
            phone: (subtitleEl?.getAttribute('title') || subtitleEl?.textContent || '').trim()
        };
    }

    function extractMessageText(msgEl) {
        const spans = msgEl.querySelectorAll('span.selectable-text, span[dir="ltr"], span[dir="auto"]');
        const parts = [];
        spans.forEach(s => {
            if (s.closest('[data-testid="msg-meta"]')) return;
            const t = (s.textContent || '').trim();
            if (t) parts.push(t);
        });
        return parts.join(' ').trim();
    }

    function extractMessageTime(msgEl) {
        const timeEl = msgEl.querySelector('[data-testid="msg-meta"] span, [data-testid="msg-meta"]');
        const t = (timeEl?.textContent || '').trim();
        return t;
    }

    function extractFirstImageEl(msgEl) {
        // Tenta os seletores mais comuns
        const img = msgEl.querySelector('img[src^="blob:"], img[src^="data:"], [data-testid="image-thumb"] img, [data-testid="media-url-provider"] img');
        return img || null;
    }

    async function imageToDataUrl(imgEl) {
        if (!imgEl || !imgEl.src) return null;
        try {
            if (!imgEl.complete) {
                await new Promise(resolve => {
                    const to = setTimeout(resolve, 2500);
                    imgEl.onload = () => { clearTimeout(to); resolve(); };
                    imgEl.onerror = () => { clearTimeout(to); resolve(); };
                });
            }
            if (imgEl.src.startsWith('data:')) return imgEl.src;
            if (imgEl.src.startsWith('blob:')) {
                const blob = await fetch(imgEl.src).then(r => r.blob());
                return await new Promise(resolve => {
                    const fr = new FileReader();
                    fr.onloadend = () => resolve(fr.result);
                    fr.onerror = () => resolve(null);
                    fr.readAsDataURL(blob);
                });
            }
            // canvas fallback
            const canvas = document.createElement('canvas');
            const w = imgEl.naturalWidth || imgEl.width || 300;
            const h = imgEl.naturalHeight || imgEl.height || 300;
            if (!w || !h) return null;
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d')?.drawImage(imgEl, 0, 0, w, h);
            return canvas.toDataURL('image/jpeg', 0.85);
        } catch {
            return null;
        }
    }

    async function extractMessagesFromCurrentChat(maxMessages = CONFIG.limits.messagesPerChat) {
        const container = findScrollableMessagesContainer();
        if (!container) return [];

        // Scroll para carregar histórico (melhor esforço)
        let attempts = 0;
        let lastCount = -1;
        while (attempts < CONFIG.limits.scrollAttempts) {
            container.scrollTop = 0;
            await sleep(CONFIG.delays.scrollMessages);
            const count = container.querySelectorAll('[data-testid="msg-container"]').length;
            if (count === lastCount) attempts++;
            else {
                attempts = 0;
                lastCount = count;
            }
            if (count >= maxMessages) break;
            if (attempts >= 5) break;
        }

        const msgEls = Array.from(document.querySelectorAll('[data-testid="msg-container"]'));
        const messages = [];

        for (let i = 0; i < msgEls.length && messages.length < maxMessages; i++) {
            const msgEl = msgEls[i];
            const text = extractMessageText(msgEl);
            const time = extractMessageTime(msgEl);
            const isOutgoing = !!msgEl.closest('[data-testid="msg-out"], .message-out');
            const imgEl = extractFirstImageEl(msgEl);
            const mediaUrl = imgEl?.src || null;

            if (!text && !mediaUrl) continue;
            messages.push({
                index: messages.length + 1,
                type: isOutgoing ? 'sent' : 'received',
                text,
                time,
                hasMedia: !!mediaUrl,
                mediaUrl
            });
        }

        return messages;
    }

    // =============================
    // Navegação: arquivadas + bloqueados
    // =============================

    async function openArchivedView() {
        const btn = document.querySelector('[data-testid="archived"], [aria-label*="Arquiv"], [aria-label*="Archiv"]');
        if (!btn) return false;
        btn.click();
        await sleep(CONFIG.delays.afterClick);
        return true;
    }

    async function backToMainChats() {
        const backBtn = document.querySelector('[data-testid="back"], [aria-label="Voltar"], [aria-label="Back"]');
        if (backBtn) {
            backBtn.click();
            await sleep(CONFIG.delays.afterClick);
            return true;
        }
        return false;
    }

    async function getBlockedContacts(progress) {
        const blocked = [];
        try {
            // Abre menu (⋮)
            const menuBtn = document.querySelector('[data-testid="menu"], [aria-label="Menu"], [aria-label="More options"]');
            menuBtn?.click();
            await sleep(400);

            // Configurações / Settings
            const settingsBtn = document.querySelector('[data-testid="settings"], [aria-label*="Configura"], [aria-label*="Settings"]')
                || Array.from(document.querySelectorAll('div[role="button"], li[role="button"], button'))
                    .find(el => /configura|settings/i.test(el.textContent || ''));

            if (!settingsBtn) return blocked;
            settingsBtn.click();
            await sleep(CONFIG.delays.afterClick);

            // Privacidade / Privacy
            const privacyBtn = document.querySelector('[data-testid="privacy"], [aria-label*="Privacidade"], [aria-label*="Privacy"]')
                || Array.from(document.querySelectorAll('div[role="button"], li[role="button"], button'))
                    .find(el => /privacidade|privacy/i.test(el.textContent || ''));
            if (!privacyBtn) return blocked;
            privacyBtn.click();
            await sleep(CONFIG.delays.afterClick);

            // Bloqueados / Blocked
            const blockedBtn = document.querySelector('[data-testid="blocked-contacts"], [aria-label*="Bloque"], [aria-label*="Blocked"]')
                || Array.from(document.querySelectorAll('div[role="button"], li[role="button"], button'))
                    .find(el => /bloquead|blocked/i.test(el.textContent || ''));
            if (!blockedBtn) return blocked;
            blockedBtn.click();
            await sleep(CONFIG.delays.afterClick);

            // Lista
            const items = Array.from(document.querySelectorAll('[data-testid="contact-list-item"], [role="listitem"]'));
            for (const item of items) {
                const nameEl = item.querySelector('span[dir="auto"], span[title]');
                const phoneEl = item.querySelector('span[title*="+"]') || item.querySelector('span._ao3e');
                const name = (nameEl?.getAttribute('title') || nameEl?.textContent || '').trim() || 'Desconhecido';
                const phone = (phoneEl?.getAttribute('title') || phoneEl?.textContent || '').trim();
                if (name || phone) blocked.push({ name, phone, lastMessages: [] });
            }

        } catch (e) {
            console.warn('[WPP Backup] Erro ao obter bloqueados', e);
        } finally {
            // Fecha telas (até 4x back)
            for (let i = 0; i < 4; i++) {
                const back = document.querySelector('[data-testid="back"], [aria-label="Voltar"], [aria-label="Back"], [aria-label="Fechar"], [aria-label="Close"]');
                if (!back) break;
                back.click();
                await sleep(250);
            }
        }

        if (progress) progress.updateDetail(`${blocked.length} bloqueados encontrados`);
        return blocked;
    }

    // =============================
    // Geradores de arquivo (TXT/HTML)
    // =============================

    function generateChatTxt(chatName, chatInfo, messages) {
        const header = `═══════════════════════════════════════════════════════════════\n` +
            `BACKUP DO WHATSAPP - ${chatName}\n` +
            `═══════════════════════════════════════════════════════════════\n` +
            `Data do backup: ${formatDate(new Date())}\n` +
            `Número: ${chatInfo.phone || 'N/A'}\n` +
            `Total de mensagens: ${messages.length}\n` +
            `═══════════════════════════════════════════════════════════════\n\n`;

        const body = messages.map(m => {
            const who = m.type === 'sent' ? '→ Você' : `← ${chatName}`;
            const media = m.hasMedia ? ' [📷 Mídia]' : '';
            const t = m.time ? `[${m.time}] ` : '';
            return `${t}${who}${media}\n${m.text || '(mídia)'}\n`;
        }).join('\n');

        return header + body;
    }

    function generateChatHtml(chatName, chatInfo, messages) {
        const rows = messages.map(m => {
            const cls = m.type === 'sent' ? 'sent' : 'received';
            return `
                <div class="message ${cls}">
                    ${m.hasMedia ? '<span class="media-badge">📷 Mídia</span>' : ''}
                    <div class="text">${escapeHtml(m.text) || '(mídia)'}</div>
                    <div class="time">${escapeHtml(m.time || '')}</div>
                </div>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Chat - ${escapeHtml(chatName)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#e5ddd5;padding:20px}
    .container{max-width:900px;margin:0 auto}
    .header{background:#8b5cf6;color:#020617;padding:18px;border-radius:10px 10px 0 0}
    .header h1{font-size:18px;margin-bottom:6px}
    .header p{font-size:12px;opacity:.9}
    .messages{background:#e5ddd5;padding:18px;min-height:320px}
    .message{max-width:72%;padding:10px 14px;border-radius:10px;margin-bottom:10px;word-wrap:break-word}
    .message.sent{background:#dcf8c6;margin-left:auto;border-bottom-right-radius:0}
    .message.received{background:#fff;margin-right:auto;border-bottom-left-radius:0}
    .message .text{font-size:14px;color:#303030;white-space:pre-wrap}
    .message .time{font-size:11px;color:#999;text-align:right;margin-top:6px}
    .media-badge{background:#3b82f6;color:#020617;font-size:10px;padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:6px}
    .footer{background:#f0f0f0;padding:12px;border-radius:0 0 10px 10px;font-size:12px;color:#666;text-align:center}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(chatName)}</h1>
      <p>${escapeHtml(chatInfo.phone || 'Número não disponível')}</p>
      <p>Backup realizado em: ${escapeHtml(formatDate(new Date()))}</p>
    </div>
    <div class="messages">${rows}</div>
    <div class="footer">Total: ${messages.length} mensagens | WhatsApp Backup Tool</div>
  </div>
</body>
</html>`;
    }

    function buildBlockedRows(blockedContacts) {
        const header = [
            'Nome',
            'Número',
            ...Array.from({ length: CONFIG.limits.blockedLastMessages }, (_, i) => `Última Msg ${i + 1}`)
        ];
        const rows = [
            ['CONTATOS BLOQUEADOS - WHATSAPP BACKUP'],
            [`Data do backup: ${formatDate(new Date())}`],
            [],
            header
        ];
        blockedContacts.forEach(c => {
            const msgs = (c.lastMessages || []).slice(0, CONFIG.limits.blockedLastMessages);
            const row = [c.name || '', c.phone || ''];
            for (let i = 0; i < CONFIG.limits.blockedLastMessages; i++) {
                row.push(msgs[i]?.text || '');
            }
            rows.push(row);
        });
        return rows;
    }

    // =============================
    // MAIN
    // =============================

    let running = false;

    async function startBackup() {
        if (running) {
            toast('warning', 'Backup já em andamento', 'Aguarde finalizar ou cancele o atual.');
            return;
        }
        running = true;

        const ok = confirm(
            '🔄 BACKUP COMPLETO DO WHATSAPP\n\n' +
            'Este processo irá:\n' +
            '• Fazer backup de TODAS as conversas\n' +
            '• Incluir conversas arquivadas (se disponível)\n' +
            '• Gerar Excel com contatos bloqueados\n' +
            '• Capturar imagens quando possível\n\n' +
            '⚠️ O processo pode demorar vários minutos.\n' +
            '⚠️ Evite usar o WhatsApp durante o backup.\n\n' +
            'Deseja continuar?'
        );
        if (!ok) {
            running = false;
            return;
        }

        const progress = new ProgressUI();
        const zip = new ZipWriter();
        const stats = {
            totalChats: 0,
            totalMessages: 0,
            archivedChats: 0,
            blockedContacts: 0,
            totalMedia: 0,
        };

        try {
            const ready = await waitForWhatsAppReady();
            if (!ready) throw new Error('WhatsApp Web não foi detectado.');

            progress.create();
            progress.updateStatus('Preparando backup...');
            progress.updateProgress(2);

            // Map auxiliar para tentar preencher últimas mensagens dos bloqueados
            const lastMessagesByName = new Map();

            // =========
            // Conversas normais
            // =========
            progress.updateStatus('Coletando conversas...');
            progress.updateProgress(5);

            const scrollable = findScrollableChatList();
            const visitedKeys = new Set();
            let stall = 0;
            let prevVisited = 0;

            // Garante topo
            try { scrollable.scrollTop = 0; } catch { /* ignore */ }
            await sleep(600);

            while (stall < CONFIG.limits.chatListStallRounds) {
                if (progress.isCancelled()) throw new Error('Backup cancelado pelo usuário');

                const items = findChatItems();
                for (const item of items) {
                    if (progress.isCancelled()) throw new Error('Backup cancelado pelo usuário');

                    const title = getChatTitleFromItem(item);
                    if (!title) continue;

                    // Chave simples (nome). Não é perfeito, mas funciona na maioria dos casos.
                    const key = title;
                    if (visitedKeys.has(key)) continue;
                    visitedKeys.add(key);
                    stats.totalChats++;

                    if (isLockedChatItem(item)) {
                        // pula trancados
                        continue;
                    }

                    progress.updateStatus(`Processando conversas (${stats.totalChats})`);
                    progress.updateDetail(title);

                    const opened = await openChatByElement(item);
                    if (!opened) continue;

                    await sleep(CONFIG.delays.messageLoad);
                    const chatInfo = extractCurrentChatInfo();
                    const messages = await extractMessagesFromCurrentChat();

                    // Estatísticas
                    stats.totalMessages += messages.length;
                    const mediaCount = messages.filter(m => m.hasMedia).length;
                    stats.totalMedia += mediaCount;

                    // Guarda últimas mensagens para (tentar) associar aos bloqueados
                    const lastMsgs = messages.slice(-CONFIG.limits.blockedLastMessages).map(m => ({ text: m.text || '(mídia)' }));
                    lastMessagesByName.set(title.toLowerCase(), lastMsgs);

                    // Arquivos
                    const safe = sanitizeFileName(title);
                    zip.addText(`${CONFIG.files.chatFolder}/${safe}.txt`, generateChatTxt(title, chatInfo, messages));
                    zip.addText(`${CONFIG.files.chatFolder}/${safe}.html`, generateChatHtml(title, chatInfo, messages));

                    // Mídias (melhor esforço)
                    for (let i = 0; i < messages.length; i++) {
                        const m = messages[i];
                        if (!m.hasMedia || !m.mediaUrl) continue;
                        const imgEl = document.querySelector(`img[src="${CSS.escape(m.mediaUrl)}"]`) || extractFirstImageEl(document);
                        const dataUrl = await imageToDataUrl(imgEl);
                        const bytes = dataUrl ? dataUrlToBytes(dataUrl) : null;
                        if (bytes) {
                            zip.addBytes(`${CONFIG.files.mediaFolder}/${safe}_${i + 1}.jpg`, bytes);
                        }
                    }

                    await sleep(CONFIG.delays.betweenChats);
                }

                // Controle de progresso (fase 5%..70%)
                const p = 5 + Math.min(65, (visitedKeys.size / 150) * 65);
                progress.updateProgress(p);

                // Scroll gradual
                const before = scrollable.scrollTop;
                scrollable.scrollTop = before + scrollable.clientHeight * 0.9;
                await sleep(CONFIG.delays.scrollPause);

                const after = scrollable.scrollTop;
                if (visitedKeys.size === prevVisited && after === before) {
                    stall++;
                } else {
                    stall = 0;
                }
                prevVisited = visitedKeys.size;
            }

            // =========
            // Arquivadas (opcional)
            // =========
            progress.updateStatus('Buscando conversas arquivadas...');
            progress.updateProgress(72);
            const openedArchived = await openArchivedView();
            if (openedArchived) {
                await sleep(600);
                const archivedItems = findChatItems();
                stats.archivedChats = archivedItems.length;
                for (const item of archivedItems) {
                    if (progress.isCancelled()) throw new Error('Backup cancelado pelo usuário');
                    const title = getChatTitleFromItem(item);
                    if (!title) continue;
                    const key = `arch:${title}`;
                    if (visitedKeys.has(key)) continue;
                    visitedKeys.add(key);
                    stats.totalChats++;

                    if (isLockedChatItem(item)) continue;

                    progress.updateStatus(`Arquivadas (${title})`);
                    progress.updateDetail(title);
                    const opened = await openChatByElement(item);
                    if (!opened) continue;
                    await sleep(CONFIG.delays.messageLoad);
                    const chatInfo = extractCurrentChatInfo();
                    const messages = await extractMessagesFromCurrentChat();
                    stats.totalMessages += messages.length;

                    const safe = sanitizeFileName(`ARQ_${title}`);
                    zip.addText(`${CONFIG.files.chatFolder}/${safe}.txt`, generateChatTxt(title, chatInfo, messages));
                    zip.addText(`${CONFIG.files.chatFolder}/${safe}.html`, generateChatHtml(title, chatInfo, messages));
                    await sleep(300);
                }
                await backToMainChats();
            }

            // =========
            // Bloqueados
            // =========
            progress.updateStatus('Buscando contatos bloqueados...');
            progress.updateProgress(85);
            const blocked = await getBlockedContacts(progress);
            stats.blockedContacts = blocked.length;

            // Tenta preencher últimas mensagens dos bloqueados
            blocked.forEach(b => {
                const k = (b.name || '').toLowerCase();
                const last = lastMessagesByName.get(k);
                if (last) b.lastMessages = last;
            });

            const xlsxRows = buildBlockedRows(blocked);
            const xlsxBytes = buildXlsx(xlsxRows, 'Bloqueados');
            zip.addBytes(CONFIG.files.excelName, xlsxBytes);

            // =========
            // Relatório
            // =========
            const report = `═══════════════════════════════════════════════════════════════
RELATÓRIO DE BACKUP DO WHATSAPP
═══════════════════════════════════════════════════════════════

Data do backup: ${formatDate(new Date())}

ESTATÍSTICAS:
─────────────────────────────────────────────────────────────────
• Total de conversas: ${stats.totalChats}
• Conversas arquivadas: ${stats.archivedChats}
• Total de mensagens: ${stats.totalMessages}
• Contatos bloqueados: ${stats.blockedContacts}
• Arquivos de mídia: ${stats.totalMedia}

ESTRUTURA DO BACKUP:
─────────────────────────────────────────────────────────────────
📁 ${CONFIG.files.chatFolder}/
   └── [nome].txt
   └── [nome].html

📁 ${CONFIG.files.mediaFolder}/
   └── [nome]_[n].jpg

📄 ${CONFIG.files.excelName}
   └── Planilha com bloqueados (e últimas mensagens quando encontradas)

═══════════════════════════════════════════════════════════════
WhatsApp Backup Tool
═══════════════════════════════════════════════════════════════
`;
            zip.addText('LEIA-ME.txt', report);

            // =========
            // Download
            // =========
            progress.updateStatus('Gerando ZIP...');
            progress.updateProgress(95);

            const bytes = zip.generate();
            const stamp = new Date().toISOString().slice(0, 10);
            const filename = `${CONFIG.files.zipName}-${stamp}.zip`;

            // ⚠️ Importante:
            // downloads iniciados após processos assíncronos longos podem ser bloqueados pelo navegador.
            // Por isso, além de tentar iniciar automaticamente, mantemos um botão "Baixar ZIP"
            // no modal de conclusão (gesto do usuário).
            const dl = downloadBytes(bytes, filename, 'application/zip');

            progress.updateProgress(100);
            progress.showComplete(stats, dl ? { ...dl, filename } : null);
            toast('success', 'Backup concluído', `Arquivo gerado: ${filename}. Se não baixar automaticamente, clique em "Baixar ZIP".`);

        } catch (e) {
            console.error('[WPP Backup] Erro:', e);
            progress.showError(e?.message || String(e));
            toast('error', 'Falha no backup', e?.message || String(e));
        } finally {
            running = false;
        }
    }

    // =============================
    // Bridge / Mensagens (context menu)
    // =============================

    try {
        chrome.runtime.onMessage.addListener((msg) => {
            if (!msg) return;
            if (msg.type === 'START_FULL_BACKUP') {
                startBackup();
            }
        });
    } catch { /* ignore */ }

    window.WppBackupTool = {
        __v: 1,
        start: startBackup,
        isRunning: () => running
    };

})();
