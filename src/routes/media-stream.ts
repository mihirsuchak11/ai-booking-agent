import WebSocket, { WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import {
  streamingSessionStore,
  StreamingSession,
} from "../state/streaming-session";
import {
  resolveBusinessByPhoneNumber,
  loadBusinessConfig,
} from "../db/business";
import { createCallSession, updateCallSession } from "../db/sessions";
import { checkDbAvailability, createDbBooking } from "../db/bookings";
import { parseDateTime } from "../services/calendar";

interface TwilioMediaMessage {
  event: string;
  sequenceNumber?: string;
  streamSid?: string;
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string; // Base64 encopded audio
  };
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    customParameters: Record<string, string>;
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
  mark?: {
    name: string;
  };
}

/**
 * Set up WebSocket server for Twilio Media Streams
 */
export function setupMediaStreamWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: "/media-stream",
  });

  console.log("[MediaStream] WebSocket server initialized on /media-stream");

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    console.log("[MediaStream] New WebSocket connection");

    let session: StreamingSession | null = null;
    let streamSid: string | null = null;
    let callSid: string | null = null;
    let markCounter = 0;

    // Handle incoming messages from Twilio
    ws.on("message", async (data: WebSocket.Data) => {
      try {
        const message: TwilioMediaMessage = JSON.parse(data.toString());

        switch (message.event) {
          case "connected":
            console.log("[MediaStream] Twilio connected");
            break;

          case "start":
            await handleStart(message, ws);
            break;

          case "media":
            handleMedia(message);
            break;

          case "stop":
            await handleStop(message);
            break;

          case "mark":
            handleMark(message);
            break;

          default:
            console.log(`[MediaStream] Unknown event: ${message.event}`);
        }
      } catch (error) {
        console.error("[MediaStream] Error processing message:", error);
      }
    });

    // Handle WebSocket close
    ws.on("close", async (code: number, reason: Buffer) => {
      console.log(
        `[MediaStream] WebSocket closed: ${code} - ${reason.toString()}`
      );

      if (callSid) {
        await streamingSessionStore.delete(callSid);
      }
    });

    // Handle WebSocket errors
    ws.on("error", (error: Error) => {
      console.error("[MediaStream] WebSocket error:", error);
    });

    /**
     * Handle stream start event
     */
    async function handleStart(
      message: TwilioMediaMessage,
      ws: WebSocket
    ): Promise<void> {
      if (!message.start) return;

      streamSid = message.start.streamSid;
      callSid = message.start.callSid;
      const customParams = message.start.customParameters || {};

      console.log(`[MediaStream] Stream started: ${streamSid}`);
      console.log(`[MediaStream] Call SID: ${callSid}`);
      console.log(`[MediaStream] Custom params:`, customParams);

      const from = customParams.from || "";
      const to = customParams.to || "";
      const businessId = customParams.businessId || undefined;

      // Load business config
      let businessConfig = null;
      if (businessId) {
        businessConfig = await loadBusinessConfig(businessId);
      }

      // Create streaming session
      session = streamingSessionStore.create({
        callSid,
        streamSid,
        from,
        to,
        businessId,
        businessConfig,
      });

      // Set up audio callbacks
      session.setAudioCallbacks(
        // Send audio to Twilio
        (base64Audio: string) => {
          sendAudioToTwilio(ws, streamSid!, base64Audio);
        },
        // Clear audio (for barge-in)
        () => {
          clearTwilioAudio(ws, streamSid!);
        }
      );

      // Set up session event handlers
      setupSessionHandlers(session, ws);

      // Create DB call session
      if (businessId) {
        const dbSessionId = await createCallSession(
          businessId,
          callSid,
          from,
          to
        );
        if (dbSessionId) {
          session.dbSessionId = dbSessionId;
        }
      }

      // Start the session (sends greeting)
      try {
        await session.start();
      } catch (error) {
        console.error("[MediaStream] Failed to start session:", error);
      }
    }

    /**
     * Handle incoming media (audio) from Twilio
     */
    function handleMedia(message: TwilioMediaMessage): void {
      if (!message.media || !session) return;

      // Only process inbound audio (from caller)
      if (message.media.track === "inbound") {
        session.processAudio(message.media.payload);
      }
    }

    /**
     * Handle stream stop event
     */
    async function handleStop(message: TwilioMediaMessage): Promise<void> {
      console.log(`[MediaStream] Stream stopped for call: ${callSid}`);

      if (session && callSid) {
        const state = session.getState();
        const collectedData = session.getCollectedData();

        // Update DB session
        if (session.dbSessionId) {
          await updateCallSession(callSid, {
            status: state === "completed" ? "completed" : "failed",
            ended_at: new Date().toISOString(),
            summary:
              state === "completed" && collectedData.customerName
                ? `Booked appointment for ${collectedData.customerName} on ${collectedData.appointmentDate} at ${collectedData.appointmentTime}`
                : "Call ended without booking",
          });
        }

        await streamingSessionStore.delete(callSid);
      }
    }

    /**
     * Handle mark events (audio playback markers)
     */
    function handleMark(message: TwilioMediaMessage): void {
      if (!message.mark) return;
      console.log(`[MediaStream] Mark received: ${message.mark.name}`);
    }

    /**
     * Set up event handlers for the streaming session
     */
    function setupSessionHandlers(
      session: StreamingSession,
      ws: WebSocket
    ): void {
      // Handle booking completion
      session.on("booking_complete", async (data) => {
        console.log("[MediaStream] Booking complete:", data);

        if (!session.businessId) {
          console.error("[MediaStream] No business ID for booking");
          return;
        }

        // Parse date/time and create booking
        const dateTime = parseDateTime(
          data.appointmentDate,
          data.appointmentTime
        );
        if (!dateTime) {
          console.error("[MediaStream] Invalid date/time for booking");
          return;
        }

        try {
          // Check availability
          const businessConfig = await loadBusinessConfig(session.businessId);
          const availability = await checkDbAvailability(
            session.businessId,
            dateTime.start,
            dateTime.end,
            businessConfig?.config || null
          );

          if (availability.available) {
            // Create the booking
            const bookingId = await createDbBooking(
              session.businessId,
              session.dbSessionId || null,
              data.customerName,
              data.phoneNumber,
              dateTime.start,
              dateTime.end
            );

            if (bookingId) {
              console.log(`[MediaStream] Booking created: ${bookingId}`);
            }
          } else {
            console.log(
              `[MediaStream] Slot not available: ${availability.reason}`
            );
          }
        } catch (error) {
          console.error("[MediaStream] Error creating booking:", error);
        }
      });

      // Handle session completion
      session.on("session_complete", (data) => {
        console.log("[MediaStream] Session complete:", data);
      });

      // Handle state changes
      session.on("state_change", ({ oldState, newState }) => {
        console.log(`[MediaStream] Session state: ${oldState} -> ${newState}`);
      });

      // Handle barge-in
      session.on("barge_in", () => {
        console.log("[MediaStream] Barge-in detected, clearing audio");
        if (streamSid) {
          clearTwilioAudio(ws, streamSid);
        }
      });

      // Handle errors
      session.on("error", (error) => {
        console.error("[MediaStream] Session error:", error);
      });
    }

    /**
     * Send audio to Twilio
     */
    function sendAudioToTwilio(
      ws: WebSocket,
      streamSid: string,
      base64Audio: string
    ): void {
      if (ws.readyState !== WebSocket.OPEN) return;

      const mediaMessage = {
        event: "media",
        streamSid,
        media: {
          payload: base64Audio,
        },
      };

      ws.send(JSON.stringify(mediaMessage));
    }

    /**
     * Clear audio playback in Twilio (for barge-in)
     */
    function clearTwilioAudio(ws: WebSocket, streamSid: string): void {
      if (ws.readyState !== WebSocket.OPEN) return;

      const clearMessage = {
        event: "clear",
        streamSid,
      };

      ws.send(JSON.stringify(clearMessage));
    }

    /**
     * Send a mark to track audio playback
     */
    function sendMark(ws: WebSocket, streamSid: string, name: string): void {
      if (ws.readyState !== WebSocket.OPEN) return;

      const markMessage = {
        event: "mark",
        streamSid,
        mark: { name },
      };

      ws.send(JSON.stringify(markMessage));
    }
  });

  return wss;
}

/**
 * Get the WebSocket URL for Media Streams
 */
export function getMediaStreamUrl(serviceUrl: string): string {
  // Convert HTTP(S) URL to WebSocket URL
  const wsUrl = serviceUrl
    .replace("https://", "wss://")
    .replace("http://", "ws://");

  return `${wsUrl}/media-stream`;
}
