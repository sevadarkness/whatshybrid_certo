// smart_replies/TextToSpeechService.js

import { SMART_REPLIES_CONFIG } from './SmartRepliesTypes.js';

class TextToSpeechService {
  constructor() {
    this.isPlaying = false;
    this.currentAudio = null;
    this.currentText = '';
    this.voice = SMART_REPLIES_CONFIG.TTS_DEFAULT_VOICE;
    this.speed = SMART_REPLIES_CONFIG.TTS_DEFAULT_SPEED;
    this.provider = 'azure'; // 'azure' | 'browser'
    this.azureConfig = null;
  }

  configureAzure(config) {
    this.azureConfig = config;
  }

  async speak(text, options = {}) {
    if (!text) return;

    // Limitar tamanho
    const truncatedText = text.slice(0, SMART_REPLIES_CONFIG.TTS_MAX_CHARS);
    this.currentText = truncatedText;

    // Se já estiver tocando, parar
    if (this.isPlaying) {
      this.stop();
    }

    try {
      if (this.provider === 'azure' && this.azureConfig?.key && this.azureConfig?.region) {
        await this.speakWithAzure(truncatedText, options);
      } else {
        await this.speakWithBrowser(truncatedText, options);
      }
    } catch (error) {
      console.error('[TTS] Erro na síntese de voz:', error);
      await this.speakWithBrowser(truncatedText, options);
    }
  }

  async speakWithAzure(text, options) {
    const ssml = this.buildAzureSSML(text, options);
    const { key, region } = this.azureConfig;

    const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
      },
      body: ssml
    });

    if (!response.ok) {
      throw new Error(`Azure TTS error: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    this.playAudio(url);
  }

  async speakWithBrowser(text, options) {
    if (!window.speechSynthesis) {
      console.warn('[TTS] speechSynthesis não suportado pelo navegador');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = options.speed || this.speed;
    
    // Tentar escolher voz em português
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith('pt-BR')) || voices[0];
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    utterance.onstart = () => {
      this.isPlaying = true;
    };

    utterance.onend = () => {
      this.isPlaying = false;
      this.currentText = '';
    };

    window.speechSynthesis.speak(utterance);
  }

  buildAzureSSML(text, options) {
    const voice = options.voice || this.voice;
    const speed = options.speed || this.speed;
    
    return `
<speak version="1.0" xml:lang="pt-BR">
  <voice name="${voice}">
    <prosody rate="${speed}">
      ${text}
    </prosody>
  </voice>
</speak>
    `.trim();
  }

  playAudio(url) {
    if (this.currentAudio) {
      this.currentAudio.pause();
      URL.revokeObjectURL(this.currentAudio.src);
    }

    this.currentAudio = new Audio(url);
    this.currentAudio.onended = () => {
      this.isPlaying = false;
      this.currentText = '';
      URL.revokeObjectURL(url);
    };

    this.isPlaying = true;
    this.currentAudio.play();
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      URL.revokeObjectURL(this.currentAudio.src);
      this.currentAudio = null;
    }
    this.isPlaying = false;

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  setVoice(voice) {
    this.voice = voice;
  }

  setSpeed(speed) {
    this.speed = speed;
  }
}

// Singleton
export const textToSpeechService = new TextToSpeechService();
export default textToSpeechService;
