// WhatsApp Web.js Manager - Enhanced Inject Script
// This script runs in the WhatsApp Web page context and incorporates whatsapp-web.js utilities

(function() {
    'use strict';

    // Import whatsapp-web.js utilities (adapted for Chrome extension)
    const { Store, Utils, Constants } = (() => {
        // Constants from whatsapp-web.js
        const Events = {
            AUTHENTICATED: 'authenticated',
            AUTHENTICATION_FAILURE: 'auth_failure',
            READY: 'ready',
            MESSAGE_RECEIVED: 'message',
            MESSAGE_CREATE: 'message_create',
            MESSAGE_ACK: 'message_ack',
            CONTACT_CHANGED: 'contact_changed',
            GROUP_JOIN: 'group_join',
            GROUP_LEAVE: 'group_leave',
            GROUP_UPDATE: 'group_update',
            QR_RECEIVED: 'qr',
            DISCONNECTED: 'disconnected',
            STATE_CHANGED: 'change_state'
        };

        const MessageTypes = {
            TEXT: 'chat',
            AUDIO: 'audio',
            VOICE: 'ptt',
            IMAGE: 'image',
            VIDEO: 'video',
            DOCUMENT: 'document',
            STICKER: 'sticker',
            LOCATION: 'location',
            CONTACT_CARD: 'vcard',
            CONTACT_CARD_MULTI: 'multi_vcard',
            ORDER: 'order',
            REVOKED: 'revoked',
            PRODUCT: 'product',
            UNKNOWN: 'unknown',
            GROUP_INVITE: 'groups_v4_invite',
            LIST: 'list',
            LIST_RESPONSE: 'list_response',
            BUTTONS_RESPONSE: 'buttons_response',
            PAYMENT: 'payment',
            BROADCAST_NOTIFICATION: 'broadcast_notification',
            CALL_LOG: 'call_log',
            CIPHERTEXT: 'ciphertext',
            DEBUG: 'debug',
            E2E_NOTIFICATION: 'e2e_notification',
            GP2: 'gp2',
            GROUP_NOTIFICATION: 'group_notification',
            HSM: 'hsm',
            INTERACTIVE: 'interactive',
            NATIVE_FLOW: 'native_flow',
            NOTIFICATION: 'notification',
            NOTIFICATION_TEMPLATE: 'notification_template',
            OVERSIZED: 'oversized',
            PROTOCOL: 'protocol',
            REACTION: 'reaction',
            TEMPLATE_BUTTON_REPLY: 'template_button_reply',
            POLL_CREATION: 'poll_creation'
        };

        const WAState = {
            CONFLICT: 'CONFLICT',
            CONNECTED: 'CONNECTED',
            DEPRECATED_VERSION: 'DEPRECATED_VERSION',
            OPENING: 'OPENING',
            PAIRING: 'PAIRING',
            PROXYBLOCK: 'PROXYBLOCK',
            SMB_TOS_BLOCK: 'SMB_TOS_BLOCK',
            TIMEOUT: 'TIMEOUT',
            TOS_BLOCK: 'TOS_BLOCK',
            UNLAUNCHED: 'UNLAUNCHED',
            UNPAIRED: 'UNPAIRED',
            UNPAIRED_IDLE: 'UNPAIRED_IDLE'
        };

        const MessageAck = {
            ACK_ERROR: -1,
            ACK_PENDING: 0,
            ACK_SERVER: 1,
            ACK_DEVICE: 2,
            ACK_READ: 3,
            ACK_PLAYED: 4
        };

        return { Events, MessageTypes, WAState, MessageAck };
    })();

    // Enhanced WhatsApp Web integration
    class WhatsAppWebIntegration {
        constructor() {
            this.isInitialized = false;
            this.isConnected = false;
            this.currentState = 'UNLAUNCHED';
            this.Store = null;
            this.Utils = null;
            this.messageListeners = [];
            this.stateListeners = [];
            this.init();
        }

        init() {
            this.waitForWhatsAppWeb();
        }

        waitForWhatsAppWeb() {
            const checkInterval = setInterval(() => {
                if (window.Store || window.require) {
                    clearInterval(checkInterval);
                    this.initializeIntegration();
                }
            }, 1000);

            // Timeout after 30 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!this.isInitialized) {
                    console.warn('WhatsApp Web not detected after 30 seconds');
                    this.sendToExtension('integration_failed', { error: 'WhatsApp Web not detected' });
                }
            }, 30000);
        }

        initializeIntegration() {
            try {
                this.initStore();
                this.initUtils();
                this.setupEventListeners();
                this.isInitialized = true;
                
                this.sendToExtension('integration_ready', {
                    timestamp: Date.now(),
                    userAgent: navigator.userAgent,
                    version: this.getWhatsAppVersion()
                });

                console.log('WhatsApp Web.js Manager integration initialized');
            } catch (error) {
                console.error('Failed to initialize WhatsApp Web integration:', error);
                this.sendToExtension('integration_failed', { error: error.message });
            }
        }

        initStore() {
            // Simplified store initialization - use existing WhatsApp Web objects
            if (window.Store) {
                this.Store = window.Store;
            } else if (window.require) {
                try {
                    // Use basic WhatsApp Web collections
                    this.Store = window.require('WAWebCollections');
                    
                    // Add essential modules if available
                    try {
                        this.Store.Conn = window.require('WAWebConnModel')?.Conn;
                    } catch (e) {
                        console.log('Conn module not available');
                    }
                    
                    try {
                        this.Store.SendMessage = window.require('WAWebSendMsgChatAction');
                    } catch (e) {
                        console.log('SendMessage module not available');
                    }
                    
                    try {
                        this.Store.SendSeen = window.require('WAWebUpdateUnreadChatAction');
                    } catch (e) {
                        console.log('SendSeen module not available');
                    }
                    
                    try {
                        this.Store.User = window.require('WAWebUserPrefsMeUser');
                    } catch (e) {
                        console.log('User module not available');
                    }
                    
                    try {
                        this.Store.WidFactory = window.require('WAWebWidFactory');
                    } catch (e) {
                        console.log('WidFactory module not available');
                    }
                    
                    try {
                        this.Store.Validators = window.require('WALinkify');
                    } catch (e) {
                        console.log('Validators module not available');
                    }
                    
                    try {
                        this.Store.ProfilePic = window.require('WAWebContactProfilePicThumbBridge');
                    } catch (e) {
                        console.log('ProfilePic module not available');
                    }
                    
                    try {
                        this.Store.ChatGetters = window.require('WAWebChatGetters');
                    } catch (e) {
                        console.log('ChatGetters module not available');
                    }
                    
                    try {
                        this.Store.QueryExist = window.require('WAWebQueryExistsJob')?.queryWidExists;
                    } catch (e) {
                        console.log('QueryExist module not available');
                    }
                    
                    try {
                        this.Store.ReplyUtils = window.require('WAWebMsgReply');
                    } catch (e) {
                        console.log('ReplyUtils module not available');
                    }
                    
                    try {
                        this.Store.LinkPreview = window.require('WAWebLinkPreviewChatAction');
                    } catch (e) {
                        console.log('LinkPreview module not available');
                    }
                    
                    try {
                        this.Store.VCard = {
                            ...window.require('WAWebFrontendVcardUtils'),
                            ...window.require('WAWebVcardParsingUtils'),
                            ...window.require('WAWebVcardGetNameFromParsed')
                        };
                    } catch (e) {
                        console.log('VCard modules not available');
                    }
                    
                    try {
                        this.Store.GroupUtils = {
                            ...window.require('WAWebGroupCreateJob'),
                            ...window.require('WAWebGroupModifyInfoJob'),
                            ...window.require('WAWebExitGroupAction')
                        };
                    } catch (e) {
                        console.log('GroupUtils modules not available');
                    }
                    
                    try {
                        this.Store.GroupParticipants = {
                            ...window.require('WAWebModifyParticipantsGroupAction'),
                            ...window.require('WASmaxGroupsAddParticipantsRPC')
                        };
                    } catch (e) {
                        console.log('GroupParticipants modules not available');
                    }
                    
                    try {
                        this.Store.AddressbookContactUtils = {
                            ...window.require('WAWebSaveContactAction'),
                            ...window.require('WAWebDeleteContactAction')
                        };
                    } catch (e) {
                        console.log('AddressbookContactUtils modules not available');
                    }
                    
                } catch (e) {
                    console.warn('Could not initialize WhatsApp Store:', e);
                    // Fallback to basic store
                    this.Store = window.require('WAWebCollections');
                }
            }
        }

        initUtils() {
            // Initialize WhatsApp Web utilities
            this.Utils = {
                // Message utilities
                sendMessage: async (chat, content, options = {}) => {
                    try {
                        if (!this.Store || !this.Store.SendMessage) {
                            throw new Error('SendMessage not available');
                        }
                        
                        // IMPORTANTE:
                        // `this.getChat(...)` neste arquivo é um *handler de comando* (que envia dados
                        // para a extensão) e não retorna o model do chat. Para obter o model correto,
                        // precisamos usar o util `this.Utils.getChat(...)`.
                        const chatModel = await this.Utils.getChat(chat);
                        if (!chatModel) {
                            throw new Error('Chat not found');
                        }

                        // Handle different message types
                        if (options.media) {
                            return await this.sendMediaMessage(chatModel, content, options);
                        } else if (options.location) {
                            return await this.sendLocationMessage(chatModel, options.location);
                        } else if (options.contactCard) {
                            return await this.sendContactMessage(chatModel, options.contactCard);
                        } else {
                            // Try multiple APIs in order of preference for WhatsApp Web API compatibility
                            if (this.Store.SendMessage?.sendTextMsgToChat) {
                                return await this.Store.SendMessage.sendTextMsgToChat(chatModel, content, options);
                            }
                            if (this.Store.SendMessage?.sendMsgToChat) {
                                return await this.Store.SendMessage.sendMsgToChat(chatModel, content, options);
                            }
                            if (chatModel.sendMessage) {
                                return await chatModel.sendMessage(content, options);
                            }
                            if (window.WWebJS?.sendMessage) {
                                return await window.WWebJS.sendMessage(chatModel.id._serialized, content, options);
                            }
                            throw new Error('Nenhuma API de envio disponível');
                        }
                    } catch (error) {
                        console.error('Error sending message:', error);
                        throw error;
                    }
                },

                // Chat utilities
                getChat: async (chatId) => {
                    try {
                        if (!this.Store || !this.Store.Chat) {
                            throw new Error('Chat store not available');
                        }

                        // WhatsApp Web internals variam entre versões.
                        // Tentamos os métodos conhecidos em ordem de preferência.
                        const chatStore = this.Store.Chat;
                        const direct = (typeof chatStore.get === 'function') ? chatStore.get(chatId) : null;
                        if (direct) return direct;

                        if (typeof chatStore.findImpl === 'function') {
                            return await chatStore.findImpl(chatId);
                        }
                        if (typeof chatStore.find === 'function') {
                            return await chatStore.find(chatId);
                        }
                        if (typeof chatStore.findById === 'function') {
                            return await chatStore.findById(chatId);
                        }

                        return null;
                    } catch (error) {
                        console.error('Error getting chat:', error);
                        return null;
                    }
                },

                // Contact utilities
                getContact: (contactId) => {
                    try {
                        if (!this.Store || !this.Store.Contact) {
                            throw new Error('Contact store not available');
                        }
                        return this.Store.Contact.get(contactId);
                    } catch (error) {
                        console.error('Error getting contact:', error);
                        return null;
                    }
                },

                // Message utilities
                getMessage: (messageId) => {
                    try {
                        if (!this.Store || !this.Store.Msg) {
                            throw new Error('Message store not available');
                        }
                        return this.Store.Msg.get(messageId);
                    } catch (error) {
                        console.error('Error getting message:', error);
                        return null;
                    }
                }
            };
        }

        setupEventListeners() {
            // Monitor connection state
            if (this.Store && this.Store.Conn) {
                this.Store.Conn.on('change:state', (state) => {
                    this.currentState = state;
                    this.isConnected = state === 'CONNECTED';
                    this.sendToExtension('state_changed', { state, isConnected: this.isConnected });
                });
            }

            // Monitor messages
            if (this.Store && this.Store.Msg) {
                this.Store.Msg.on('add', (message) => {
                    this.handleNewMessage(message);
                });
            }

            // Monitor contacts
            if (this.Store && this.Store.Contact) {
                this.Store.Contact.on('add', (contact) => {
                    this.sendToExtension('contact_added', { contact: this.serializeContact(contact) });
                });
            }

            // Monitor chats
            if (this.Store && this.Store.Chat) {
                this.Store.Chat.on('add', (chat) => {
                    this.sendToExtension('chat_added', { chat: this.serializeChat(chat) });
                });
            }
        }

        handleNewMessage(message) {
            try {
                const messageData = this.serializeMessage(message);
                this.sendToExtension('message_received', messageData);
            } catch (error) {
                console.error('Error handling new message:', error);
            }
        }

        // Serialization methods for sending data to extension
        serializeMessage(message) {
            try {
                return {
                    id: message.id?._serialized || message.id,
                    from: message.from,
                    to: message.to,
                    body: message.body,
                    type: message.type,
                    timestamp: message.timestamp,
                    hasMedia: message.hasMedia,
                    isFromMe: message.isFromMe,
                    isGroup: message.isGroup,
                    chat: message.chat?.id?._serialized,
                    author: message.author,
                    notifyName: message.notifyName,
                    quotedMsg: message.quotedMsg ? this.serializeMessage(message.quotedMsg) : null
                };
            } catch (error) {
                console.error('Error serializing message:', error);
                return null;
            }
        }

        serializeContact(contact) {
            try {
                return {
                    id: contact.id?._serialized || contact.id,
                    name: contact.name,
                    pushname: contact.pushname,
                    number: contact.number,
                    isMyContact: contact.isMyContact,
                    isGroup: contact.isGroup,
                    isWAContact: contact.isWAContact,
                    profilePicUrl: contact.profilePicUrl
                };
            } catch (error) {
                console.error('Error serializing contact:', error);
                return null;
            }
        }

        serializeChat(chat) {
            try {
                return {
                    id: chat.id?._serialized || chat.id,
                    name: chat.name,
                    isGroup: chat.isGroup,
                    isReadOnly: chat.isReadOnly,
                    unreadCount: chat.unreadCount,
                    timestamp: chat.timestamp,
                    lastMessage: chat.lastMessage ? this.serializeMessage(chat.lastMessage) : null
                };
            } catch (error) {
                console.error('Error serializing chat:', error);
                return null;
            }
        }

        // Command handlers
        handleExtensionMessage(message) {
            const payload = (message && message.payload) || {};
            const { type, data, requestId } = payload;

            switch (type) {
                case 'get_contacts':
                    this.getContacts(requestId);
                    break;
                case 'get_chats':
                    this.getChats(requestId);
                    break;
                case 'get_messages':
                    this.getMessages(data, requestId);
                    break;
                case 'send_message':
                    this.sendMessage(data, requestId);
                    break;
                case 'send_message_to_user':
                    this.sendMessageToUser(data, requestId);
                    break;
                case 'get_chat':
                    this.getChat(data?.chatId, requestId);
                    break;
                case 'get_contact':
                    this.getContact(data?.contactId, requestId);
                    break;
                case 'mark_as_read':
                    this.markAsRead(data?.chatId, requestId);
                    break;
                case 'get_connection_state':
                    this.getConnectionState(requestId);
                    break;
                default:
                    console.log('Unknown command:', type);
            }
        }


        // Implementation of command handlers
        async getContacts(requestId) {
            try {
                if (!this.Store || !this.Store.Contact) {
                    throw new Error('Contact store not available');
                }
                
                const contacts = this.Store.Contact.getModelsArray();
                const serializedContacts = contacts.map(contact => this.serializeContact(contact)).filter(Boolean);
                
                this.sendToExtension('contacts_data', { contacts: serializedContacts }, requestId);
            } catch (error) {
                console.error('Error getting contacts:', error);
                this.sendToExtension('contacts_data', { error: error.message }, requestId);
            }
        }

        async sendMessageToUser(data, requestId) {
            try {
                // Validate data parameter
                if (!data || typeof data !== 'object') {
                    throw new Error('Invalid data parameter provided');
                }

                const { chatId, message, options = {} } = data;
                
                if (!chatId) {
                    throw new Error('Chat ID is required');
                }

                if (!message || typeof message !== 'string') {
                    throw new Error('Message content is required');
                }

                const chat = await this.Utils.getChat(chatId);
                
                if (!chat) {
                    throw new Error('Chat not found');
                }

                // Send message using WhatsApp Web API
                const result = await this.Utils.sendMessage(chatId, message, options);
                
                this.sendToExtension('message_sent', { 
                    success: true,
                    messageId: result?.id?._serialized || result?.id,
                    chatId,
                    message,
                    timestamp: Date.now()
                }, requestId);
            } catch (error) {
                console.error('Error sending message:', error);
                this.sendToExtension('message_sent', { 
                    success: false,
                    error: error.message,
                    chatId: data?.chatId || 'unknown',
                    message: data?.message || ''
                }, requestId);
            }
        }

        async getChats(requestId) {
            try {
                if (!this.Store || !this.Store.Chat) {
                    throw new Error('Chat store not available');
                }
                
                const chats = this.Store.Chat.getModelsArray();
                const serializedChats = chats.map(chat => this.serializeChat(chat)).filter(Boolean);
                
                this.sendToExtension('chats_data', { chats: serializedChats }, requestId);
            } catch (error) {
                console.error('Error getting chats:', error);
                this.sendToExtension('chats_data', { error: error.message }, requestId);
            }
        }

        async getMessages(data, requestId) {
            try {
                // Validate data parameter
                if (!data || typeof data !== 'object') {
                    throw new Error('Invalid data parameter provided');
                }

                const { chatId, limit = 50 } = data;
                
                if (!chatId) {
                    throw new Error('Chat ID is required');
                }

                const chat = await this.Utils.getChat(chatId);
                
                if (!chat) {
                    throw new Error('Chat not found');
                }

                // Get messages from chat
                const messages = await chat.fetchMessages({ limit });
                const serializedMessages = messages.map(msg => this.serializeMessage(msg)).filter(Boolean);
                
                this.sendToExtension('messages_data', { 
                    chatId, 
                    messages: serializedMessages 
                }, requestId);
            } catch (error) {
                console.error('Error getting messages:', error);
                this.sendToExtension('messages_data', { 
                    error: error.message,
                    chatId: data?.chatId || 'unknown'
                }, requestId);
            }
        }

        async sendMessage(data, requestId) {
            try {
                const { chatId, content, options = {} } = data;
                const result = await this.Utils.sendMessage(chatId, content, options);
                
                this.sendToExtension('message_sent', { 
                    success: true, 
                    messageId: result?.id?._serialized || result?.id,
                    data 
                }, requestId);
            } catch (error) {
                console.error('Error sending message:', error);
                this.sendToExtension('message_sent', { 
                    success: false, 
                    error: error.message,
                    data 
                }, requestId);
            }
        }

        async getChat(chatId, requestId) {
            try {
                const chat = await this.Utils.getChat(chatId);
                if (chat) {
                    this.sendToExtension('chat_data', { chat: this.serializeChat(chat) }, requestId);
                } else {
                    this.sendToExtension('chat_data', { error: 'Chat not found' }, requestId);
                }
            } catch (error) {
                console.error('Error getting chat:', error);
                this.sendToExtension('chat_data', { error: error.message }, requestId);
            }
        }

        async getContact(contactId, requestId) {
            try {
                const contact = this.Utils.getContact(contactId);
                if (contact) {
                    this.sendToExtension('contact_data', { contact: this.serializeContact(contact) }, requestId);
                } else {
                    this.sendToExtension('contact_data', { error: 'Contact not found' }, requestId);
                }
            } catch (error) {
                console.error('Error getting contact:', error);
                this.sendToExtension('contact_data', { error: error.message }, requestId);
            }
        }

        async markAsRead(chatId, requestId) {
            try {
                const chat = await this.Utils.getChat(chatId);
                if (chat && this.Store.SendSeen) {
                    await this.Store.SendSeen.sendSeen(chat);
                    this.sendToExtension('mark_as_read_result', { success: true, chatId }, requestId);
                } else {
                    this.sendToExtension('mark_as_read_result', { success: false, error: 'Chat not found or SendSeen not available' }, requestId);
                }
            } catch (error) {
                console.error('Error marking as read:', error);
                this.sendToExtension('mark_as_read_result', { success: false, error: error.message }, requestId);
            }
        }

        getConnectionState(requestId) {
            this.sendToExtension('connection_state', {
                isConnected: this.isConnected,
                state: this.currentState,
                isInitialized: this.isInitialized
            }, requestId);
        }

        getWhatsAppVersion() {
            try {
                return window.Debug?.VERSION || 'unknown';
            } catch (error) {
                return 'unknown';
            }
        }

        sendToExtension(type, data, requestId) {
            let outData = data;
            // Backward compatibility: also include requestId inside data when possible
            try {
                if (requestId && outData && typeof outData === 'object' && !Array.isArray(outData)) {
                    if (!('requestId' in outData)) {
                        outData = { ...outData, requestId };
                    }
                }
            } catch (_) {}

            window.postMessage({
                type: 'FROM_INJECT_SCRIPT',
                payload: { type, data: outData, requestId }
            }, '*');
        }

    }

    // Listen for messages from content script
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;
        
        if (event.data.type && event.data.type === 'FROM_EXTENSION') {
            if (window.whatsappIntegration) {
                window.whatsappIntegration.handleExtensionMessage(event.data);
            }
        }
    });

    // Initialize integration
    window.whatsappIntegration = new WhatsAppWebIntegration();
})();
/**
 * =============================
 * Integração com FlowsRuntime
 * =============================
 */

/**
 * Emite evento customizado para o runtime
 */
function emitRuntimeEvent(type, payload) {
  // Via postMessage
  window.postMessage({
    source: 'QUANTUM_INJECT',
    type: type,
    payload: payload,
  }, '*');
  
  // Via CustomEvent (backup)
  const event = new CustomEvent(`quantum:${type.toLowerCase().replace('_', ':')}`, {
    detail: payload,
  });
  document.dispatchEvent(event);
}

/**
 * Extrai dados relevantes de uma mensagem do Store
 */
function extractMessageData(message) {
  try {
    return {
      messageId: message.id?._serialized || message.id?.toString(),
      chatId: message.chat?.id?._serialized || message.from || message.to,
      body: message.body || '',
      type: message.type || 'chat',
      fromMe: !!message.fromMe,
      timestamp: message.t || message.timestamp || Date.now(),
      pushname: message.notifyName || message.senderObj?.pushname || '',
      contactName: message.chat?.name || message.notifyName || '',
      isGroup: message.chat?.isGroup || message.isGroupMsg || false,
      hasMedia: message.hasMedia || message.isMedia || false,
      mediaType: message.type !== 'chat' ? message.type : null,
      quotedMsg: message.quotedMsg ? {
        id: message.quotedMsg.id?._serialized,
        body: message.quotedMsg.body,
      } : null,
      mentionedIds: message.mentionedJidList || [],
    };
  } catch (e) {
    console.error('[Inject] erro em extractMessageData:', e);
    return null;
  }
}

/**
 * Configura listeners para eventos do WhatsApp Web Store
 */
function setupStoreEventListeners() {
  if (!window.Store) {
    console.warn('[Inject] Store não disponível para listeners');
    return;
  }
  
  // Listener de novas mensagens
  if (window.Store.Msg && window.Store.Msg.on) {
    window.Store.Msg.on('add', (message) => {
      try {
        const msgData = extractMessageData(message);
        if (!msgData) return;
        
        if (message.isNewMsg) {
          emitRuntimeEvent(
            msgData.fromMe ? 'MESSAGE_SENT' : 'MESSAGE_RECEIVED',
            msgData
          );
        }
      } catch (e) {
        console.error('[Inject] Erro ao processar mensagem:', e);
      }
    });
    
    // Listener de mensagens deletadas
    window.Store.Msg.on('remove', (message) => {
      try {
        emitRuntimeEvent('MESSAGE_DELETED', {
          messageId: message.id?._serialized || message.id,
          chatId: message.chat?.id?._serialized || message.from,
        });
      } catch (e) {
        console.error('[Inject] Erro ao processar remoção:', e);
      }
    });
  }
  
  // Listener de mudança de chat
  if (window.Store.Chat) {
    let lastChatId = null;
    
    const checkActiveChat = () => {
      const activeChat = window.Store.Chat.getActive?.() || window.Store.Chat.active;
      const currentChatId = activeChat?.id?._serialized;
      
      if (currentChatId && currentChatId !== lastChatId) {
        emitRuntimeEvent('CHAT_CHANGED', {
          chatId: currentChatId,
          previousChatId: lastChatId,
          chatName: activeChat?.name || activeChat?.pushname || '',
          isGroup: activeChat?.isGroup || false,
        });
        
        // Atualizar chat ID global
        window.postMessage({
          source: 'QUANTUM_INJECT',
          type: 'CURRENT_CHAT_ID',
          chatId: currentChatId,
        }, '*');
        
        lastChatId = currentChatId;
      }
    };
    
    // Verificar periodicamente
    setInterval(checkActiveChat, 1000);
    
    if (window.Store.Chat.on) {
      window.Store.Chat.on('change:active', checkActiveChat);
    }
  }
  
  // Listener de novos contatos
  if (window.Store.Contact && window.Store.Contact.on) {
    window.Store.Contact.on('add', (contact) => {
      emitRuntimeEvent('CONTACT_ADDED', {
        contactId: contact.id?._serialized,
        name: contact.name || contact.pushname || '',
        phone: contact.id?.user || '',
      });
    });
  }
  
  console.log('[Inject] Listeners de eventos do Store para Flows configurados');
}

/**
 * Handlers de ações vindas do runtime (FlowsRuntime)
 */
async function handleSendMessageFromRuntime(data, respond) {
  try {
    const chat = await window.Store.Chat.find(data.chatId);
    if (!chat) {
      respond({ success: false, error: 'Chat não encontrado' });
      return;
    }
    
    const options = {};
    
    if (data.options && data.options.quotedMessageId) {
      const quotedMsg = await window.Store.Msg.find(data.options.quotedMessageId);
      if (quotedMsg) {
        options.quotedMsg = quotedMsg;
      }
    }
    
    if (data.options && data.options.mentionedIds && data.options.mentionedIds.length) {
      options.mentionedJidList = data.options.mentionedIds;
    }
    
    // Try multiple APIs in order of preference for WhatsApp Web API compatibility
    let result;
    if (window.Store.SendMessage?.sendTextMsgToChat) {
      result = await window.Store.SendMessage.sendTextMsgToChat(chat, data.content, options);
    } else if (window.Store.SendMessage?.sendMsgToChat) {
      result = await window.Store.SendMessage.sendMsgToChat(chat, data.content, options);
    } else if (chat.sendMessage) {
      result = await chat.sendMessage(data.content, options);
    } else if (window.WWebJS?.sendMessage) {
      result = await window.WWebJS.sendMessage(chat.id._serialized, data.content, options);
    } else {
      throw new Error('Nenhuma API de envio disponível');
    }
    
    respond({ 
      success: true, 
      messageId: result?.id?._serialized,
    });
  } catch (e) {
    console.error('[Inject] Erro ao enviar mensagem (runtime):', e);
    respond({ success: false, error: e.message });
  }
}

async function handleSendMediaFromRuntime(data, respond) {
  try {
    const chat = await window.Store.Chat.find(data.chatId);
    if (!chat) {
      respond({ success: false, error: 'Chat não encontrado' });
      return;
    }
    
    const response = await fetch(data.mediaUrl);
    const blob = await response.blob();
    
    const mc = await window.Store.MediaPrep.prepareMedia(blob, {
      caption: data.caption || '',
    });
    
    await window.Store.SendMessage.sendMsgToChat(chat, mc);
    
    respond({ success: true });
  } catch (e) {
    console.error('[Inject] Erro ao enviar mídia (runtime):', e);
    respond({ success: false, error: e.message });
  }
}

async function handleMarkAsReadFromRuntime(chatId, respond) {
  try {
    const chat = await window.Store.Chat.find(chatId);
    if (chat) {
      await window.Store.Cmd.markSeen(chat);
      respond({ success: true });
    } else {
      respond({ success: false, error: 'Chat não encontrado' });
    }
  } catch (e) {
    respond({ success: false, error: e.message });
  }
}

async function handleMarkAsUnreadFromRuntime(chatId, respond) {
  try {
    const chat = await window.Store.Chat.find(chatId);
    if (chat) {
      await window.Store.Cmd.markUnread(chat);
      respond({ success: true });
    } else {
      respond({ success: false, error: 'Chat não encontrado' });
    }
  } catch (e) {
    respond({ success: false, error: e.message });
  }
}

async function handleArchiveChatFromRuntime(chatId, archive, respond) {
  try {
    const chat = await window.Store.Chat.find(chatId);
    if (chat) {
      await window.Store.Cmd.archiveChat(chat, archive);
      respond({ success: true });
    } else {
      respond({ success: false, error: 'Chat não encontrado' });
    }
  } catch (e) {
    respond({ success: false, error: e.message });
  }
}

async function handlePinChatFromRuntime(chatId, pin, respond) {
  try {
    const chat = await window.Store.Chat.find(chatId);
    if (chat) {
      await window.Store.Cmd.pinChat(chat, pin);
      respond({ success: true });
    } else {
      respond({ success: false, error: 'Chat não encontrado' });
    }
  } catch (e) {
    respond({ success: false, error: e.message });
  }
}

async function handleMuteChatFromRuntime(chatId, duration, respond) {
  try {
    const chat = await window.Store.Chat.find(chatId);
    if (chat) {
      const expiration = duration === 'forever' ? -1 : Date.now() / 1000 + (duration || 0);
      await window.Store.Cmd.muteChat(chat, expiration);
      respond({ success: true });
    } else {
      respond({ success: false, error: 'Chat não encontrado' });
    }
  } catch (e) {
    respond({ success: false, error: e.message });
  }
}

async function handleUnmuteChatFromRuntime(chatId, respond) {
  try {
    const chat = await window.Store.Chat.find(chatId);
    if (chat) {
      await window.Store.Cmd.muteChat(chat, 0);
      respond({ success: true });
    } else {
      respond({ success: false, error: 'Chat não encontrado' });
    }
  } catch (e) {
    respond({ success: false, error: e.message });
  }
}

async function handleAddLabelFromRuntime(chatId, labelId, respond) {
  try {
    const chat = await window.Store.Chat.find(chatId);
    const label = window.Store.Label && window.Store.Label.get(labelId);
    
    if (chat && label && window.Store.Label.addLabel) {
      await window.Store.Label.addLabel(chat, label);
      respond({ success: true });
    } else {
      respond({ success: false, error: 'Chat ou label não encontrado' });
    }
  } catch (e) {
    respond({ success: false, error: e.message });
  }
}

async function handleRemoveLabelFromRuntime(chatId, labelId, respond) {
  try {
    const chat = await window.Store.Chat.find(chatId);
    const label = window.Store.Label && window.Store.Label.get(labelId);
    
    if (chat && label && window.Store.Label.removeLabel) {
      await window.Store.Label.removeLabel(chat, label);
      respond({ success: true });
    } else {
      respond({ success: false, error: 'Chat ou label não encontrado' });
    }
  } catch (e) {
    respond({ success: false, error: e.message });
  }
}

/**
 * Handler para mensagens vindas do FlowsRuntime via postMessage
 */
function handleRuntimeMessage(event) {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'QUANTUM_RUNTIME') return;
  
  const { action, callbackId } = event.data;
  
  const respond = (response) => {
    window.postMessage({
      source: 'QUANTUM_INJECT',
      callbackId: callbackId,
      response: response,
    }, '*');
  };
  
  switch (action) {
    case 'SEND_MESSAGE':
      handleSendMessageFromRuntime(event.data, respond);
      break;
    
    case 'SEND_MEDIA':
      handleSendMediaFromRuntime(event.data, respond);
      break;
    
    case 'MARK_AS_READ':
      handleMarkAsReadFromRuntime(event.data.chatId, respond);
      break;
    
    case 'MARK_AS_UNREAD':
      handleMarkAsUnreadFromRuntime(event.data.chatId, respond);
      break;
    
    case 'ARCHIVE_CHAT':
      handleArchiveChatFromRuntime(event.data.chatId, true, respond);
      break;
    
    case 'UNARCHIVE_CHAT':
      handleArchiveChatFromRuntime(event.data.chatId, false, respond);
      break;
    
    case 'PIN_CHAT':
      handlePinChatFromRuntime(event.data.chatId, true, respond);
      break;
    
    case 'UNPIN_CHAT':
      handlePinChatFromRuntime(event.data.chatId, false, respond);
      break;
    
    case 'MUTE_CHAT':
      handleMuteChatFromRuntime(event.data.chatId, event.data.duration, respond);
      break;
    
    case 'UNMUTE_CHAT':
      handleUnmuteChatFromRuntime(event.data.chatId, respond);
      break;
    
    case 'ADD_LABEL':
      handleAddLabelFromRuntime(event.data.chatId, event.data.labelId, respond);
      break;
    
    case 'REMOVE_LABEL':
      handleRemoveLabelFromRuntime(event.data.chatId, event.data.labelId, respond);
      break;
    
    default:
      respond({ success: false, error: 'Ação desconhecida (runtime)' });
  }
}

// Escutar mensagens do runtime
window.addEventListener('message', handleRuntimeMessage);

// Aguardar Store e configurar listeners
(function waitForStoreAndSetupFlows() {
  if (window.Store && window.Store.Msg) {
    setupStoreEventListeners();
  } else {
    setTimeout(waitForStoreAndSetupFlows, 1000);
  }
})();

/**
 * ADIÇÕES CRM AO inject.js
 * Handlers para comandos do CRM enviados via window.postMessage
 */

// Handler para mensagens do CRM
function handleCRMMessage(event) {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'QUANTUM_CRM') return;

  const { action, callbackId } = event.data;

  const respond = (response) => {
    if (callbackId) {
      window.postMessage({
        source: 'QUANTUM_INJECT',
        callbackId: callbackId,
        response: response,
      }, '*');
    }
  };

  switch (action) {
    case 'GET_ALL_CHATS':
      getAllChats().then(chats => {
        window.postMessage({
          source: 'QUANTUM_INJECT',
          type: 'CHATS_LIST',
          chats: chats,
        }, '*');
      });
      break;

    case 'SEND_MESSAGE':
      handleSendMessageFromRuntime(event.data, respond);
      break;

    case 'MARK_AS_READ':
      handleMarkAsReadFromRuntime(event.data.chatId, respond);
      break;

    case 'MARK_AS_UNREAD':
      handleMarkAsUnreadFromRuntime(event.data.chatId, respond);
      break;

    case 'ARCHIVE_CHAT':
      handleArchiveChatFromRuntime(event.data.chatId, true, respond);
      break;

    case 'UNARCHIVE_CHAT':
      handleArchiveChatFromRuntime(event.data.chatId, false, respond);
      break;

    case 'PIN_CHAT':
      handlePinChatFromRuntime(event.data.chatId, true, respond);
      break;

    case 'UNPIN_CHAT':
      handlePinChatFromRuntime(event.data.chatId, false, respond);
      break;

    case 'MUTE_CHAT':
      handleMuteChatFromRuntime(event.data.chatId, event.data.duration, respond);
      break;

    case 'ADD_LABEL':
      handleAddLabelFromRuntime(event.data.chatId, event.data.labelId, respond);
      break;

    case 'REMOVE_LABEL':
      handleRemoveLabelFromRuntime(event.data.chatId, event.data.labelId, respond);
      break;

    case 'GET_CHAT_INFO':
      getChatInfo(event.data.chatId).then(respond);
      break;

    case 'GET_LABELS':
      getLabels().then(respond);
      break;
  }
}

/**
 * Obtém todos os chats
 */
async function getAllChats() {
  if (!window.Store || !window.Store.Chat) {
    console.warn('[Inject][CRM] Store.Chat não disponível');
    return [];
  }

  try {
    const chats = window.Store.Chat.getModelsArray();

    return chats.map(chat => ({
      id: chat.id?._serialized || chat.id,
      name: chat.name || chat.pushname || chat.formattedTitle || '',
      pushname: chat.pushname || '',
      isGroup: chat.isGroup || false,
      isArchived: chat.archive || false,
      isPinned: chat.pin || false,
      isMuted: chat.mute?.isMuted || false,
      unreadCount: chat.unreadCount || 0,
      lastMessage: chat.lastReceivedKey ? {
        id: chat.lastReceivedKey._serialized,
        timestamp: chat.t,
      } : null,
      profilePicThumb: chat.contact?.profilePicThumb || null,
    }));
  } catch (e) {
    console.error('[Inject][CRM] Erro ao obter chats:', e);
    return [];
  }
}

/**
 * Obtém informações de um chat
 */
async function getChatInfo(chatId) {
  try {
    const chat = await window.Store.Chat.find(chatId);
    if (!chat) {
      return { success: false, error: 'Chat não encontrado' };
    }

    return {
      success: true,
      chat: {
        id: chat.id?._serialized,
        name: chat.name || chat.pushname || '',
        pushname: chat.pushname || '',
        isGroup: chat.isGroup || false,
        isArchived: chat.archive || false,
        isPinned: chat.pin || false,
        isMuted: chat.mute?.isMuted || false,
        unreadCount: chat.unreadCount || 0,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Obtém todas as etiquetas
 */
async function getLabels() {
  try {
    if (!window.Store.Label) {
      return { success: false, error: 'Labels não disponíveis' };
    }

    const labels = window.Store.Label.getModelsArray();

    return {
      success: true,
      labels: labels.map(label => ({
        id: label.id,
        name: label.name,
        color: label.hexColor || label.color,
      })),
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Escutar mensagens do CRM
window.addEventListener('message', handleCRMMessage);

// Notificar que o inject está pronto e informa capacidades
setTimeout(() => {
  window.postMessage({
    source: 'QUANTUM_INJECT',
    type: 'INJECT_READY',
    capabilities: ['crm', 'messages', 'labels', 'chat_actions'],
  }, '*');
}, 1000);
