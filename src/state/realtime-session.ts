import { EventEmitter } from "events";
import {
    OpenAIRealtimeSession,
    buildRealtimeInstructions,
} from "../services/openai-realtime";
import { extractDateTime } from "../services/dateParser";
import { BusinessConfigWithDetails } from "../db/types";

export type RealtimeSessionState =
    | "initializing"
    | "greeting"
    | "listening"
    | "processing"
    | "speaking"
    | "completed"
    | "failed";

export interface RealtimeStreamingSessionConfig {
    callSid: string;
    streamSid: string;
    from: string;
    to: string;
    businessId?: string;
    businessConfig?: BusinessConfigWithDetails | null;
}

export interface CollectedBookingData {
    customerName?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    phoneNumber?: string;
}

/**
 * RealtimeStreamingSession manages real-time voice conversations using OpenAI Realtime API
 * This provides a direct speech-to-speech pipeline, eliminating STT/TTS round-trips
 */
export class RealtimeStreamingSession extends EventEmitter {
    // Session identifiers
    public callSid: string;
    public streamSid: string;
    public from: string;
    public to: string;
    public businessId?: string;
    public dbSessionId?: string;

    // State
    private state: RealtimeSessionState = "initializing";
    private collectedData: CollectedBookingData = {};

    // Full conversation transcript for tracking
    private conversationTranscript: Array<{
        role: "user" | "assistant";
        content: string;
    }> = [];

    // Service
    private realtimeSession: OpenAIRealtimeSession;
    private businessConfig: BusinessConfigWithDetails | null;

    // Audio management
    private isSpeaking: boolean = false;
    private isUserSpeaking: boolean = false;

    // Callbacks for sending audio to Twilio
    private sendAudioCallback: ((base64Audio: string) => void) | null = null;
    private clearAudioCallback: (() => void) | null = null;

    // Timing
    private createdAt: Date = new Date();

    // Track if we've sent greeting
    private greetingSent: boolean = false;

    // Buffer for assistant transcript
    private currentAssistantTranscript: string = "";

    constructor(config: RealtimeStreamingSessionConfig) {
        super();

        this.callSid = config.callSid;
        this.streamSid = config.streamSid;
        this.from = config.from;
        this.to = config.to;
        this.businessId = config.businessId;
        this.businessConfig = config.businessConfig || null;

        // Build instructions for the AI
        const instructions = buildRealtimeInstructions(this.businessConfig);

        // Initialize OpenAI Realtime session
        this.realtimeSession = new OpenAIRealtimeSession(
            {
                model: "gpt-4o-realtime-preview-2024-12-17",
                voice: "alloy", // Options: alloy, echo, shimmer
                instructions: instructions,
                temperature: 0.8,
            },
            {
                encoding: "g711_ulaw", // Match Twilio μ-law
                sampleRate: 8000, // Match Twilio 8kHz
            }
        );

        this.setupRealtimeHandlers();

        console.log(`[RealtimeSession] Created for call ${this.callSid}`);
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
     * Start the session - connect to Realtime API and trigger greeting
     */
    async start(): Promise<void> {
        try {
            this.setState("initializing");

            // Connect to OpenAI Realtime API
            await this.realtimeSession.connect();

            // Trigger greeting by sending initial message
            this.setState("greeting");
            await this.sendGreeting();

            this.setState("listening");
        } catch (error) {
            console.error(`[RealtimeSession] Failed to start:`, error);
            this.setState("failed");
            throw error;
        }
    }

    /**
   * Process incoming audio from Twilio
   */
    processAudio(base64Audio: string): void {
        // Buffer audio if not connected yet - will be sent after connection
        if (!this.realtimeSession.isActive()) {
            // Audio will be lost during connection phase, which is OK
            // The greeting will play first anyway
            return;
        }

        // Send audio directly to Realtime API
        this.realtimeSession.sendAudio(base64Audio);
    }

    /**
     * Send feedback to AI (e.g., when booking fails validation)
     * This allows the system to inject context into the conversation
     */
    sendFeedbackToAI(message: string): void {
        console.log(`[RealtimeSession] Sending feedback to AI: ${message}`);

        // Add as assistant message to conversation (system role not supported in transcript)
        this.conversationTranscript.push({
            role: "assistant",
            content: message,
        });

        // Trigger AI to respond with this new context
        this.realtimeSession.createResponse({
            instructions: message,
        });
    }

    /**
     * Set up event handlers for OpenAI Realtime API
     */
    private setupRealtimeHandlers(): void {
        // Connection events
        this.realtimeSession.on("connected", () => {
            console.log("[RealtimeSession] Connected to OpenAI Realtime API");
        });

        this.realtimeSession.on("disconnected", () => {
            console.log("[RealtimeSession] Disconnected from OpenAI Realtime API");
        });

        // Speech detection (user speaking)
        this.realtimeSession.on("speech_started", () => {
            console.log("[RealtimeSession] User started speaking");
            this.isUserSpeaking = true;

            // If AI is currently speaking, interrupt it (barge-in)
            if (this.isSpeaking) {
                this.handleBargeIn();
            }
        });

        this.realtimeSession.on("speech_stopped", () => {
            console.log("[RealtimeSession] User stopped speaking");
            this.isUserSpeaking = false;
        });

        // User transcription
        this.realtimeSession.on("user_transcription", (transcript: string) => {
            console.log(`[RealtimeSession] User said: "${transcript}"`);

            // Add to conversation history
            this.conversationTranscript.push({
                role: "user",
                content: transcript,
            });

            // Extract booking data from conversation
            this.extractBookingData(transcript);
        });

        // Response events
        this.realtimeSession.on("response_started", () => {
            console.log("[RealtimeSession] AI started responding");
            this.setState("processing");
            this.currentAssistantTranscript = "";
        });

        this.realtimeSession.on("assistant_transcript_delta", (delta: string) => {
            this.currentAssistantTranscript += delta;
        });

        this.realtimeSession.on("assistant_transcript", (transcript: string) => {
            console.log(`[RealtimeSession] AI said: "${transcript}"`);

            // Add to conversation history
            this.conversationTranscript.push({
                role: "assistant",
                content: transcript,
            });

            // Check if booking is complete
            this.checkBookingComplete(transcript);
        });

        // Audio output from AI
        this.realtimeSession.on("audio_delta", (audioDelta: string) => {
            if (!this.isSpeaking) {
                this.isSpeaking = true;
                this.setState("speaking");
            }

            // Send audio chunk to Twilio
            if (this.sendAudioCallback) {
                this.sendAudioCallback(audioDelta);
            }
        });

        this.realtimeSession.on("audio_done", () => {
            console.log("[RealtimeSession] AI finished speaking");
            this.isSpeaking = false;
            this.setState("listening");
        });

        this.realtimeSession.on("response_done", (response: any) => {
            console.log("[RealtimeSession] Response complete");
        });

        this.realtimeSession.on("response_cancelled", () => {
            console.log("[RealtimeSession] Response cancelled (interrupted)");
            this.isSpeaking = false;
            this.setState("listening");
        });

        // Errors
        this.realtimeSession.on("error", (error) => {
            console.error(`[RealtimeSession] Error:`, error);
            this.emit("error", error);
        });
    }

    /**
     * Handle barge-in (caller interrupts while AI is speaking)
     */
    private handleBargeIn(): void {
        console.log(`[RealtimeSession] Barge-in detected! Interrupting AI.`);

        // Cancel current AI response
        this.realtimeSession.cancelResponse();

        this.isSpeaking = false;

        // Clear any pending audio in Twilio
        if (this.clearAudioCallback) {
            this.clearAudioCallback();
        }

        this.emit("barge_in");
        this.setState("listening");
    }

    /**
     * Send the initial greeting
     */
    private async sendGreeting(): Promise<void> {
        if (this.greetingSent) return;

        const greeting =
            this.businessConfig?.config?.greeting ||
            `Hello! Thank you for calling ${this.businessConfig?.business?.name || "our business"
            }. How can I help you today?`;

        console.log(`[RealtimeSession] Triggering greeting: "${greeting}"`);

        // Trigger AI to speak the greeting immediately
        // Use createResponse with instructions to make the AI say the greeting
        this.realtimeSession.createResponse({
            instructions: `Start the conversation by saying: "${greeting}"`
        });

        this.greetingSent = true;

        // Note: We'll add to conversation history when we receive the transcript
    }

    /**
     * Extract booking data from user messages
     * Uses improved date/time parsing to handle relative dates like "tomorrow"
     */
    private extractBookingData(userMessage: string): void {
        // ONLY extract name from explicit "my name is X" statements
        // Do NOT extract from "I'm going to...", "I'm looking for...", etc.
        if (!this.collectedData.customerName) {
            // Very strict pattern - only "my name is" or "name's"
            const nameMatch = userMessage.match(/(?:my name is|name's)\s+([A-Z][a-z]+)/i);
            if (nameMatch) {
                const extractedName = nameMatch[1].trim();

                // Extended filter list for false positives
                const commonWords = [
                    'can', 'will', 'could', 'would', 'should', 'may', 'might',
                    'hello', 'hi', 'yes', 'no', 'going', 'looking', 'trying',
                    'wanting', 'hoping', 'calling', 'booking', 'scheduling'
                ];

                if (!commonWords.includes(extractedName.toLowerCase()) && extractedName.length > 2) {
                    this.collectedData.customerName = extractedName;
                    console.log(
                        `[RealtimeSession] Extracted name from user: ${this.collectedData.customerName}`
                    );
                }
            }
        }

        // Use improved date/time extraction
        const extracted = extractDateTime(userMessage);

        if (extracted.date && !this.collectedData.appointmentDate) {
            this.collectedData.appointmentDate = extracted.date;
            console.log(
                `[RealtimeSession] Extracted date: ${this.collectedData.appointmentDate}`
            );
        }

        if (extracted.time && !this.collectedData.appointmentTime) {
            this.collectedData.appointmentTime = extracted.time;
            console.log(
                `[RealtimeSession] Extracted time: ${this.collectedData.appointmentTime}`
            );
        }

        // Always use the caller's phone number
        this.collectedData.phoneNumber = this.from;
    }

    /**
   * Check if booking is complete based on AI response
   */
    private checkBookingComplete(aiResponse: string): void {
        const lowerResponse = aiResponse.toLowerCase();

        // IMPORTANT: Also extract data from AI's confirmation
        // Sometimes STT mishears user ("4 PM" → "for BM") but AI understands from context
        // When AI confirms "you're booked for Tuesday at 4 PM", we should extract that
        const extracted = extractDateTime(aiResponse);
        if (extracted.date && !this.collectedData.appointmentDate) {
            this.collectedData.appointmentDate = extracted.date;
            console.log(`[RealtimeSession] Extracted date from AI confirmation: ${this.collectedData.appointmentDate}`);
        }
        if (extracted.time && !this.collectedData.appointmentTime) {
            this.collectedData.appointmentTime = extracted.time;
            console.log(`[RealtimeSession] Extracted time from AI confirmation: ${this.collectedData.appointmentTime}`);
        }

        // Extract name from AI's confirmation (when AI says "So, [Name], you'd like...")
        // This catches names that AI understood but STT might have missed
        if (!this.collectedData.customerName) {
            const aiNamePatterns = [
                /(?:so|great|perfect|thanks|thank you),?\s+([A-Z][a-z]+)/i,
                /(?:see you then),?\s+([A-Z][a-z]+)/i,
                /(?:got you down|you're booked),?\s+(?:for\s+)?(?:[^,]+,)?\s*([A-Z][a-z]+)/i,
            ];

            for (const pattern of aiNamePatterns) {
                const match = aiResponse.match(pattern);
                if (match) {
                    const extractedName = match[1].trim();

                    // Filter common words that might match
                    const skipWords = ['for', 'on', 'at', 'the', 'this', 'that', 'we', 'you', 'i'];
                    if (!skipWords.includes(extractedName.toLowerCase()) && extractedName.length > 2) {
                        this.collectedData.customerName = extractedName;
                        console.log(`[RealtimeSession] Extracted name from AI confirmation: ${this.collectedData.customerName}`);
                        break;
                    }
                }
            }
        }

        // Check if all data is collected
        const hasAllData =
            this.collectedData.customerName &&
            this.collectedData.appointmentDate &&
            this.collectedData.appointmentTime;

        console.log(`[RealtimeSession] Checking booking completion:`);
        console.log(`[RealtimeSession] - Has name: ${!!this.collectedData.customerName}`);
        console.log(`[RealtimeSession] - Has date: ${!!this.collectedData.appointmentDate}`);
        console.log(`[RealtimeSession] - Has time: ${!!this.collectedData.appointmentTime}`);
        console.log(`[RealtimeSession] - Collected data:`, this.collectedData);

        // Check if AI is confirming the booking
        const confirmationPhrases = [
            "you're all set",
            "i've got you down",
            "see you then",
            "you're booked",
            "appointment confirmed",
            "have a great day",
        ];

        const isConfirming = confirmationPhrases.some((phrase) =>
            lowerResponse.includes(phrase)
        );

        console.log(`[RealtimeSession] - Is confirming: ${isConfirming}`);
        console.log(`[RealtimeSession] - AI response: "${aiResponse}"`);

        if (hasAllData && isConfirming) {
            console.log("[RealtimeSession] Booking complete!");

            this.emit("booking_complete", {
                ...this.collectedData,
                response: aiResponse,
            });

            // Mark as completed after a delay (to let final message play)
            setTimeout(() => {
                this.setState("completed");
                this.emit("session_complete", this.collectedData);
            }, 3000);
        } else {
            console.log(`[RealtimeSession] Booking NOT complete - hasAllData: ${hasAllData}, isConfirming: ${isConfirming}`);
        }
    }

    /**
     * Set session state and emit event
     */
    private setState(newState: RealtimeSessionState): void {
        const oldState = this.state;
        this.state = newState;
        console.log(`[RealtimeSession] State: ${oldState} -> ${newState}`);
        this.emit("state_change", { oldState, newState });
    }

    /**
     * Get current session state
     */
    getState(): RealtimeSessionState {
        return this.state;
    }

    /**
     * Get conversation history
     */
    getConversationHistory(): Array<{
        role: "user" | "assistant";
        content: string;
    }> {
        return [...this.conversationTranscript];
    }

    /**
     * Get collected data
     */
    getCollectedData(): CollectedBookingData {
        return { ...this.collectedData };
    }

    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        console.log(`[RealtimeSession] Cleaning up session ${this.callSid}`);

        await this.realtimeSession.close();
        this.removeAllListeners();
    }
}

/**
 * Store for managing active realtime sessions
 */
class RealtimeSessionStore {
    private sessions: Map<string, RealtimeStreamingSession> = new Map();

    create(config: RealtimeStreamingSessionConfig): RealtimeStreamingSession {
        const session = new RealtimeStreamingSession(config);
        this.sessions.set(config.callSid, session);
        return session;
    }

    get(callSid: string): RealtimeStreamingSession | undefined {
        return this.sessions.get(callSid);
    }

    getByStreamSid(streamSid: string): RealtimeStreamingSession | undefined {
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

    getAll(): RealtimeStreamingSession[] {
        return Array.from(this.sessions.values());
    }

    size(): number {
        return this.sessions.size;
    }
}

export const realtimeSessionStore = new RealtimeSessionStore();
