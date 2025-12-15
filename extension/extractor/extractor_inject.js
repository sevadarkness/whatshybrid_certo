// extractor/extractor_inject.js
// Este arquivo é injetado NO CONTEXTO DA PÁGINA para acessar window.Store

(function() {
    'use strict';

    const EXTRACTOR_VERSION = '1.0.0';
    
    // ============================================
    // AGUARDAR STORE ESTAR DISPONÍVEL
    // ============================================
    
    function waitForStore(timeout = 60000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const check = () => {
                // Try to get Store directly
                if (window.Store && window.Store.Chat && window.Store.Contact) {
                    console.log('[Extractor] Store encontrado!');
                    resolve(window.Store);
                    return;
                }
                
                // Fallback: try to get Store via require (WAWebCollections)
                if (!window.Store && window.require) {
                    try {
                        const WAWebCollections = window.require('WAWebCollections');
                        if (WAWebCollections) {
                            window.Store = WAWebCollections;
                            console.log('[Extractor] Store carregado via WAWebCollections');
                            resolve(window.Store);
                            return;
                        }
                    } catch (e) {
                        // Continue checking
                    }
                }
                
                if (Date.now() - startTime > timeout) {
                    console.warn('[Extractor] Timeout aguardando Store após 60s');
                    reject(new Error('Timeout aguardando Store'));
                    return;
                }
                
                setTimeout(check, 500);
            };
            
            check();
        });
    }

    // ============================================
    // MÓDULO DE EXTRAÇÃO DE CONTATOS
    // ============================================
    
    const ContactExtractor = {
        
        /**
         * Extrai todos os contatos do Store
         */
        async extractAllContacts() {
            const store = await waitForStore();
            const contacts = [];
            
            try {
                const contactModels = store.Contact._models || store.Contact.getModelsArray();
                
                for (const contact of contactModels) {
                    try {
                        const contactData = await this._parseContact(contact);
                        if (contactData) {
                            contacts.push(contactData);
                        }
                    } catch (e) {
                        console.warn('[Extractor] Erro ao parsear contato:', e);
                    }
                }
            } catch (e) {
                console.error('[Extractor] Erro ao extrair contatos:', e);
            }
            
            return contacts;
        },
        
        /**
         * Parseia um contato individual
         */
        async _parseContact(contact) {
            if (!contact || !contact.id) return null;
            
            const id = contact.id._serialized || contact.id.toString();
            const isGroup = id.includes('@g.us');
            const isBroadcast = id.includes('@broadcast');
            
            // Pular broadcasts
            if (isBroadcast) return null;
            
            let profilePicUrl = null;
            try {
                const pic = await this._getProfilePic(contact);
                profilePicUrl = pic;
            } catch (e) {}
            
            return {
                id: id,
                number: contact.id.user || id.split('@')[0],
                name: contact.name || contact.pushname || contact.notifyName || '',
                pushname: contact.pushname || '',
                shortName: contact.shortName || '',
                isMyContact: contact.isMyContact || false,
                isGroup: isGroup,
                isBusiness: contact.isBusiness || false,
                isEnterprise: contact.isEnterprise || false,
                isBlocked: contact.isContactBlocked || false,
                profilePicUrl: profilePicUrl,
                about: contact.about || '',
                verifiedName: contact.verifiedName || '',
                labels: await this._getContactLabels(id),
                lastSeen: contact.lastSeen || null,
                extractedAt: new Date().toISOString()
            };
        },
        
        /**
         * Obtém foto de perfil
         */
        async _getProfilePic(contact) {
            try {
                if (window.Store.ProfilePic) {
                    const result = await window.Store.ProfilePic.profilePicFind(contact.id);
                    return result?.eurl || result?.imgFull || null;
                }
            } catch (e) {}
            return null;
        },
        
        /**
         * Obtém rótulos/labels do contato
         */
        async _getContactLabels(contactId) {
            try {
                if (window.Store.Label && window.Store.LabelAssociation) {
                    const associations = window.Store.LabelAssociation._models || [];
                    const labels = window.Store.Label._models || [];
                    
                    const contactLabels = associations
                        .filter(a => a.id && a.id.includes(contactId))
                        .map(a => {
                            const labelId = a.labelId;
                            const label = labels.find(l => l.id === labelId);
                            return label ? {
                                id: label.id,
                                name: label.name,
                                color: label.hexColor || label.color
                            } : null;
                        })
                        .filter(Boolean);
                    
                    return contactLabels;
                }
            } catch (e) {}
            return [];
        }
    };

    // ============================================
    // MÓDULO DE EXTRAÇÃO DE CHATS
    // ============================================
    
    const ChatExtractor = {
        
        /**
         * Extrai todos os chats
         */
        async extractAllChats(options = {}) {
            const store = await waitForStore();
            const chats = [];
            
            const {
                includeMessages = false,
                messageLimit = 50,
                includeMedia = false
            } = options;
            
            try {
                const chatModels = store.Chat._models || store.Chat.getModelsArray();
                
                for (const chat of chatModels) {
                    try {
                        const chatData = await this._parseChat(chat, {
                            includeMessages,
                            messageLimit,
                            includeMedia
                        });
                        if (chatData) {
                            chats.push(chatData);
                        }
                    } catch (e) {
                        console.warn('[Extractor] Erro ao parsear chat:', e);
                    }
                }
            } catch (e) {
                console.error('[Extractor] Erro ao extrair chats:', e);
            }
            
            return chats;
        },
        
        /**
         * Parseia um chat individual
         */
        async _parseChat(chat, options) {
            if (!chat || !chat.id) return null;
            
            const id = chat.id._serialized || chat.id.toString();
            const isGroup = id.includes('@g.us');
            
            let lastMessage = null;
            if (chat.lastReceivedKey) {
                try {
                    const msg = await this._getMessageByKey(chat.lastReceivedKey);
                    lastMessage = msg;
                } catch (e) {}
            }
            
            const chatData = {
                id: id,
                name: chat.name || chat.contact?.pushname || chat.formattedTitle || '',
                isGroup: isGroup,
                isReadOnly: chat.isReadOnly || false,
                isArchived: chat.archive || false,
                isPinned: chat.pin ? true : false,
                isMuted: chat.mute?.isMuted || false,
                muteExpiration: chat.mute?.expiration || null,
                unreadCount: chat.unreadCount || 0,
                timestamp: chat.t ? new Date(chat.t * 1000).toISOString() : null,
                lastMessage: lastMessage,
                labels: await ContactExtractor._getContactLabels(id),
                groupMetadata: isGroup ? await this._getGroupMetadata(chat) : null,
                extractedAt: new Date().toISOString()
            };
            
            // Incluir mensagens se solicitado
            if (options.includeMessages) {
                chatData.messages = await this.extractChatMessages(id, options.messageLimit);
            }
            
            return chatData;
        },
        
        /**
         * Obtém metadados do grupo
         */
        async _getGroupMetadata(chat) {
            try {
                const metadata = chat.groupMetadata || await window.Store.GroupMetadata.find(chat.id);
                
                if (metadata) {
                    return {
                        id: metadata.id._serialized || metadata.id.toString(),
                        subject: metadata.subject || '',
                        description: metadata.desc || '',
                        owner: metadata.owner?._serialized || metadata.owner?.toString() || '',
                        creation: metadata.creation ? new Date(metadata.creation * 1000).toISOString() : null,
                        participantCount: metadata.participants?.length || 0,
                        participants: (metadata.participants || []).map(p => ({
                            id: p.id._serialized || p.id.toString(),
                            isAdmin: p.isAdmin || false,
                            isSuperAdmin: p.isSuperAdmin || false
                        })),
                        isAnnounce: metadata.announce || false,
                        isRestrict: metadata.restrict || false
                    };
                }
            } catch (e) {
                console.warn('[Extractor] Erro ao obter metadados do grupo:', e);
            }
            return null;
        },
        
        /**
         * Extrai mensagens de um chat
         */
        async extractChatMessages(chatId, limit = 50) {
            const messages = [];
            
            try {
                const chat = await window.Store.Chat.get(chatId);
                if (!chat) return messages;
                
                // Carregar mais mensagens se necessário
                await chat.loadEarlierMsgs();
                
                const msgModels = chat.msgs._models || chat.msgs.getModelsArray();
                const recentMsgs = msgModels.slice(-limit);
                
                for (const msg of recentMsgs) {
                    const parsedMsg = await MessageExtractor._parseMessage(msg);
                    if (parsedMsg) {
                        messages.push(parsedMsg);
                    }
                }
            } catch (e) {
                console.error('[Extractor] Erro ao extrair mensagens:', e);
            }
            
            return messages;
        },
        
        /**
         * Obtém mensagem por key
         */
        async _getMessageByKey(key) {
            try {
                const msg = await window.Store.Msg.get(key);
                return await MessageExtractor._parseMessage(msg);
            } catch (e) {
                return null;
            }
        }
    };

    // ============================================
    // MÓDULO DE EXTRAÇÃO DE MENSAGENS
    // ============================================
    
    const MessageExtractor = {
        
        /**
         * Parseia uma mensagem
         */
        async _parseMessage(msg) {
            if (!msg) return null;
            
            try {
                return {
                    id: msg.id._serialized || msg.id.toString(),
                    chatId: msg.from?._serialized || msg.from?.toString() || '',
                    from: msg.from?._serialized || msg.from?.toString() || '',
                    to: msg.to?._serialized || msg.to?.toString() || '',
                    author: msg.author?._serialized || msg.author?.toString() || '',
                    timestamp: msg.t ? new Date(msg.t * 1000).toISOString() : null,
                    type: msg.type || 'unknown',
                    body: msg.body || '',
                    caption: msg.caption || '',
                    isForwarded: msg.isForwarded || false,
                    forwardingScore: msg.forwardingScore || 0,
                    isFromMe: msg.id?.fromMe || false,
                    isStatus: msg.isStatusV3 || false,
                    hasMedia: msg.hasMedia || false,
                    mediaType: msg.mediaType || null,
                    mimetype: msg.mimetype || null,
                    // Detecção de edição/exclusão
                    isDeleted: msg.isRevoked || msg.type === 'revoked' || false,
                    isEdited: msg.isEdited || msg.latestEditSenderTimestampMs ? true : false,
                    editedAt: msg.latestEditSenderTimestampMs 
                        ? new Date(msg.latestEditSenderTimestampMs).toISOString() 
                        : null,
                    originalBody: msg.originalBody || null,
                    // Reações
                    reactions: this._getReactions(msg),
                    // Quotation
                    quotedMsg: msg.quotedMsg ? {
                        id: msg.quotedMsg.id?._serialized || '',
                        body: msg.quotedMsg.body || '',
                        type: msg.quotedMsg.type || ''
                    } : null,
                    // Status de entrega
                    ack: msg.ack || 0, // 0=pendente, 1=enviado, 2=entregue, 3=lido, 4=reproduzido
                    ackName: this._getAckName(msg.ack),
                    extractedAt: new Date().toISOString()
                };
            } catch (e) {
                console.warn('[Extractor] Erro ao parsear mensagem:', e);
                return null;
            }
        },
        
        /**
         * Obtém reações da mensagem
         */
        _getReactions(msg) {
            if (!msg.reactions || !msg.reactions._models) return [];
            
            return msg.reactions._models.map(r => ({
                emoji: r.emoji || r.id,
                count: r.senders?.length || 0,
                senders: (r.senders || []).map(s => s._serialized || s.toString())
            }));
        },
        
        /**
         * Converte código ACK para nome
         */
        _getAckName(ack) {
            const ackNames = {
                0: 'PENDING',
                1: 'SENT',
                2: 'DELIVERED',
                3: 'READ',
                4: 'PLAYED'
            };
            return ackNames[ack] || 'UNKNOWN';
        }
    };

    // ============================================
    // MÓDULO DE EXTRAÇÃO DE GRUPOS
    // ============================================
    
    const GroupExtractor = {
        
        /**
         * Extrai todos os grupos
         */
        async extractAllGroups() {
            const store = await waitForStore();
            const groups = [];
            
            try {
                const chatModels = store.Chat._models || store.Chat.getModelsArray();
                
                for (const chat of chatModels) {
                    const id = chat.id?._serialized || chat.id?.toString() || '';
                    if (id.includes('@g.us')) {
                        const groupData = await ChatExtractor._parseChat(chat, { includeMessages: false });
                        if (groupData) {
                            groups.push(groupData);
                        }
                    }
                }
            } catch (e) {
                console.error('[Extractor] Erro ao extrair grupos:', e);
            }
            
            return groups;
        },
        
        /**
         * Extrai participantes de um grupo específico
         */
        async extractGroupParticipants(groupId) {
            const participants = [];
            
            try {
                const metadata = await window.Store.GroupMetadata.find(groupId);
                
                if (metadata && metadata.participants) {
                    for (const p of metadata.participants) {
                        const contact = await window.Store.Contact.get(p.id);
                        participants.push({
                            id: p.id._serialized || p.id.toString(),
                            number: p.id.user || '',
                            name: contact?.name || contact?.pushname || '',
                            isAdmin: p.isAdmin || false,
                            isSuperAdmin: p.isSuperAdmin || false
                        });
                    }
                }
            } catch (e) {
                console.error('[Extractor] Erro ao extrair participantes:', e);
            }
            
            return participants;
        }
    };

    // ============================================
    // MÓDULO DE EXTRAÇÃO DE LABELS/RÓTULOS
    // ============================================
    
    const LabelExtractor = {
        
        /**
         * Extrai todos os labels
         */
        async extractAllLabels() {
            const store = await waitForStore();
            const labels = [];
            
            try {
                if (store.Label) {
                    const labelModels = store.Label._models || store.Label.getModelsArray();
                    
                    for (const label of labelModels) {
                        labels.push({
                            id: label.id,
                            name: label.name || '',
                            color: label.hexColor || label.color || '',
                            count: label.count || 0,
                            predefinedId: label.predefinedId || null
                        });
                    }
                }
            } catch (e) {
                console.error('[Extractor] Erro ao extrair labels:', e);
            }
            
            return labels;
        },
        
        /**
         * Extrai associações de labels (quais contatos/chats têm quais labels)
         */
        async extractLabelAssociations() {
            const store = await waitForStore();
            const associations = [];
            
            try {
                if (store.LabelAssociation) {
                    const assocModels = store.LabelAssociation._models || [];
                    
                    for (const assoc of assocModels) {
                        associations.push({
                            labelId: assoc.labelId,
                            chatId: assoc.chatId?._serialized || assoc.id || '',
                            type: assoc.type || 'chat'
                        });
                    }
                }
            } catch (e) {
                console.error('[Extractor] Erro ao extrair associações de labels:', e);
            }
            
            return associations;
        }
    };

    // ============================================
    // DETECTOR DE MENSAGENS APAGADAS/EDITADAS
    // ============================================
    
    const MessageChangeDetector = {
        
        deletedMessages: new Map(),
        editedMessages: new Map(),
        originalMessages: new Map(),
        listeners: [],
        
        /**
         * Inicializa os listeners do Store
         */
        init() {
            this._hookMessageEvents();
            this._loadStoredData();
            console.log('[Extractor] MessageChangeDetector inicializado');
        },
        
        /**
         * Hook nos eventos de mensagem do Store
         */
        _hookMessageEvents() {
            const self = this;
            
            // Hook no evento de revoke (mensagem apagada)
            if (window.Store.Msg) {
                const originalAdd = window.Store.Msg.add;
                window.Store.Msg.add = function(...args) {
                    const result = originalAdd.apply(this, args);
                    
                    // Verificar se é uma mensagem nova para armazenar original
                    if (args[0] && !args[0].isRevoked) {
                        self._storeOriginalMessage(args[0]);
                    }
                    
                    return result;
                };
                
                // Observar mudanças em mensagens existentes
                if (window.Store.Msg._models) {
                    window.Store.Msg.on('change:type', (msg) => {
                        if (msg.type === 'revoked') {
                            self._handleDeletedMessage(msg);
                        }
                    });
                    
                    window.Store.Msg.on('change:body', (msg) => {
                        if (msg.isEdited) {
                            self._handleEditedMessage(msg);
                        }
                    });
                }
            }
        },
        
        /**
         * Armazena mensagem original
         */
        _storeOriginalMessage(msg) {
            if (!msg || !msg.id) return;
            
            const msgId = msg.id._serialized || msg.id.toString();
            
            if (!this.originalMessages.has(msgId)) {
                this.originalMessages.set(msgId, {
                    id: msgId,
                    body: msg.body || '',
                    type: msg.type || '',
                    timestamp: msg.t ? new Date(msg.t * 1000).toISOString() : null,
                    from: msg.from?._serialized || '',
                    storedAt: new Date().toISOString()
                });
                
                this._persistData();
            }
        },
        
        /**
         * Trata mensagem apagada
         */
        _handleDeletedMessage(msg) {
            const msgId = msg.id?._serialized || msg.id?.toString();
            if (!msgId) return;
            
            const original = this.originalMessages.get(msgId);
            
            const deletedData = {
                id: msgId,
                chatId: msg.from?._serialized || msg.to?._serialized || '',
                originalBody: original?.body || '[Conteúdo não capturado]',
                originalType: original?.type || 'unknown',
                deletedAt: new Date().toISOString(),
                originalTimestamp: original?.timestamp || null,
                from: msg.from?._serialized || msg.author?._serialized || ''
            };
            
            this.deletedMessages.set(msgId, deletedData);
            this._persistData();
            this._notifyListeners('deleted', deletedData);
            
            console.log('[Extractor] Mensagem apagada detectada:', deletedData);
        },
        
        /**
         * Trata mensagem editada
         */
        _handleEditedMessage(msg) {
            const msgId = msg.id?._serialized || msg.id?.toString();
            if (!msgId) return;
            
            const original = this.originalMessages.get(msgId);
            
            const editedData = {
                id: msgId,
                chatId: msg.from?._serialized || msg.to?._serialized || '',
                originalBody: original?.body || '[Conteúdo original não capturado]',
                newBody: msg.body || '',
                editedAt: new Date().toISOString(),
                originalTimestamp: original?.timestamp || null,
                from: msg.from?._serialized || msg.author?._serialized || ''
            };
            
            // Atualizar histórico de edições
            if (!this.editedMessages.has(msgId)) {
                this.editedMessages.set(msgId, []);
            }
            this.editedMessages.get(msgId).push(editedData);
            
            // Atualizar original armazenado
            if (this.originalMessages.has(msgId)) {
                const stored = this.originalMessages.get(msgId);
                stored.body = msg.body;
                stored.lastEditedAt = editedData.editedAt;
            }
            
            this._persistData();
            this._notifyListeners('edited', editedData);
            
            console.log('[Extractor] Mensagem editada detectada:', editedData);
        },
        
        /**
         * Persiste dados no storage
         */
        _persistData() {
            try {
                const data = {
                    deleted: Array.from(this.deletedMessages.entries()),
                    edited: Array.from(this.editedMessages.entries()),
                    originals: Array.from(this.originalMessages.entries()),
                    lastUpdated: new Date().toISOString()
                };
                
                // Enviar para content script persistir
                window.postMessage({
                    type: 'EXTRACTOR_PERSIST_DATA',
                    data: data
                }, '*');
            } catch (e) {
                console.warn('[Extractor] Erro ao persistir dados:', e);
            }
        },
        
        /**
         * Carrega dados armazenados
         */
        _loadStoredData() {
            window.postMessage({
                type: 'EXTRACTOR_LOAD_DATA'
            }, '*');
        },
        
        /**
         * Restaura dados carregados
         */
        restoreData(data) {
            if (data.deleted) {
                this.deletedMessages = new Map(data.deleted);
            }
            if (data.edited) {
                this.editedMessages = new Map(data.edited);
            }
            if (data.originals) {
                this.originalMessages = new Map(data.originals);
            }
            console.log('[Extractor] Dados restaurados:', {
                deleted: this.deletedMessages.size,
                edited: this.editedMessages.size,
                originals: this.originalMessages.size
            });
        },
        
        /**
         * Adiciona listener para mudanças
         */
        addListener(callback) {
            this.listeners.push(callback);
        },
        
        /**
         * Notifica listeners
         */
        _notifyListeners(type, data) {
            for (const listener of this.listeners) {
                try {
                    listener(type, data);
                } catch (e) {}
            }
            
            // Notificar content script
            window.postMessage({
                type: 'EXTRACTOR_MESSAGE_CHANGE',
                changeType: type,
                data: data
            }, '*');
        },
        
        /**
         * Obtém todas as mensagens apagadas
         */
        getDeletedMessages() {
            return Array.from(this.deletedMessages.values());
        },
        
        /**
         * Obtém todas as mensagens editadas
         */
        getEditedMessages() {
            const result = [];
            for (const [msgId, edits] of this.editedMessages.entries()) {
                result.push({
                    messageId: msgId,
                    editHistory: edits
                });
            }
            return result;
        }
    };

    // ============================================
    // API PRINCIPAL DO EXTRATOR
    // ============================================
    
    window.WhatsAppExtractor = {
        version: EXTRACTOR_VERSION,
        
        // Contatos
        extractAllContacts: () => ContactExtractor.extractAllContacts(),
        
        // Chats
        extractAllChats: (options) => ChatExtractor.extractAllChats(options),
        extractChatMessages: (chatId, limit) => ChatExtractor.extractChatMessages(chatId, limit),
        
        // Grupos
        extractAllGroups: () => GroupExtractor.extractAllGroups(),
        extractGroupParticipants: (groupId) => GroupExtractor.extractGroupParticipants(groupId),
        
        // Labels
        extractAllLabels: () => LabelExtractor.extractAllLabels(),
        extractLabelAssociations: () => LabelExtractor.extractLabelAssociations(),
        
        // Mensagens apagadas/editadas
        getDeletedMessages: () => MessageChangeDetector.getDeletedMessages(),
        getEditedMessages: () => MessageChangeDetector.getEditedMessages(),
        onMessageChange: (callback) => MessageChangeDetector.addListener(callback),
        
        // Extração completa
        async extractEverything(options = {}) {
            const {
                includeMessages = false,
                messageLimit = 50,
                includeDeleted = true,
                includeEdited = true
            } = options;
            
            console.log('[Extractor] Iniciando extração completa...');
            
            const [contacts, chats, groups, labels, labelAssociations] = await Promise.all([
                this.extractAllContacts(),
                this.extractAllChats({ includeMessages, messageLimit }),
                this.extractAllGroups(),
                this.extractAllLabels(),
                this.extractLabelAssociations()
            ]);
            
            const result = {
                extractedAt: new Date().toISOString(),
                version: EXTRACTOR_VERSION,
                summary: {
                    totalContacts: contacts.length,
                    totalChats: chats.length,
                    totalGroups: groups.length,
                    totalLabels: labels.length
                },
                contacts,
                chats,
                groups,
                labels,
                labelAssociations
            };
            
            if (includeDeleted) {
                result.deletedMessages = this.getDeletedMessages();
                result.summary.deletedMessages = result.deletedMessages.length;
            }
            
            if (includeEdited) {
                result.editedMessages = this.getEditedMessages();
                result.summary.editedMessages = result.editedMessages.length;
            }
            
            console.log('[Extractor] Extração completa finalizada:', result.summary);
            
            return result;
        },
        
        // Inicialização
        init() {
            MessageChangeDetector.init();
            console.log('[Extractor] WhatsAppExtractor inicializado v' + EXTRACTOR_VERSION);
        }
    };

    // ============================================
    // LISTENER PARA COMUNICAÇÃO COM CONTENT SCRIPT
    // ============================================
    
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        
        const { type, requestId, action, params } = event.data;
        
        if (type === 'EXTRACTOR_REQUEST') {
            let result = null;
            let error = null;
            
            try {
                switch (action) {
                    case 'extractAllContacts':
                        result = await window.WhatsAppExtractor.extractAllContacts();
                        break;
                    case 'extractAllChats':
                        result = await window.WhatsAppExtractor.extractAllChats(params);
                        break;
                    case 'extractAllGroups':
                        result = await window.WhatsAppExtractor.extractAllGroups();
                        break;
                    case 'extractAllLabels':
                        result = await window.WhatsAppExtractor.extractAllLabels();
                        break;
                    case 'extractEverything':
                        result = await window.WhatsAppExtractor.extractEverything(params);
                        break;
                    case 'getDeletedMessages':
                        result = window.WhatsAppExtractor.getDeletedMessages();
                        break;
                    case 'getEditedMessages':
                        result = window.WhatsAppExtractor.getEditedMessages();
                        break;
                    case 'extractChatMessages':
                        result = await window.WhatsAppExtractor.extractChatMessages(params.chatId, params.limit);
                        break;
                    case 'extractGroupParticipants':
                        result = await window.WhatsAppExtractor.extractGroupParticipants(params.groupId);
                        break;
                    default:
                        error = 'Ação desconhecida: ' + action;
                }
            } catch (e) {
                error = e.message;
            }
            
            window.postMessage({
                type: 'EXTRACTOR_RESPONSE',
                requestId,
                result,
                error
            }, '*');
        }
        
        if (type === 'EXTRACTOR_STORED_DATA') {
            MessageChangeDetector.restoreData(event.data.data);
        }
    });

    // ============================================
    // AUTO-INICIALIZAÇÃO
    // ============================================
    
    waitForStore().then(() => {
        window.WhatsAppExtractor.init();
        window.postMessage({ type: 'EXTRACTOR_READY' }, '*');
    }).catch(err => {
        console.error('[Extractor] Falha ao inicializar:', err);
    });

})();