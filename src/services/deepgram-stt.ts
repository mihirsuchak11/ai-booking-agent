import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { config } from "../config/env";
import { EventEmitter } from "events";

export interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  speechFinal: boolean; // True when speaker has finished speaking
}

export interface DeepgramStreamOptions {
  language?: string;
  model?: string;
  punctuate?: boolean;
  interimResults?: boolean;
  utteranceEndMs?: number;
  vadEvents?: boolean;
}

/**
 * DeepgramSTT handles real-time speech-to-text transcription
 * using Deepgram's streaming API with interim results for low latency.
 */
export class DeepgramSTT extends EventEmitter {
  private client: ReturnType<typeof createClient>;
  private connection: any = null;
  private isConnected: boolean = false;
  private options: DeepgramStreamOptions;

  constructor(options: DeepgramStreamOptions = {}) {
    super();
    this.client = createClient(config.deepgram.apiKey);
    this.options = {
      language: options.language || config.deepgram.language || "en-US",
      model: options.model || config.deepgram.sttModel || "nova-2",
      punctuate: options.punctuate ?? true,
      interimResults: options.interimResults ?? true,
      utteranceEndMs: options.utteranceEndMs ?? 1000, // 1 second of silence = end of utterance
      vadEvents: options.vadEvents ?? true,
    };
  }

  /**
   * Start the Deepgram live transcription connection
   */
  async start(): Promise<void> {
    if (this.isConnected) {
      console.log("[Deepgram] Already connected");
      return;
    }

    try {
      console.log("[Deepgram] Starting live transcription...");
      console.log(
        `[Deepgram] Model: ${this.options.model}, Language: ${this.options.language}`
      );

      this.connection = this.client.listen.live({
        model: this.options.model,
        language: this.options.language,
        punctuate: this.options.punctuate,
        interim_results: this.options.interimResults,
        utterance_end_ms: this.options.utteranceEndMs,
        vad_events: this.options.vadEvents,
        encoding: "mulaw", // Twilio uses μ-law encoding
        sample_rate: 8000, // Twilio uses 8kHz
        channels: 1,
        smart_format: true,
        endpointing: 300, // Faster endpointing for responsiveness
      });

      this.setupEventHandlers();
      this.isConnected = true;
      console.log("[Deepgram] Live transcription started");
    } catch (error) {
      console.error("[Deepgram] Failed to start:", error);
      throw error;
    }
  }

  /**
   * Set up event handlers for the Deepgram connection
   */
  private setupEventHandlers(): void {
    if (!this.connection) return;

    // Connection opened
    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log("[Deepgram] Connection opened");
      this.emit("open");
    });

    // Transcription result received
    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const transcript = data.channel?.alternatives?.[0];

      if (!transcript) return;

      const result: TranscriptionResult = {
        text: transcript.transcript || "",
        isFinal: data.is_final || false,
        confidence: transcript.confidence || 0,
        speechFinal: data.speech_final || false,
      };

      // Only emit if there's actual text
      if (result.text.trim()) {
        console.log(
          `[Deepgram] ${result.isFinal ? "Final" : "Interim"}: "${
            result.text
          }" (confidence: ${(result.confidence * 100).toFixed(1)}%)`
        );
        this.emit("transcription", result);
      }

      // Emit speech_final event when speaker has finished
      if (result.speechFinal) {
        console.log("[Deepgram] Speech final detected");
        this.emit("speech_final", result);
      }
    });

    // Utterance end detected (silence after speech)
    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      console.log("[Deepgram] Utterance end detected");
      this.emit("utterance_end");
    });

    // Speech started (voice activity detected)
    this.connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
      console.log("[Deepgram] Speech started (VAD)");
      this.emit("speech_started");
    });

    // Connection closed
    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("[Deepgram] Connection closed");
      this.isConnected = false;
      this.emit("close");
    });

    // Error occurred
    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error("[Deepgram] Error:", error);
      this.emit("error", error);
    });

    // Metadata received
    this.connection.on(LiveTranscriptionEvents.Metadata, (metadata: any) => {
      console.log("[Deepgram] Metadata:", metadata);
      this.emit("metadata", metadata);
    });
  }

  /**
   * Send audio data to Deepgram for transcription
   * @param audioData - Raw audio data (μ-law encoded from Twilio)
   */
  send(audioData: Buffer | Uint8Array): void {
    if (!this.isConnected || !this.connection) {
      console.warn("[Deepgram] Cannot send audio - not connected");
      return;
    }

    try {
      this.connection.send(audioData);
    } catch (error) {
      console.error("[Deepgram] Error sending audio:", error);
    }
  }

  /**
   * Send base64-encoded audio data (from Twilio Media Streams)
   * @param base64Audio - Base64 encoded audio from Twilio
   */
  sendBase64(base64Audio: string): void {
    const audioBuffer = Buffer.from(base64Audio, "base64");
    this.send(audioBuffer);
  }

  /**
   * Close the Deepgram connection
   */
  async close(): Promise<void> {
    if (!this.isConnected || !this.connection) {
      return;
    }

    console.log("[Deepgram] Closing connection...");

    try {
      this.connection.finish();
      this.isConnected = false;
      this.connection = null;
    } catch (error) {
      console.error("[Deepgram] Error closing connection:", error);
    }
  }

  /**
   * Check if the connection is active
   */
  isActive(): boolean {
    return this.isConnected;
  }

  /**
   * Keep the connection alive by sending a keep-alive message
   */
  keepAlive(): void {
    if (this.isConnected && this.connection) {
      try {
        this.connection.keepAlive();
      } catch (error) {
        console.error("[Deepgram] Error sending keep-alive:", error);
      }
    }
  }
}

/**
 * Create a new Deepgram STT instance with optional configuration
 */
export function createDeepgramSTT(
  options?: DeepgramStreamOptions
): DeepgramSTT {
  return new DeepgramSTT(options);
}

/**
 * Voice map for language detection support
 */
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "en-AU": "English (Australia)",
  "es-ES": "Spanish (Spain)",
  "es-MX": "Spanish (Mexico)",
  "fr-FR": "French (France)",
  "fr-CA": "French (Canada)",
  "de-DE": "German",
  "it-IT": "Italian",
  "pt-BR": "Portuguese (Brazil)",
  "pt-PT": "Portuguese (Portugal)",
  "ja-JP": "Japanese",
  "ko-KR": "Korean",
  "zh-CN": "Chinese (Mandarin)",
  "hi-IN": "Hindi",
  "ar-SA": "Arabic",
  "ru-RU": "Russian",
  "nl-NL": "Dutch",
};
