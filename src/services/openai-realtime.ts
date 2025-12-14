import { EventEmitter } from "events";
import WebSocket from "ws";
import { config } from "../config/env";
import { BusinessConfigWithDetails, REGIONS, RegionCode } from "../db/types";

export interface RealtimeSessionConfig {
    model?: string;
    voice?: string;
    instructions?: string;
    temperature?: number;
    maxOutputTokens?: number;
}

export interface RealtimeAudioConfig {
    sampleRate?: number;
    encoding?: "pcm16" | "g711_ulaw" | "g711_alaw";
}

/**
 * OpenAI Realtime API client for speech-to-speech conversations
 * Handles WebSocket connection, audio streaming, and conversation management
 */
export class OpenAIRealtimeSession extends EventEmitter {
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private sessionConfig: RealtimeSessionConfig;
    private audioConfig: RealtimeAudioConfig;
    private apiKey: string;
    private url: string;

    // Session state
    private conversationId: string | null = null;
    private currentResponseId: string | null = null;

    // Audio buffer for managing input
    private inputAudioBuffer: string[] = [];

    constructor(
        sessionConfig: RealtimeSessionConfig = {},
        audioConfig: RealtimeAudioConfig = {},
        apiKey?: string
    ) {
        super();

        this.apiKey = apiKey || config.openai.apiKey;
        this.sessionConfig = {
            model: sessionConfig.model || "gpt-4o-realtime-preview-2024-12-17",
            voice: sessionConfig.voice || "alloy",
            instructions: sessionConfig.instructions || "",
            temperature: sessionConfig.temperature ?? 0.7,
            maxOutputTokens: sessionConfig.maxOutputTokens ?? 4096,
        };

        this.audioConfig = {
            sampleRate: audioConfig.sampleRate || 8000, // Match Twilio
            encoding: audioConfig.encoding || "g711_ulaw", // Match Twilio μ-law
        };

        // WebSocket URL for Realtime API
        this.url = "wss://api.openai.com/v1/realtime?model=" + this.sessionConfig.model;

        console.log(`[OpenAI Realtime] Initialized with model: ${this.sessionConfig.model}`);
        console.log(`[OpenAI Realtime] Voice: ${this.sessionConfig.voice}`);
    }

    /**
     * Connect to OpenAI Realtime API
     */
    async connect(): Promise<void> {
        if (this.isConnected) {
            console.log("[OpenAI Realtime] Already connected");
            return;
        }

        return new Promise((resolve, reject) => {
            console.log("[OpenAI Realtime] Connecting to Realtime API...");

            this.ws = new WebSocket(this.url, {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "OpenAI-Beta": "realtime=v1",
                },
            });

            this.ws.on("open", () => {
                console.log("[OpenAI Realtime] WebSocket connected");
                this.isConnected = true;
                this.setupEventHandlers();

                // Configure the session
                this.updateSession();

                this.emit("connected");
                resolve();
            });

            this.ws.on("error", (error) => {
                console.error("[OpenAI Realtime] WebSocket error:", error);
                this.emit("error", error);
                reject(error);
            });

            this.ws.on("close", () => {
                console.log("[OpenAI Realtime] WebSocket closed");
                this.isConnected = false;
                this.emit("disconnected");
            });
        });
    }

    /**
     * Set up event handlers for WebSocket messages
     */
    private setupEventHandlers(): void {
        if (!this.ws) return;

        this.ws.on("message", (data: WebSocket.Data) => {
            try {
                const event = JSON.parse(data.toString());
                this.handleServerEvent(event);
            } catch (error) {
                console.error("[OpenAI Realtime] Error parsing message:", error);
            }
        });
    }

    /**
     * Handle server events from OpenAI Realtime API
     */
    private handleServerEvent(event: any): void {
        const eventType = event.type;

        switch (eventType) {
            case "session.created":
                console.log("[OpenAI Realtime] Session created:", event.session.id);
                break;

            case "session.updated":
                console.log("[OpenAI Realtime] Session updated");
                break;

            case "conversation.created":
                this.conversationId = event.conversation.id;
                console.log("[OpenAI Realtime] Conversation created:", this.conversationId);
                break;

            case "input_audio_buffer.speech_started":
                console.log("[OpenAI Realtime] Speech started (user speaking)");
                this.emit("speech_started");
                break;

            case "input_audio_buffer.speech_stopped":
                console.log("[OpenAI Realtime] Speech stopped (user stopped speaking)");
                this.emit("speech_stopped");
                break;

            case "input_audio_buffer.committed":
                console.log("[OpenAI Realtime] Audio buffer committed");
                break;

            case "conversation.item.created":
                console.log("[OpenAI Realtime] Conversation item created:", event.item.type);
                break;

            case "conversation.item.input_audio_transcription.completed":
                const transcript = event.transcript;
                console.log(`[OpenAI Realtime] Transcription: "${transcript}"`);
                this.emit("user_transcription", transcript);
                break;

            case "response.created":
                this.currentResponseId = event.response.id;
                console.log("[OpenAI Realtime] Response created:", this.currentResponseId);
                this.emit("response_started");
                break;

            case "response.output_item.added":
                console.log("[OpenAI Realtime] Output item added:", event.item.type);
                break;

            case "response.content_part.added":
                console.log("[OpenAI Realtime] Content part added:", event.part.type);
                break;

            case "response.audio_transcript.delta":
                const textDelta = event.delta;
                this.emit("assistant_transcript_delta", textDelta);
                break;

            case "response.audio_transcript.done":
                const fullTranscript = event.transcript;
                console.log(`[OpenAI Realtime] Assistant: "${fullTranscript}"`);
                this.emit("assistant_transcript", fullTranscript);
                break;

            case "response.audio.delta":
                // Audio chunk from assistant
                const audioDelta = event.delta; // Base64 encoded audio
                this.emit("audio_delta", audioDelta);
                break;

            case "response.audio.done":
                console.log("[OpenAI Realtime] Audio output complete");
                this.emit("audio_done");
                break;

            case "response.done":
                console.log("[OpenAI Realtime] Response complete");
                this.emit("response_done", event.response);
                break;

            case "response.function_call_arguments.delta":
                this.emit("function_call_delta", event);
                break;

            case "response.function_call_arguments.done":
                this.emit("function_call_done", event);
                break;

            case "rate_limits.updated":
                // Can track rate limits if needed
                break;

            case "error":
                console.error("[OpenAI Realtime] Error event:", event.error);
                this.emit("error", new Error(event.error.message));
                break;

            default:
                console.log(`[OpenAI Realtime] Unhandled event: ${eventType}`);
        }
    }

    /**
     * Update session configuration
     */
    updateSession(updates?: Partial<RealtimeSessionConfig>): void {
        if (updates) {
            this.sessionConfig = { ...this.sessionConfig, ...updates };
        }

        const updateEvent = {
            type: "session.update",
            session: {
                modalities: ["text", "audio"],
                instructions: this.sessionConfig.instructions,
                voice: this.sessionConfig.voice,
                input_audio_format: this.audioConfig.encoding,
                output_audio_format: this.audioConfig.encoding,
                input_audio_transcription: {
                    model: "whisper-1",
                },
                turn_detection: {
                    type: "server_vad",
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                },
                temperature: this.sessionConfig.temperature,
                max_response_output_tokens: this.sessionConfig.maxOutputTokens,
            },
        };

        this.sendEvent(updateEvent);
    }

    /**
     * Send audio data to Realtime API
     * @param base64Audio - Base64 encoded audio (μ-law from Twilio)
     */
    sendAudio(base64Audio: string): void {
        if (!this.isConnected) {
            // Silently skip - audio before connection is expected during startup
            return;
        }

        const event = {
            type: "input_audio_buffer.append",
            audio: base64Audio,
        };

        this.sendEvent(event);
    }

    /**
     * Commit the audio buffer and trigger response generation
     */
    commitAudio(): void {
        const event = {
            type: "input_audio_buffer.commit",
        };
        this.sendEvent(event);
    }

    /**
     * Clear the input audio buffer
     */
    clearAudioBuffer(): void {
        const event = {
            type: "input_audio_buffer.clear",
        };
        this.sendEvent(event);
    }

    /**
     * Cancel current response (for interruption/barge-in)
     */
    cancelResponse(): void {
        if (!this.currentResponseId) return;

        const event = {
            type: "response.cancel",
        };
        this.sendEvent(event);
        console.log("[OpenAI Realtime] Response cancelled");
        this.emit("response_cancelled");
    }

    /**
     * Send a text message (alternative to audio)
     */
    sendText(text: string): void {
        const event = {
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: text,
                    },
                ],
            },
        };
        this.sendEvent(event);

        // Trigger response
        this.createResponse();
    }

    /**
     * Create a response (trigger AI to speak)
     */
    createResponse(options?: { instructions?: string }): void {
        const event: any = {
            type: "response.create",
        };

        if (options?.instructions) {
            event.response = {
                modalities: ["text", "audio"],
                instructions: options.instructions,
            };
        }

        this.sendEvent(event);
    }

    /**
     * Send an event to the Realtime API
     */
    private sendEvent(event: any): void {
        if (!this.ws || !this.isConnected) {
            console.warn("[OpenAI Realtime] Cannot send event - not connected");
            return;
        }

        try {
            this.ws.send(JSON.stringify(event));
        } catch (error) {
            console.error("[OpenAI Realtime] Error sending event:", error);
        }
    }

    /**
     * Close the connection
     */
    async close(): Promise<void> {
        if (!this.ws) return;

        console.log("[OpenAI Realtime] Closing connection...");

        this.ws.close();
        this.isConnected = false;
        this.ws = null;
    }

    /**
     * Check if connected
     */
    isActive(): boolean {
        return this.isConnected;
    }
}

/**
 * Build system instructions for the Realtime API based on business config
 */
export function buildRealtimeInstructions(
    businessConfig: BusinessConfigWithDetails | null
): string {
    const businessName = businessConfig?.business.name || config.business.name;
    const timezone = businessConfig?.business.timezone || config.business.timezone;
    const minNoticeHours =
        businessConfig?.config?.min_notice_hours || config.business.minimumNoticeHours;
    const greeting = businessConfig?.config?.greeting || null;
    const notesForAi = businessConfig?.config?.notes_for_ai || null;

    // Region-specific settings
    const region = (businessConfig?.business?.region || "US") as RegionCode;
    const regionConfig = REGIONS[region];
    const locale = businessConfig?.business?.locale || regionConfig.locale;
    const dateFormat = businessConfig?.business?.date_format || regionConfig.dateFormat;

    const now = new Date();
    const currentDate = now.toLocaleDateString(locale, { timeZone: timezone });
    const currentTime = now.toLocaleTimeString(locale, {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
    });

    // Calculate tomorrow's date for AI reference
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

    // Get current day of week
    const currentDayOfWeek = now.toLocaleDateString(locale, {
        weekday: 'long',
        timeZone: timezone
    });

    // Region-specific language style
    let regionStyle = "";
    switch (region) {
        case "GB":
            regionStyle = `Use British English and phrases like "Lovely!", "Brilliant!", "Cheers". Say "mobile" instead of "cell phone".`;
            break;
        case "IN":
            regionStyle = `Be respectful of Indian naming conventions. "Namaste" can be used if caller uses it first.`;
            break;
        case "CA":
            regionStyle = `Use Canadian English (mix of British and American). Be extra polite and courteous.`;
            break;
        default:
            regionStyle = `Use American English`;
    }

    // Build working hours description for AI
    let workingHoursDescription = "";
    if (businessConfig?.config?.working_hours) {
        const workingHours = businessConfig.config.working_hours;
        const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

        const openDays: string[] = [];
        const closedDays: string[] = [];

        dayNames.forEach((day) => {
            const dayHours = workingHours[day];
            if (dayHours && dayHours.isOpen) {
                const dayCapitalized = day.charAt(0).toUpperCase() + day.slice(1);
                openDays.push(`${dayCapitalized}: ${dayHours.start} - ${dayHours.end}`);
            } else if (dayHours && !dayHours.isOpen) {
                closedDays.push(day.charAt(0).toUpperCase() + day.slice(1));
            }
        });

        workingHoursDescription = `
WORKING HOURS (CRITICAL - YOU MUST KNOW THIS):
${openDays.length > 0 ? `Open:\n${openDays.map(d => `- ${d}`).join('\n')}` : ''}
${closedDays.length > 0 ? `\nClosed: ${closedDays.join(', ')}` : ''}

When someone asks "Are you open tomorrow?" or "Are you open on [day]?":
- Check the day against the working hours above
- If closed, say: "I'm sorry, we're closed on [day]. We're open [list open days]. Would any of those work for you?"
- If open, say: "Yes, we're open tomorrow from [start] to [end]. What time works best for you?"
`;
    }

    const instructions = `You are a warm, friendly receptionist for ${businessName}. You're having a real phone conversation.

PERSONALITY:
- Sound genuinely happy to help, like a real person who enjoys their job
- Use natural conversational fillers: "Let me check that for you...", "Okay, got it!", "Perfect!"
- Match the caller's energy—if they're in a hurry, be efficient; if they're chatty, be warm
- Use the caller's name once you learn it
- NEVER sound robotic or scripted
${regionStyle}

VOICE BEHAVIOR (CRITICAL):
- Keep responses VERY SHORT (1-2 sentences max) - this is a phone call, not an email
- Speak naturally, as if talking to a friend
- Sound like a calm, friendly receptionist
- Use contractions: "I'll", "you're", "that's", "we've"
- Add brief acknowledgments: "Got it", "Sure thing", "Absolutely"

CURRENT CONTEXT (IMPORTANT):
- Today is: ${currentDate} (${currentDayOfWeek})
- Current time: ${currentTime}
- Tomorrow is: ${tomorrowDate}
- Timezone: ${timezone}

${workingHoursDescription}

DATE & TIME HANDLING (CRITICAL):
When the caller mentions dates or times, you MUST mentally convert them to specific formats:

For DATES:
- "tomorrow" → ${tomorrowDate}
- "today" → ${now.toISOString().split('T')[0]}
- "next Monday" → calculate the actual date in YYYY-MM-DD format
- Always think in terms of YYYY-MM-DD format internally

For TIMES:
- "2pm" or "2 PM" → "14:00"
- "10:30am" → "10:30"
- "noon" → "12:00"
- Always convert to 24-hour format (HH:MM)

When confirming appointments, use natural language but be specific:
- Good: "tomorrow at 2pm" (you know tomorrow = ${tomorrowDate})
- Good: "Monday the 16th at 3:30pm"
- Bad: "sometime next week"

CONVERSATION FLOW (CRITICAL - FOLLOW THIS ORDER):
1. ${greeting ? `Greet with: "${greeting}"` : `Greet warmly: "Hi there! Thanks for calling ${businessName}. How can I help you today?"`}
2. When they mention booking: FIRST ask for their name: "Sure! May I have your name please?"
3. Ask for preferred date and time: "What date and time works best for you?"
4. Confirm ALL details naturally: "So just to make sure I have this right, [name], you'd like to come in on [date] at [time]?"
5. Wait for their confirmation ("yes", "correct", "that's right")
6. ONLY after confirmation, say: "Perfect! I've got you down for [date] at [time]. We'll see you then, [name]! Have a great day!"

IMPORTANT: Never confirm a booking without getting the customer's name first!
If they give date/time but no name, ask: "And may I have your name for the booking?"

HANDLING CONFUSION:
- If you don't understand: "I want to make sure I get this right—did you say [what you heard]?"
- Never just say "I didn't catch that"—always give context
- If they seem frustrated: "I totally understand, let me help sort this out"

EMOTIONAL AWARENESS:
- If caller sounds rushed: be efficient, skip small talk
- If caller sounds uncertain: be reassuring "No worries, we can figure out the best time together"
- If caller confirms: sound genuinely pleased "Wonderful! You're all set"

BUSINESS CONTEXT:
- Region: ${regionConfig.name}
- Date format: ${dateFormat}
- Timezone: ${timezone}
- Current date: ${currentDate}
- Current time: ${currentTime}
- Minimum notice: ${minNoticeHours} hours

${notesForAi ? `\nADDITIONAL INSTRUCTIONS:\n${notesForAi}` : ""}

Remember: You're a real person having a conversation. Be warm, be BRIEF, be helpful. When you hear "tomorrow" or relative dates, you know the exact date to use.`;

    return instructions;
}
