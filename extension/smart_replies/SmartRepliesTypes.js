// smart_replies/SmartRepliesTypes.js

export const CopilotMode = {
  OFF: 'off',
  SUGGEST: 'suggest',        // Apenas sugere respostas
  SEMI_AUTO: 'semi_auto',    // Sugere e aguarda confirmação
  FULL_AUTO: 'full_auto'     // Responde automaticamente
};

export const PersonaType = {
  PROFESSIONAL: 'professional',
  FRIENDLY: 'friendly',
  FORMAL: 'formal',
  SALES: 'sales',
  SUPPORT: 'support',
  CUSTOM: 'custom'
};

export const MessageType = {
  TEXT: 'text',
  AUDIO: 'audio',
  IMAGE: 'image',
  DOCUMENT: 'document',
  STICKER: 'sticker'
};

export const FlowStatus = {
  IDLE: 'idle',
  ACTIVE: 'active',
  PAUSED: 'paused',
  WAITING_INPUT: 'waiting_input',
  COMPLETED: 'completed',
  HANDED_OFF: 'handed_off'
};

export const SummaryType = {
  CHAT_OPEN: 'chat_open',
  CHAT_CLOSE: 'chat_close',
  DAILY: 'daily',
  ON_DEMAND: 'on_demand'
};

export const CorrectionType = {
  SPELLING: 'spelling',
  GRAMMAR: 'grammar',
  PUNCTUATION: 'punctuation',
  FULL: 'full'
};

export const DEFAULT_PERSONAS = {
  professional: {
    id: 'professional',
    name: 'Profissional',
    description: 'Respostas claras e objetivas',
    systemPrompt: `Você é um assistente profissional de atendimento ao cliente.
Seja claro, objetivo e educado.
Use linguagem formal mas acessível.
Sempre ofereça soluções práticas.
Mantenha respostas concisas (máximo 3 parágrafos).`,
    temperature: 0.7,
    maxTokens: 300
  },
  friendly: {
    id: 'friendly',
    name: 'Amigável',
    description: 'Tom casual e acolhedor',
    systemPrompt: `Você é um assistente amigável e acolhedor.
Use linguagem informal e emojis moderadamente.
Seja empático e compreensivo.
Crie conexão com o cliente.
Mantenha um tom leve mas profissional.`,
    temperature: 0.8,
    maxTokens: 350
  },
  formal: {
    id: 'formal',
    name: 'Formal',
    description: 'Linguagem corporativa',
    systemPrompt: `Você é um assistente corporativo formal.
Use linguagem culta e respeitosa.
Evite gírias e coloquialismos.
Seja preciso e detalhado nas informações.
Mantenha tom institucional.`,
    temperature: 0.5,
    maxTokens: 400
  },
  sales: {
    id: 'sales',
    name: 'Vendas',
    description: 'Foco em conversão',
    systemPrompt: `Você é um especialista em vendas consultivas.
Identifique as necessidades do cliente.
Destaque benefícios, não apenas características.
Use técnicas de persuasão éticas.
Crie senso de urgência quando apropriado.
Sempre inclua call-to-action.`,
    temperature: 0.8,
    maxTokens: 400
  },
  support: {
    id: 'support',
    name: 'Suporte',
    description: 'Resolução de problemas',
    systemPrompt: `Você é um especialista em suporte técnico.
Seja paciente e didático.
Forneça instruções passo a passo.
Antecipe dúvidas comuns.
Confirme a resolução do problema.
Ofereça recursos adicionais quando relevante.`,
    temperature: 0.6,
    maxTokens: 500
  }
};

export const SMART_REPLIES_CONFIG = {
  // Auto-resposta
  AUTO_RESPONSE_DELAY_MS: 2000,      // Delay antes de responder
  AUTO_RESPONSE_TYPING_SPEED: 50,     // ms por caractere (simular digitação)
  MAX_AUTO_RESPONSES_PER_CHAT: 10,    // Limite por conversa
  COOLDOWN_BETWEEN_RESPONSES_MS: 5000,
  
  // Contexto
  MAX_CONTEXT_MESSAGES: 20,
  MAX_CONTEXT_TOKENS: 4000,
  
  // TTS
  TTS_MAX_CHARS: 500,
  TTS_DEFAULT_VOICE: 'pt-BR-FranciscaNeural',
  TTS_DEFAULT_SPEED: 1.0,
  
  // Correção
  CORRECTION_MIN_LENGTH: 10,
  CORRECTION_CONFIDENCE_THRESHOLD: 0.8,
  
  // Resumos
  SUMMARY_MIN_MESSAGES: 5,
  SUMMARY_MAX_TOKENS: 500,
  DAILY_SUMMARY_HOUR: 18, // 18h
  
  // Storage keys
  STORAGE_PERSONAS: 'smart_replies_personas',
  STORAGE_SETTINGS: 'smart_replies_settings',
  STORAGE_SUMMARIES: 'smart_replies_summaries'
};

export const SELECTORS = {
  // Input de mensagem
  MESSAGE_INPUT: 'div[data-testid="conversation-compose-box-input"]',
  SEND_BUTTON: 'button[data-testid="send"]',
  ATTACH_BUTTON: 'button[data-testid="attach-menu-plus"]',
  
  // Mensagens
  MESSAGE_LIST: 'div[data-testid="conversation-panel-messages"]',
  MESSAGE_IN: '.message-in',
  MESSAGE_OUT: '.message-out',
  MESSAGE_TEXT: 'span.selectable-text',
  
  // Header do chat
  CHAT_HEADER: 'header[data-testid="conversation-header"]',
  CHAT_NAME: 'span[data-testid="conversation-info-header-chat-title"]',
  
  // Área de gravação de áudio
  AUDIO_RECORDER: 'button[data-testid="ptt-button"]',
  
  // Footer
  COMPOSE_BOX: 'footer[data-testid="compose-box"]'
};
