import { createClient } from "@deepgram/sdk";
import { config } from "../config/env";
import { EventEmitter } from "events";

export type AudioEncoding =
  | "linear16"
  | "mulaw"
  | "alaw"
  | "mp3"
  | "opus"
  | "flac"
  | "aac";

export interface DeepgramTTSOptions {
  model?: string; // e.g., "aura-asteria-en", "aura-luna-en", "aura-stella-en"
  encoding?: AudioEncoding;
  sampleRate?: number; // 8000, 16000, 24000, 48000
  container?: string; // "wav", "mp3", "flac", "opus"
}

/**
 * Deepgram TTS service using Aura voices
 * Provides natural, real-time text-to-speech synthesis
 */
export class DeepgramTTS extends EventEmitter {
  private client: ReturnType<typeof createClient>;
  private model: string;
  private encoding: AudioEncoding;
  private sampleRate: number;
  private container: string;

  constructor(options: DeepgramTTSOptions = {}) {
    super();

    this.client = createClient(config.deepgram.apiKey);

    // Deepgram Aura models: optimized for conversational AI
    this.model = options.model || "aura-asteria-en"; // Default: friendly female voice
    this.encoding = options.encoding || "mulaw"; // μ-law for Twilio compatibility
    this.sampleRate = options.sampleRate || 8000; // 8kHz for Twilio
    this.container = options.container || "wav";

    console.log(`[Deepgram TTS] Initialized with model: ${this.model}`);
  }

  /**
   * Synthesize text to speech and return audio as a buffer
   * @param text - The text to synthesize
   */
  async synthesize(text: string): Promise<Buffer> {
    if (!text.trim()) {
      throw new Error("Text cannot be empty");
    }

    console.log(`[Deepgram TTS] Synthesizing: "${text.substring(0, 50)}..."`);

    try {
      const response = await this.client.speak.request(
        { text },
        {
          model: this.model,
          encoding: this.encoding,
          sample_rate: this.sampleRate,
          container: this.container,
        }
      );

      // Get the audio stream
      const stream = await response.getStream();
      if (!stream) {
        throw new Error("Failed to get audio stream from Deepgram");
      }

      // Collect audio chunks
      const chunks: Buffer[] = [];
      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(Buffer.from(value));
        }
      }

      const audioBuffer = Buffer.concat(chunks);
      console.log(
        `[Deepgram TTS] Synthesis complete: ${audioBuffer.length} bytes`
      );

      this.emit("synthesis_complete", audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.error("[Deepgram TTS] Synthesis error:", error);
      throw error;
    }
  }

  /**
   * Synthesize and return as base64 (for Twilio Media Streams)
   */
  async synthesizeToBase64(text: string): Promise<string> {
    const audioBuffer = await this.synthesize(text);
    return audioBuffer.toString("base64");
  }

  /**
   * Stream synthesized audio in chunks for lower latency
   * Emits 'audio_chunk' events with base64-encoded audio data
   */
  async synthesizeStreaming(text: string): Promise<void> {
    if (!text.trim()) {
      throw new Error("Text cannot be empty");
    }

    console.log(
      `[Deepgram TTS] Streaming synthesis: "${text.substring(0, 50)}..."`
    );

    try {
      const response = await this.client.speak.request(
        { text },
        {
          model: this.model,
          encoding: this.encoding,
          sample_rate: this.sampleRate,
          container: this.container,
        }
      );

      const stream = await response.getStream();
      if (!stream) {
        throw new Error("Failed to get audio stream from Deepgram");
      }

      const reader = stream.getReader();
      const allChunks: Buffer[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          const chunk = Buffer.from(value);
          allChunks.push(chunk);

          // Emit chunk as base64 for Twilio Media Streams
          const base64Chunk = chunk.toString("base64");
          this.emit("audio_chunk", base64Chunk);
        }
      }

      const totalBuffer = Buffer.concat(allChunks);
      console.log(
        `[Deepgram TTS] Streaming complete: ${totalBuffer.length} bytes`
      );
      this.emit("synthesis_complete", totalBuffer);
    } catch (error) {
      console.error("[Deepgram TTS] Streaming error:", error);
      throw error;
    }
  }

  /**
   * Get the current model/voice
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Set a new model/voice
   */
  setModel(model: string): void {
    this.model = model;
    console.log(`[Deepgram TTS] Model changed to: ${model}`);
  }
}

/**
 * Create a new Deepgram TTS instance
 */
export function createDeepgramTTS(options?: DeepgramTTSOptions): DeepgramTTS {
  return new DeepgramTTS(options);
}

/**
 * Deepgram Aura voice models
 * Optimized for conversational AI and real-time applications
 */
export const DEEPGRAM_VOICES = {
  // English voices
  "aura-asteria-en": {
    name: "Asteria",
    language: "en",
    gender: "female",
    description: "Friendly, conversational",
  },
  "aura-luna-en": {
    name: "Luna",
    language: "en",
    gender: "female",
    description: "Calm, professional",
  },
  "aura-stella-en": {
    name: "Stella",
    language: "en",
    gender: "female",
    description: "Warm, approachable",
  },
  "aura-athena-en": {
    name: "Athena",
    language: "en",
    gender: "female",
    description: "Clear, authoritative",
  },
  "aura-hera-en": {
    name: "Hera",
    language: "en",
    gender: "female",
    description: "Confident, mature",
  },
  "aura-orion-en": {
    name: "Orion",
    language: "en",
    gender: "male",
    description: "Deep, professional",
  },
  "aura-arcas-en": {
    name: "Arcas",
    language: "en",
    gender: "male",
    description: "Friendly, young",
  },
  "aura-perseus-en": {
    name: "Perseus",
    language: "en",
    gender: "male",
    description: "Clear, conversational",
  },
  "aura-angus-en": {
    name: "Angus",
    language: "en",
    gender: "male",
    description: "Warm, mature",
  },
  "aura-orpheus-en": {
    name: "Orpheus",
    language: "en",
    gender: "male",
    description: "Rich, expressive",
  },
  "aura-helios-en": {
    name: "Helios",
    language: "en",
    gender: "male",
    description: "Energetic, dynamic",
  },
  "aura-zeus-en": {
    name: "Zeus",
    language: "en",
    gender: "male",
    description: "Powerful, commanding",
  },
} as const;

/**
 * Get voice recommendation based on language and preference
 */
export function getDeepgramVoice(
  language: string = "en",
  gender: "male" | "female" = "female"
): string {
  // For now, Deepgram Aura is primarily English-focused
  // They're expanding to more languages

  if (language.startsWith("en")) {
    // Return a good default based on gender
    if (gender === "female") {
      return "aura-asteria-en"; // Friendly, conversational - great for booking agent
    } else {
      return "aura-perseus-en"; // Clear, conversational male voice
    }
  }

  // Fallback to English for now
  // As Deepgram adds more languages, we can expand this
  console.warn(
    `[Deepgram TTS] Language ${language} not yet supported, using English`
  );
  return gender === "female" ? "aura-asteria-en" : "aura-perseus-en";
}

/**
 * Language support mapping
 * Note: Deepgram is actively expanding language support for Aura
 */
export const DEEPGRAM_TTS_LANGUAGES = {
  "en-US": "aura-asteria-en",
  "en-GB": "aura-asteria-en",
  "en-AU": "aura-asteria-en",
  "en-IN": "aura-asteria-en",
  // More languages will be added by Deepgram over time
  // For now, we default to English voices
} as const;

/**
 * Get voice for a specific language code
 */
export function getVoiceForLanguage(
  languageCode: string,
  gender: "male" | "female" = "female"
): string {
  const voice =
    DEEPGRAM_TTS_LANGUAGES[languageCode as keyof typeof DEEPGRAM_TTS_LANGUAGES];

  if (voice) {
    return voice;
  }

  // Fallback to language prefix matching
  const prefix = languageCode.split("-")[0];
  if (prefix === "en") {
    return getDeepgramVoice("en", gender);
  }

  // Default fallback
  console.warn(
    `[Deepgram TTS] No voice found for ${languageCode}, using default English`
  );
  return getDeepgramVoice("en", gender);
}
