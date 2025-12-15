// metrics/MetricsTypes.js
export const MetricType = {
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_READ: 'message_read',
  MEDIA_AUDIO: 'media_audio',
  MEDIA_VIDEO: 'media_video',
  MEDIA_IMAGE: 'media_image',
  MEDIA_DOCUMENT: 'media_document',
  MEDIA_STICKER: 'media_sticker',
  CONVERSATION_STARTED: 'conversation_started',
  CONVERSATION_ENDED: 'conversation_ended',
  RESPONSE_TIME: 'response_time',
  TYPING_DETECTED: 'typing_detected',
  ONLINE_STATUS: 'online_status'
};

export const MediaType = {
  AUDIO: 'audio',
  VIDEO: 'video',
  IMAGE: 'image',
  DOCUMENT: 'document',
  STICKER: 'sticker',
  PTT: 'ptt', // Push to talk (áudio gravado)
  CONTACT: 'contact',
  LOCATION: 'location'
};

export const MessageDirection = {
  INCOMING: 'incoming',
  OUTGOING: 'outgoing'
};

export const SELECTORS = {
  // Containers principais
  CHAT_LIST: '#pane-side',
  MESSAGE_LIST: 'div[data-tab="8"]',
  CONVERSATION_PANEL: '#main',

  // Mensagens
  MESSAGE_IN: '.message-in',
  MESSAGE_OUT: '.message-out',
  MESSAGE_ROW: 'div[data-id]',
  MESSAGE_TEXT: 'span.selectable-text',
  MESSAGE_TIME: 'span[data-testid="msg-time"]',
  MESSAGE_STATUS: 'span[data-testid="msg-check"], span[data-testid="msg-dblcheck"]',

  // Media
  MEDIA_AUDIO: '[data-testid="audio-play"]',
  MEDIA_VIDEO: '[data-testid="media-url-provider"] video',
  MEDIA_IMAGE: '[data-testid="media-url-provider"] img',
  MEDIA_DOCUMENT: '[data-testid="document-thumb"]',
  MEDIA_STICKER: '[data-testid="sticker"]',
  MEDIA_PTT: '[data-testid="ptt-duration"]',

  // Status
  MESSAGE_DELETED: '[data-testid="recalled"]',
  MESSAGE_EDITED: '[data-testid="edited"]',
  TYPING_INDICATOR: '[data-testid="typing"]',
  ONLINE_INDICATOR: 'span[title="online"]',

  // Info do chat
  CHAT_HEADER: 'header[data-testid="conversation-header"]',
  CHAT_NAME: 'span[data-testid="conversation-info-header-chat-title"]',
  CHAT_AVATAR: 'img[data-testid="user-avatar"]',

  // Unread
  UNREAD_BADGE: 'span[data-testid="icon-unread-count"]'
};

export const SYNC_CONFIG = {
  BATCH_SIZE: 50,
  SYNC_INTERVAL_MS: 30000, // 30 segundos
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5000,
  MAX_CACHE_AGE_HOURS: 72
};

export const CACHE_CONFIG = {
  DB_NAME: 'WhatsAppMetricsDB',
  DB_VERSION: 1,
  STORES: {
    METRICS: 'metrics',
    CONVERSATIONS: 'conversations',
    PENDING_SYNC: 'pending_sync',
    RESPONSE_TIMES: 'response_times'
  }
};
