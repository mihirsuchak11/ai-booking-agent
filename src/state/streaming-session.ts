import { EventEmitter } from "events";
import { DeepgramSTT, TranscriptionResult } from "../services/deepgram-stt";
import { DeepgramTTS, getVoiceForLanguage } from "../services/deepgram-tts";
import {
  processConversationStreaming,
  StreamingResponse,
} from "../services/openai";
import { BusinessConfigWithDetails } from "../db/types";

export type SessionState =
  | "initializing"
  | "greeting"
  | "listening"
  | "processing"
  | "speaking"
  | "completed"
  | "failed";

export interface StreamingSessionConfig {
  callSid: string;
  streamSid: string;
  from: string;
  to: string;
  businessId?: string;
  businessConfig?: BusinessConfigWithDetails | null;
  language?: string;
}

export interface CollectedData {
  customerName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  phoneNumber?: string;
}

/**
 * StreamingSession manages the real-time voice conversation pipeline:
 * Deepgram STT -> OpenAI LLM -> Azure TTS
 * with barge-in support and state management.
 */
export class StreamingSession extends EventEmitter {
  // Session identifiers
  public callSid: string;
  public streamSid: string;
  public from: string;
  public to: string;
  public businessId?: string;
  public dbSessionId?: string;

  // State
  private state: SessionState = "initializing";
  private conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }> = [];
  private collectedData: CollectedData = {};
  private currentTranscript: string = "";
  private isProcessing: boolean = false;

  // Services
  private stt: DeepgramSTT;
  private tts: DeepgramTTS;
  private businessConfig: BusinessConfigWithDetails | null;

  // Audio management
  private audioQueue: string[] = []; // Base64 audio chunks to send
  private isSpeaking: boolean = false;
  private shouldInterrupt: boolean = false;

  // Timing
  private silenceTimer: NodeJS.Timeout | null = null;
  private readonly SILENCE_THRESHOLD_MS = 1500; // Wait 1.5s of silence before processing
  private createdAt: Date = new Date();

  // Callbacks for sending audio to Twilio
  private sendAudioCallback: ((base64Audio: string) => void) | null = null;
  private clearAudioCallback: (() => void) | null = null;

  constructor(config: StreamingSessionConfig) {
    super();

    this.callSid = config.callSid;
    this.streamSid = config.streamSid;
    this.from = config.from;
    this.to = config.to;
    this.businessId = config.businessId;
    this.businessConfig = config.businessConfig || null;

    // Initialize STT with language
    const language =
      config.language || config.businessConfig?.business?.timezone
        ? this.getLanguageFromTimezone(
            config.businessConfig?.business?.timezone
          )
        : "en-US";

    this.stt = new DeepgramSTT({ language });

    // Initialize TTS with appropriate voice
    const ttsModel = getVoiceForLanguage(language);
    this.tts = new DeepgramTTS({ model: ttsModel });

    this.setupSTTHandlers();
    this.setupTTSHandlers();

    console.log(`[StreamingSession] Created for call ${this.callSid}`);
  }

  /**
   * Set callbacks for sending audio back to Twilio
   */
  setAudioCallbacks(
    sendAudio: (base64Audio: string) => void,
    clearAudio: () => void
  ): void {
    this.sendAudioCallback = sendAudio;
    this.clearAudioCallback = clearAudio;
  }

  /**
   * Start the session - kick off STT and send greeting
   * Greeting should NOT wait on STT connection to keep things snappy.
   */
  async start(): Promise<void> {
    try {
      this.setState("initializing");

      // Start STT in the background - don't block greeting on this
      void this.stt.start();

      // Send greeting as soon as the media stream is up
      this.setState("greeting");
      await this.sendGreeting();

      this.setState("listening");
    } catch (error) {
      console.error(`[StreamingSession] Failed to start:`, error);
      this.setState("failed");
      throw error;
    }
  }

  /**
   * Process incoming audio from Twilio
   */
  processAudio(base64Audio: string): void {
    // If we're speaking and detect voice activity, handle barge-in
    if (this.isSpeaking) {
      // The STT will emit speech_started if it detects voice
      // We'll handle barge-in in the speech_started handler
    }

    // Send audio to Deepgram for transcription
    this.stt.sendBase64(base64Audio);
  }

  /**
   * Handle barge-in (caller interrupts while AI is speaking)
   */
  private handleBargeIn(): void {
    if (!this.isSpeaking) return;

    console.log(`[StreamingSession] Barge-in detected! Stopping playback.`);

    this.shouldInterrupt = true;
    this.isSpeaking = false;
    this.audioQueue = [];

    // Clear any pending audio in Twilio
    if (this.clearAudioCallback) {
      this.clearAudioCallback();
    }

    // Send a brief silence to forcefully interrupt current playback
    // This creates an immediate audio "break" that stops the current buffer
    if (this.sendAudioCallback) {
      // Send empty/silence audio chunk to break the stream
      const silenceChunk = Buffer.alloc(160).toString("base64"); // ~20ms silence
      this.sendAudioCallback(silenceChunk);
    }

    this.emit("barge_in");
    this.setState("listening");
  }

  /**
   * Set up Deepgram STT event handlers
   */
  private setupSTTHandlers(): void {
    // Speech started - potential barge-in
    this.stt.on("speech_started", () => {
      if (this.isSpeaking) {
        this.handleBargeIn();
      }
      this.resetSilenceTimer();
    });

    // Interim transcription result
    this.stt.on("transcription", (result: TranscriptionResult) => {
      if (result.isFinal) {
        // Accumulate final transcripts
        this.currentTranscript +=
          (this.currentTranscript ? " " : "") + result.text;
        console.log(
          `[StreamingSession] Transcript: "${this.currentTranscript}"`
        );
      }

      // Reset silence timer on any speech
      this.resetSilenceTimer();
    });

    // Speech final - speaker has finished
    this.stt.on("speech_final", (result: TranscriptionResult) => {
      console.log(`[StreamingSession] Speech final detected`);
      // Process after a short delay to ensure we have the complete utterance
      this.scheduleProcesing(500);
    });

    // Utterance end - silence detected
    this.stt.on("utterance_end", () => {
      console.log(`[StreamingSession] Utterance end detected`);
      if (this.currentTranscript.trim()) {
        this.scheduleProcesing(300);
      }
    });

    this.stt.on("error", (error) => {
      console.error(`[StreamingSession] STT error:`, error);
      this.emit("error", error);
    });

    this.stt.on("close", () => {
      console.log(`[StreamingSession] STT connection closed`);
    });
  }

  /**
   * Set up Deepgram TTS event handlers
   */
  private setupTTSHandlers(): void {
    this.tts.on("audio_chunk", (base64Audio: string) => {
      if (this.shouldInterrupt) {
        // Discard audio if interrupted
        return;
      }
      this.audioQueue.push(base64Audio);
      this.processAudioQueue();
    });

    this.tts.on("synthesis_complete", () => {
      console.log(`[StreamingSession] TTS synthesis complete`);
      // Process any remaining audio in queue
      this.processAudioQueue();
    });
  }

  /**
   * Process the audio queue and send to Twilio
   */
  private processAudioQueue(): void {
    if (this.shouldInterrupt) {
      this.audioQueue = [];
      return;
    }

    while (this.audioQueue.length > 0 && !this.shouldInterrupt) {
      const chunk = this.audioQueue.shift();
      if (chunk && this.sendAudioCallback) {
        this.sendAudioCallback(chunk);
      }
    }

    // Check if we're done speaking
    if (this.audioQueue.length === 0 && this.isSpeaking) {
      this.isSpeaking = false;
      this.setState("listening");
    }
  }

  /**
   * Reset the silence timer
   */
  private resetSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    this.silenceTimer = setTimeout(() => {
      if (this.currentTranscript.trim() && !this.isProcessing) {
        this.processUserInput();
      }
    }, this.SILENCE_THRESHOLD_MS);
  }

  /**
   * Schedule processing after a delay
   */
  private scheduleProcesing(delayMs: number): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    this.silenceTimer = setTimeout(() => {
      if (this.currentTranscript.trim() && !this.isProcessing) {
        this.processUserInput();
      }
    }, delayMs);
  }

  /**
   * Process the accumulated user input
   */
  private async processUserInput(): Promise<void> {
    if (this.isProcessing || !this.currentTranscript.trim()) {
      return;
    }

    const userMessage = this.currentTranscript.trim();
    this.currentTranscript = "";
    this.isProcessing = true;
    this.setState("processing");

    console.log(`[StreamingSession] Processing: "${userMessage}"`);

    // Add to conversation history
    this.conversationHistory.push({ role: "user", content: userMessage });

    try {
      // Get AI response with streaming
      const response = await this.getAIResponse(userMessage);

      // Add AI response to history
      this.conversationHistory.push({
        role: "assistant",
        content: response.response,
      });

      // Check if booking is complete
      if (response.isComplete && response.extractedData) {
        this.collectedData = {
          customerName: response.extractedData.customerName,
          appointmentDate: response.extractedData.appointmentDate,
          appointmentTime: response.extractedData.appointmentTime,
          phoneNumber: this.from,
        };

        this.emit("booking_complete", {
          ...this.collectedData,
          response: response.response,
        });
      }

      // Speak the response
      await this.speak(response.response);

      // If complete, end the session
      if (response.isComplete) {
        this.setState("completed");
        // Give time for the final message to play
        setTimeout(() => {
          this.emit("session_complete", this.collectedData);
        }, 3000);
      }
    } catch (error) {
      console.error(`[StreamingSession] Error processing input:`, error);
      await this.speak(
        "I'm sorry, I'm having trouble processing that. Could you repeat?"
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get AI response using OpenAI
   */
  private async getAIResponse(userMessage: string): Promise<StreamingResponse> {
    return processConversationStreaming(
      userMessage,
      {
        callSid: this.callSid,
        from: this.from,
        to: this.to,
        businessId: this.businessId,
        conversationHistory: this.conversationHistory.slice(0, -1), // Exclude current message
        collectedData: this.collectedData,
        status: "collecting",
        createdAt: this.createdAt,
      },
      this.businessConfig
    );
  }

  /**
   * Send the initial greeting
   */
  private async sendGreeting(): Promise<void> {
    const greeting =
      this.businessConfig?.config?.greeting ||
      `Hello! Thank you for calling ${
        this.businessConfig?.business?.name || "our business"
      }. How can I help you today?`;

    console.log(`[StreamingSession] Sending greeting: "${greeting}"`);

    // Add greeting to history
    this.conversationHistory.push({ role: "assistant", content: greeting });

    await this.speak(greeting);
  }

  /**
   * Speak text using TTS
   */
  private async speak(text: string): Promise<void> {
    if (!text.trim()) return;

    console.log(`[StreamingSession] Speaking: "${text}"`);

    this.isSpeaking = true;
    this.shouldInterrupt = false;
    this.setState("speaking");

    try {
      // Use streaming synthesis for lower latency
      await this.tts.synthesizeStreaming(text);
    } catch (error) {
      console.error(`[StreamingSession] TTS error:`, error);
      this.isSpeaking = false;
      throw error;
    }
  }

  /**
   * Set session state and emit event
   */
  private setState(newState: SessionState): void {
    const oldState = this.state;
    this.state = newState;
    console.log(`[StreamingSession] State: ${oldState} -> ${newState}`);
    this.emit("state_change", { oldState, newState });
  }

  /**
   * Get current session state
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): Array<{
    role: "user" | "assistant";
    content: string;
  }> {
    return [...this.conversationHistory];
  }

  /**
   * Get collected data
   */
  getCollectedData(): CollectedData {
    return { ...this.collectedData };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    console.log(`[StreamingSession] Cleaning up session ${this.callSid}`);

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    await this.stt.close();

    this.audioQueue = [];
    this.removeAllListeners();
  }

  /**
   * Get language from timezone (simple heuristic)
   */
  private getLanguageFromTimezone(timezone?: string): string {
    if (!timezone) return "en-US";

    const tzLower = timezone.toLowerCase();

    if (
      tzLower.includes("europe/madrid") ||
      tzLower.includes("america/mexico")
    ) {
      return "es-MX";
    }
    if (tzLower.includes("europe/paris")) {
      return "fr-FR";
    }
    if (tzLower.includes("europe/berlin")) {
      return "de-DE";
    }
    if (tzLower.includes("asia/tokyo")) {
      return "ja-JP";
    }
    if (tzLower.includes("asia/kolkata")) {
      return "hi-IN";
    }

    return "en-US";
  }
}

/**
 * Store for managing active streaming sessions
 */
class StreamingSessionStore {
  private sessions: Map<string, StreamingSession> = new Map();

  create(config: StreamingSessionConfig): StreamingSession {
    const session = new StreamingSession(config);
    this.sessions.set(config.callSid, session);
    return session;
  }

  get(callSid: string): StreamingSession | undefined {
    return this.sessions.get(callSid);
  }

  getByStreamSid(streamSid: string): StreamingSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.streamSid === streamSid) {
        return session;
      }
    }
    return undefined;
  }

  async delete(callSid: string): Promise<void> {
    const session = this.sessions.get(callSid);
    if (session) {
      await session.cleanup();
      this.sessions.delete(callSid);
    }
  }

  getAll(): StreamingSession[] {
    return Array.from(this.sessions.values());
  }

  size(): number {
    return this.sessions.size;
  }
}

export const streamingSessionStore = new StreamingSessionStore();
