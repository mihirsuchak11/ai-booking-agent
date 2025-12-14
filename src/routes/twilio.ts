import express, { Request, Response } from "express";
import twilio from "twilio";
import { config } from "../config/env";
import { sessionStore, CallSession } from "../state/sessions";
import { streamingSessionStore } from "../state/streaming-session";
import { processConversation } from "../services/openai";
import { parseDateTime } from "../services/calendar";
import {
  resolveBusinessByPhoneNumber,
  loadBusinessConfig,
} from "../db/business";
import { createCallSession, updateCallSession } from "../db/sessions";
import { checkDbAvailability, createDbBooking } from "../db/bookings";
import { getMediaStreamUrl } from "./media-stream";

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Generate Deepgram TTS audio URL for Twilio to play
 */
function getDeepgramAudioUrl(text: string, voice?: string): string {
  const params = new URLSearchParams({ text });
  if (voice) {
    params.append("voice", voice);
  }
  return `${config.serviceUrl}/audio/tts?${params.toString()}`;
}

/**
 * Play text using Deepgram TTS (replaces twiml.say)
 */
function playDeepgramTTS(
  twiml: twilio.twiml.VoiceResponse,
  text: string,
  voice?: string
): void {
  const audioUrl = getDeepgramAudioUrl(text, voice);
  twiml.play(audioUrl);
}

// Twilio webhook for incoming calls
router.post("/voice/incoming", async (req: Request, res: Response) => {
  const { CallSid, From, To } = req.body;

  console.log(`[INCOMING] Call: ${CallSid} from ${From} to ${To}`);
  console.log(`[INCOMING] Streaming mode: ${config.streamingMode}`);
  console.log(
    `[INCOMING] Environment: ${process.env.VERCEL === "1" ? "Vercel (serverless)" : "Local/Other"
    }`
  );

  res.set({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  // Resolve business from phone number
  const businessId = await resolveBusinessByPhoneNumber(To);
  if (!businessId) {
    console.error(`[INCOMING] No business found for phone number: ${To}`);
    const twiml = new VoiceResponse();
    playDeepgramTTS(
      twiml,
      "I'm sorry, this number is not configured. Please contact support."
    );
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  const twiml = new VoiceResponse();

  // Use streaming mode for human-like voice experience
  if (config.streamingMode) {
    console.log(`[INCOMING] 🎙️ Using Media Streams for real-time voice`);

    // Connect to Media Streams WebSocket
    const connect = twiml.connect();
    const mediaStreamUrl = getMediaStreamUrl(config.serviceUrl);

    console.log(`[INCOMING] Media Stream URL: ${mediaStreamUrl}`);

    // Create stream with all parameters
    const stream = connect.stream({
      url: mediaStreamUrl,
    });

    // Pass custom parameters to the WebSocket handler
    stream.parameter({ name: "from", value: From });
    stream.parameter({ name: "to", value: To });
    stream.parameter({ name: "businessId", value: businessId });
    stream.parameter({ name: "callSid", value: CallSid });

    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  // Fallback: Use traditional gather/say flow
  console.log(`[INCOMING] Using traditional Gather/Say flow`);

  // Create in-memory session
  let session = sessionStore.getSession(CallSid);
  if (!session) {
    session = sessionStore.createSession(CallSid, From, To);
    session.businessId = businessId;
    console.log(
      `[INCOMING] Created new session for ${CallSid}, business: ${businessId}`
    );
  }

  // Create DB call session
  const dbSessionId = await createCallSession(businessId, CallSid, From, To);
  if (dbSessionId) {
    session.dbSessionId = dbSessionId;
    sessionStore.updateSession(CallSid, session);
  }

  // Redirect to gather - AI will handle greeting
  twiml.redirect(
    { method: "POST" },
    `${config.serviceUrl}/twilio/voice/gather`
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// Twilio webhook for speech input
router.post("/voice/gather", async (req: Request, res: Response) => {
  const { CallSid, SpeechResult, From } = req.body;

  const tStart = Date.now();

  res.set({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  const session = sessionStore.getSession(CallSid);
  if (!session) {
    const twiml = new VoiceResponse();
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  const userMessage = SpeechResult || "";

  // Load business config for AI
  let businessConfig = null;
  if (session.businessId) {
    businessConfig = await loadBusinessConfig(session.businessId);
  }

  // Handle empty speech - check if this is first call (greeting) or retry
  if (!userMessage || userMessage.trim().length === 0) {
    const isFirstCall = session.conversationHistory.length === 0;

    if (isFirstCall) {
      // First call with no speech after greeting - gently reprompt
      console.log(`[GATHER] First call - no speech, reprompting`);
      const twiml = new VoiceResponse();
      playDeepgramTTS(
        twiml,
        "I didn't hear anything. How can I help you today?"
      );

      twiml.gather({
        input: ["speech"],
        speechTimeout: "auto",
        action: `${config.serviceUrl}/twilio/voice/gather`,
        method: "POST",
        language: "en-US",
      });

      res.type("text/xml");
      res.send(twiml.toString());
      return;
    } else {
      // This is a retry - user didn't speak
      const retryCount = (session.retryCount || 0) + 1;
      session.retryCount = retryCount;
      sessionStore.updateSession(CallSid, session);

      // Let AI generate retry message
      const aiResponse = await processConversation("", session, businessConfig);
      const twiml = new VoiceResponse();
      playDeepgramTTS(
        twiml,
        aiResponse.response || "I didn't catch that. Could you repeat?"
      );

      if (retryCount < 3) {
        twiml.gather({
          input: ["speech"],
          speechTimeout: "auto",
          action: `${config.serviceUrl}/twilio/voice/gather`,
          method: "POST",
          language: "en-US",
        });
      } else {
        twiml.hangup();
      }

      res.type("text/xml");
      res.send(twiml.toString());
      return;
    }
  }

  // Reset retry count
  if (session.retryCount) {
    session.retryCount = 0;
    sessionStore.updateSession(CallSid, session);
  }

  // Add user message to history
  session.conversationHistory.push({ role: "user", content: userMessage });

  // Process with OpenAI (businessConfig already loaded above)
  let aiResponse;
  try {
    const tLlmStart = Date.now();
    console.log(`[GATHER] Processing: "${userMessage}"`);
    aiResponse = await processConversation(
      userMessage,
      session,
      businessConfig
    );
    const tLlmEnd = Date.now();
    console.log(
      `[LATENCY] LLM duration: ${tLlmEnd - tLlmStart}ms (CallSid=${CallSid})`
    );
  } catch (error: any) {
    console.error(`[GATHER] Error:`, error?.message);
    const twiml = new VoiceResponse();
    playDeepgramTTS(
      twiml,
      "I'm experiencing technical difficulties. Please call back later."
    );
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  // Add AI response to history
  session.conversationHistory.push({
    role: "assistant",
    content: aiResponse.response,
  });

  console.log(`[GATHER] AI Response - isComplete: ${aiResponse.isComplete}`);
  console.log(
    `[GATHER] AI Response - has extractedData: ${!!aiResponse.extractedData}`
  );
  if (aiResponse.extractedData) {
    console.log(
      `[GATHER] Extracted data:`,
      JSON.stringify(aiResponse.extractedData)
    );
  }

  const twiml = new VoiceResponse();

  // If AI says conversation is complete, book appointment and hangup
  if (aiResponse.isComplete && aiResponse.extractedData) {
    console.log(`[GATHER] 🎯 Attempting to book appointment...`);
    const { customerName, appointmentDate, appointmentTime } =
      aiResponse.extractedData;

    if (!session.businessId) {
      console.error(`[GATHER] No businessId for call ${CallSid}`);
      playDeepgramTTS(
        twiml,
        "I'm sorry, there was an error. Please call back later."
      );
      twiml.hangup();
      res.type("text/xml");
      res.send(twiml.toString());
      const tEnd = Date.now();
      console.log(
        `[LATENCY] Full turn (user -> LLM -> TTS) took ${tEnd - tStart
        }ms (CallSid=${CallSid})`
      );
      return;
    }

    const dateTime = parseDateTime(appointmentDate, appointmentTime);
    console.log(
      `[GATHER] Parsed dateTime:`,
      dateTime
        ? `start=${dateTime.start.toISOString()}, end=${dateTime.end.toISOString()}`
        : "null"
    );

    if (dateTime) {
      try {
        // Load business config for availability check
        const configData =
          businessConfig || (await loadBusinessConfig(session.businessId));
        console.log(`[GATHER] Checking availability...`);
        const availability = await checkDbAvailability(
          session.businessId,
          dateTime.start,
          dateTime.end,
          configData?.config || null
        );
        console.log(
          `[GATHER] Availability result:`,
          JSON.stringify(availability)
        );

        if (availability.available) {
          console.log(`[GATHER] ✅ Slot available, creating booking...`);
          const bookingId = await createDbBooking(
            session.businessId,
            session.dbSessionId || null,
            customerName,
            From,
            dateTime.start,
            dateTime.end
          );
          console.log(`[GATHER] Booking created with ID: ${bookingId}`);

          if (bookingId) {
            session.collectedData = {
              customerName,
              appointmentDate,
              appointmentTime,
              phoneNumber: From,
            };
            session.status = "completed";
            sessionStore.updateSession(CallSid, session);

            // Update DB call session
            if (session.dbSessionId) {
              await updateCallSession(CallSid, {
                status: "completed",
                ended_at: new Date().toISOString(),
                summary: `Booked appointment for ${customerName} on ${appointmentDate} at ${appointmentTime}`,
              });
            }

            // Speak AI's final confirmation message using Deepgram TTS
            playDeepgramTTS(twiml, aiResponse.response);
            twiml.hangup();
          } else {
            throw new Error("Failed to create booking in database");
          }
        } else {
          console.log(`[GATHER] ❌ Slot NOT available: ${availability.reason}`);
          // Not available - let AI handle this
          playDeepgramTTS(twiml, availability.reason || aiResponse.response);
          twiml.pause({ length: 1 });
          twiml.gather({
            input: ["speech"],
            speechTimeout: "3",
            action: `${config.serviceUrl}/twilio/voice/gather`,
            method: "POST",
            language: "en-US",
          });
        }
      } catch (error) {
        console.error(`[GATHER] ❌ Error booking:`, error);
        playDeepgramTTS(
          twiml,
          "I'm sorry, there was an error. Please call back later."
        );
        twiml.hangup();
      }
    } else {
      console.log(
        `[GATHER] ⚠️  Invalid date/time parsed, continuing conversation`
      );
      // Invalid date/time - continue conversation
      playDeepgramTTS(twiml, aiResponse.response);
      twiml.pause({ length: 1 });
      twiml.gather({
        input: ["speech"],
        speechTimeout: "3",
        action: `${config.serviceUrl}/twilio/voice/gather`,
        method: "POST",
        language: "en-US",
      });
    }
  } else {
    console.log(`[GATHER] ⏳ Continuing conversation (not complete yet)`);
    // Continue conversation
    session.status = "collecting";
    sessionStore.updateSession(CallSid, session);

    playDeepgramTTS(twiml, aiResponse.response);
    twiml.pause({ length: 1 });
    twiml.gather({
      input: ["speech"],
      speechTimeout: "3",
      action: `${config.serviceUrl}/twilio/voice/gather`,
      method: "POST",
      language: "en-US",
    });
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// Twilio webhook for call status updates
router.post("/voice/status", async (req: Request, res: Response) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`[STATUS] ${CallSid} - ${CallStatus}`);

  if (
    CallStatus === "completed" ||
    CallStatus === "failed" ||
    CallStatus === "busy" ||
    CallStatus === "no-answer"
  ) {
    // Update DB call session if exists
    await updateCallSession(CallSid, {
      status: CallStatus === "completed" ? "completed" : "failed",
      ended_at: new Date().toISOString(),
    });

    // Clean up both session types
    setTimeout(async () => {
      sessionStore.deleteSession(CallSid);
      await streamingSessionStore.delete(CallSid);
    }, 60000);
  }

  res.status(200).send("OK");
});

export default router;
