/*
 * WhatsHybrid / Quantum - Message metrics collector
 *
 * Goal:
 * - Capture message counts (sent/received) in a lightweight and robust way.
 * - Ensure metrics are only recorded for messages "captured" after the new-version install.
 * - Persist stats in chrome.storage.local using the keys expected by the new chart system:
 *     - quantum_install_timestamp
 *     - quantum_install_version
 *     - quantum_msg_stats
 *     - quantum_msg_events (optional, compact)
 *
 * Notes:
 * - This collector runs as a content script on WhatsApp Web.
 * - We intentionally avoid mock data; if no messages are captured, charts should show empty/zero states.
 */

(() => {
  'use strict';

  // --- Storage keys (snake_case is the canonical format for charts + background) ---
  const KEY_INSTALL_TS = 'quantum_install_timestamp';
  const KEY_INSTALL_VER = 'quantum_install_version';
  const KEY_STATS = 'quantum_msg_stats';
  const KEY_EVENTS = 'quantum_msg_events';

  // Legacy keys from older builds (kept here for cleanup only)
  const LEGACY_KEYS = [
    'messageHistory',
    'messageStats',
    'messageEvents',
    'metricsData',
    'metricsBuckets'
  ];

  // --- Collector behavior ---
  const OBSERVER_DEBOUNCE_MS = 150;
  const WRITE_DEBOUNCE_MS = 500;
  const MAX_EVENT_AGE_MS = 12 * 60 * 60 * 1000; // do not count older DOM-loaded messages (scroll/chat switch)

  // Keep a small rolling window of raw events (useful for future insights/debug; charts can use stats.hourly)
  const MAX_EVENTS = 1500;

  // Internal state
  let installAt = 0;
  let currentVersion = '0.0.0';

  /** @type {{installAt:number, updatedAt:number, daily:Object<string,{sent:number,received:number}>, hourly:Object<string,{sent:number[],received:number[]}>, totals:{sent:number,received:number}}} */
  let stats = null;

  /** @type {Array<{timestamp:number, fromMe:boolean}>} */
  let events = [];

  let writeTimer = null;
  let obsTimer = null;
  let observer = null;
  const seenIds = new Set();

  // --- Utilities ---
  function nowTs() {
    return Date.now();
  }

  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function makeEmptyStats(installAtValue) {
    return {
      installAt: Number(installAtValue) || 0,
      updatedAt: nowTs(),
      daily: {},
      hourly: {},
      totals: { sent: 0, received: 0 }
    };
  }

  function isValidStats(obj) {
    return obj && typeof obj === 'object' && typeof obj.daily === 'object' && typeof obj.hourly === 'object';
  }

  function ensureHourlyEntry(dateKey) {
    if (!stats.hourly[dateKey] || typeof stats.hourly[dateKey] !== 'object') {
      stats.hourly[dateKey] = { sent: Array(24).fill(0), received: Array(24).fill(0) };
      return;
    }
    const entry = stats.hourly[dateKey];
    if (!Array.isArray(entry.sent) || entry.sent.length < 24) entry.sent = Array(24).fill(0);
    if (!Array.isArray(entry.received) || entry.received.length < 24) entry.received = Array(24).fill(0);
  }

  function ensureDailyEntry(dateKey) {
    if (!stats.daily[dateKey] || typeof stats.daily[dateKey] !== 'object') {
      stats.daily[dateKey] = { sent: 0, received: 0 };
      return;
    }
    const entry = stats.daily[dateKey];
    if (typeof entry.sent !== 'number') entry.sent = Number(entry.sent) || 0;
    if (typeof entry.received !== 'number') entry.received = Number(entry.received) || 0;
  }

  function safeGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (res) => {
          const err = chrome.runtime.lastError;
          if (err) {
            console.warn('[metrics] storage.get error:', err.message);
            resolve({});
            return;
          }
          resolve(res || {});
        });
      } catch (e) {
        console.warn('[metrics] storage.get exception:', e);
        resolve({});
      }
    });
  }

  function safeSet(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => {
          const err = chrome.runtime.lastError;
          if (err) console.warn('[metrics] storage.set error:', err.message);
          resolve();
        });
      } catch (e) {
        console.warn('[metrics] storage.set exception:', e);
        resolve();
      }
    });
  }

  function safeRemove(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(keys, () => {
          const err = chrome.runtime.lastError;
          if (err) console.warn('[metrics] storage.remove error:', err.message);
          resolve();
        });
      } catch (e) {
        console.warn('[metrics] storage.remove exception:', e);
        resolve();
      }
    });
  }

  // Parse WhatsApp's data-pre-plain-text format, typically:
  //   "[12:34, 10/12/2025] Name: "
  // Returns timestamp (ms) or 0 if not parseable.
  function parsePrePlainTimestamp(prePlain) {
    if (typeof prePlain !== 'string' || !prePlain.startsWith('[')) return 0;
    const m = prePlain.match(/^\[(\d{1,2}):(\d{2}),\s(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]/);
    if (!m) return 0;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const mon = Number(m[4]);
    let yyyy = Number(m[5]);
    if (yyyy < 100) yyyy += 2000;
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(mon) || !Number.isFinite(yyyy)) return 0;

    const d = new Date(yyyy, mon - 1, dd, hh, mm, 0, 0);
    const ts = d.getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  // Best-effort stable ID for a message bubble.
  function computeMsgId(msgEl) {
    try {
      const explicit = msgEl.getAttribute('data-id') || msgEl.dataset?.id;
      if (explicit) return `id:${explicit}`;

      const pre = msgEl.getAttribute('data-pre-plain-text') || '';
      // Keep it short for memory; include a snippet of visible text for disambiguation when multiple msgs share the same minute.
      const txt = (msgEl.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 64);
      return `p:${pre}|t:${txt}`;
    } catch (e) {
      return `fallback:${Math.random().toString(16).slice(2)}`;
    }
  }

  // Determine if this bubble is outgoing or incoming.
  function isOutgoing(msgEl) {
    // WhatsApp uses message-out/message-in on container nodes in most builds.
    const out = msgEl.closest('.message-out') || msgEl.classList.contains('message-out');
    const inn = msgEl.closest('.message-in') || msgEl.classList.contains('message-in');
    if (out && !inn) return true;
    if (inn && !out) return false;

    // Fallback: try to infer from aria-label patterns (can vary by language; keep conservative)
    const aria = msgEl.getAttribute('aria-label') || '';
    if (/\bYou\b\s*:/i.test(aria)) return true;
    if (/\bVocê\b\s*:/i.test(aria)) return true;
    return false;
  }

  function recordMessage(ts, fromMe) {
    if (!stats) return;

    const now = nowTs();
    if (!ts || !Number.isFinite(ts)) ts = now;

    // Install boundary
    if (installAt && ts < installAt) return;

    // Guard against older DOM-loaded messages (scroll/chat switch)
    if (now - ts > MAX_EVENT_AGE_MS) return;

    const dateKey = formatDateKey(new Date(ts));
    const hour = new Date(ts).getHours();
    if (hour < 0 || hour > 23) return;

    ensureDailyEntry(dateKey);
    ensureHourlyEntry(dateKey);

    if (fromMe) {
      stats.daily[dateKey].sent += 1;
      stats.hourly[dateKey].sent[hour] += 1;
      stats.totals.sent += 1;
    } else {
      stats.daily[dateKey].received += 1;
      stats.hourly[dateKey].received[hour] += 1;
      stats.totals.received += 1;
    }

    stats.updatedAt = now;

    events.push({ timestamp: ts, fromMe: !!fromMe });
    if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);

    scheduleWrite();
  }

  function scheduleWrite() {
    if (writeTimer) return;
    writeTimer = setTimeout(flushWrite, WRITE_DEBOUNCE_MS);
  }

  async function flushWrite() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = null;
    if (!stats) return;

    await safeSet({
      [KEY_STATS]: stats,
      [KEY_EVENTS]: events
    });
  }

  // --- DOM observation ---
  function collectFromNode(node) {
    if (!node || node.nodeType !== 1) return;

    /** @type {Element} */
    const el = /** @type {any} */ (node);

    const candidates = [];

    // WhatsApp bubbles typically contain data-pre-plain-text on the bubble root.
    if (el.hasAttribute && el.hasAttribute('data-pre-plain-text')) {
      candidates.push(el);
    }

    if (el.querySelectorAll) {
      el.querySelectorAll('[data-pre-plain-text]').forEach((n) => candidates.push(n));
    }

    for (const msgEl of candidates) {
      const id = computeMsgId(msgEl);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const pre = msgEl.getAttribute('data-pre-plain-text') || '';
      const ts = parsePrePlainTimestamp(pre) || nowTs();
      const fromMe = isOutgoing(msgEl);

      recordMessage(ts, fromMe);
    }
  }

  function scanBaseline() {
    try {
      document.querySelectorAll('[data-pre-plain-text]').forEach((msgEl) => {
        const id = computeMsgId(msgEl);
        if (!seenIds.has(id)) seenIds.add(id);
      });
    } catch (e) {
      // ignore
    }
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      if (obsTimer) clearTimeout(obsTimer);
      obsTimer = setTimeout(() => {
        obsTimer = null;
        try {
          for (const m of mutations) {
            if (!m.addedNodes || !m.addedNodes.length) continue;
            m.addedNodes.forEach((n) => collectFromNode(n));
          }
        } catch (e) {
          // ignore
        }
      }, OBSERVER_DEBOUNCE_MS);
    });

    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[metrics] MutationObserver failed:', e);
    }
  }

  // --- Boot ---
  async function init() {
    try {
      currentVersion = chrome.runtime.getManifest().version || '0.0.0';
    } catch (e) {
      currentVersion = '0.0.0';
    }

    const res = await safeGet([KEY_INSTALL_TS, KEY_INSTALL_VER, KEY_STATS, KEY_EVENTS, ...LEGACY_KEYS]);

    const storedInstallAt = Number(res[KEY_INSTALL_TS]) || 0;
    const storedInstallVer = res[KEY_INSTALL_VER];

    // If background didn't set the boundary yet, set it now.
    if (!storedInstallAt) {
      installAt = nowTs();
      await safeSet({ [KEY_INSTALL_TS]: installAt, [KEY_INSTALL_VER]: currentVersion });
    } else {
      installAt = storedInstallAt;
      // Keep version updated for debugging/ops.
      if (storedInstallVer !== currentVersion) {
        await safeSet({ [KEY_INSTALL_VER]: currentVersion });
      }
    }

    // Initialize stats/events
    const storedStats = res[KEY_STATS];
    stats = isValidStats(storedStats) ? storedStats : makeEmptyStats(installAt);
    if (!stats.installAt) stats.installAt = installAt;

    const storedEvents = res[KEY_EVENTS];
    events = Array.isArray(storedEvents) ? storedEvents.filter((e) => e && typeof e.timestamp === 'number') : [];

    // If legacy keys exist, remove them to prevent confusion and wasted space.
    const legacyFound = LEGACY_KEYS.some((k) => typeof res[k] !== 'undefined');
    if (legacyFound) {
      await safeRemove(LEGACY_KEYS);
    }

    scanBaseline();
    startObserver();

    console.log('[metrics] initialized', {
      installAt,
      version: currentVersion,
      totals: stats?.totals
    });
  }

  // Only run on WhatsApp domains (belt-and-suspenders)
  if (!/whatsapp\.com$/i.test(location.hostname)) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  } else {
    init();
  }
})();
