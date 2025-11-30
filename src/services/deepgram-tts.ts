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
  model?: string;
  encoding?: AudioEncoding;
  sampleRate?: number;
  container?: string;
}

/**
 * Deepgram TTS service
 * Voice model is configured via DEEPGRAM_TTS_MODEL env var (default: aura-2-odysseus-en)
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
    // Single source of truth: config.deepgram.ttsModel
    this.model = options.model || config.deepgram.ttsModel;
    this.encoding = options.encoding || "mulaw";
    this.sampleRate = options.sampleRate || 8000;
    this.container = options.container || "wav";
    console.log(`[Deepgram TTS] Using model: ${this.model}`);
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!text.trim()) {
      throw new Error("Text cannot be empty");
    }

    console.log(`[Deepgram TTS] Synthesizing: "${text.substring(0, 50)}..."`);

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

    const chunks: Buffer[] = [];
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }

    const audioBuffer = Buffer.concat(chunks);
    console.log(`[Deepgram TTS] Complete: ${audioBuffer.length} bytes`);
    return audioBuffer;
  }

  async synthesizeToBase64(text: string): Promise<string> {
    const audioBuffer = await this.synthesize(text);
    return audioBuffer.toString("base64");
  }

  async synthesizeStreaming(text: string): Promise<void> {
    if (!text.trim()) {
      throw new Error("Text cannot be empty");
    }

    console.log(`[Deepgram TTS] Streaming: "${text.substring(0, 50)}..."`);

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
        this.emit("audio_chunk", chunk.toString("base64"));
      }
    }

    const totalBuffer = Buffer.concat(allChunks);
    console.log(
      `[Deepgram TTS] Streaming complete: ${totalBuffer.length} bytes`
    );
    this.emit("synthesis_complete", totalBuffer);
  }

  getModel(): string {
    return this.model;
  }
}

/**
 * Create TTS instance - always uses config.deepgram.ttsModel
 */
export function createDeepgramTTS(options?: DeepgramTTSOptions): DeepgramTTS {
  return new DeepgramTTS(options);
}

/**
 * Get voice model - always returns config.deepgram.ttsModel
 * This is the ONLY place voice selection happens
 */
export function getVoiceForLanguage(_languageCode?: string): string {
  return config.deepgram.ttsModel;
}
