import express, { Request, Response } from "express";
import twilio from "twilio";
import { config } from "../config/env";
import { sessionStore, CallSession } from "../state/sessions";
import { processConversation } from "../services/openai";
import { parseDateTime } from "../services/calendar";
import {
  resolveBusinessByPhoneNumber,
  loadBusinessConfig,
} from "../db/business";
import { createCallSession, updateCallSession } from "../db/sessions";
import { checkDbAvailability, createDbBooking } from "../db/bookings";

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// Twilio webhook for incoming calls
router.post("/voice/incoming", async (req: Request, res: Response) => {
  const { CallSid, From, To } = req.body;

  console.log(`[INCOMING] Call: ${CallSid} from ${From} to ${To}`);

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
    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "I'm sorry, this number is not configured. Please contact support."
    );
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

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
  const twiml = new VoiceResponse();
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

  // Handle empty speech - let AI handle retry prompts
  if (!userMessage || userMessage.trim().length === 0) {
    const retryCount = (session.retryCount || 0) + 1;
    session.retryCount = retryCount;
    sessionStore.updateSession(CallSid, session);

    // Load business config for AI
    let businessConfig = null;
    if (session.businessId) {
      businessConfig = await loadBusinessConfig(session.businessId);
    }

    // Let AI generate retry message
    const aiResponse = await processConversation("", session, businessConfig);
    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      aiResponse.response || "I didn't catch that. Could you repeat?"
    );

    if (retryCount < 3) {
      twiml.pause({ length: 1 });
      twiml.gather({
        input: ["speech"],
        speechTimeout: "3",
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

  // Reset retry count
  if (session.retryCount) {
    session.retryCount = 0;
    sessionStore.updateSession(CallSid, session);
  }

  // Add user message to history
  session.conversationHistory.push({ role: "user", content: userMessage });

  // Load business config if not already loaded
  let businessConfig = null;
  if (session.businessId) {
    const configData = await loadBusinessConfig(session.businessId);
    businessConfig = configData;
  }

  // Process with OpenAI
  let aiResponse;
  try {
    console.log(`[GATHER] Processing: "${userMessage}"`);
    aiResponse = await processConversation(
      userMessage,
      session,
      businessConfig
    );
  } catch (error: any) {
    console.error(`[GATHER] Error:`, error?.message);
    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
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

  const twiml = new VoiceResponse();

  // If AI says conversation is complete, book appointment and hangup
  if (aiResponse.isComplete && aiResponse.extractedData) {
    const { customerName, appointmentDate, appointmentTime } =
      aiResponse.extractedData;

    if (!session.businessId) {
      console.error(`[GATHER] No businessId for call ${CallSid}`);
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "I'm sorry, there was an error. Please call back later."
      );
      twiml.hangup();
      res.type("text/xml");
      res.send(twiml.toString());
      return;
    }

    const dateTime = parseDateTime(appointmentDate, appointmentTime);

    if (dateTime) {
      try {
        // Load business config for availability check
        const configData =
          businessConfig || (await loadBusinessConfig(session.businessId));
        const availability = await checkDbAvailability(
          session.businessId,
          dateTime.start,
          dateTime.end,
          configData?.config || null
        );

        if (availability.available) {
          const bookingId = await createDbBooking(
            session.businessId,
            session.dbSessionId || null,
            customerName,
            From,
            dateTime.start,
            dateTime.end
          );

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

            // Speak AI's final confirmation message
            twiml.say(
              { voice: "Polly.Joanna", language: "en-US" },
              aiResponse.response
            );
            twiml.hangup();
          } else {
            throw new Error("Failed to create booking in database");
          }
        } else {
          // Not available - let AI handle this
          twiml.say(
            { voice: "Polly.Joanna", language: "en-US" },
            availability.reason || aiResponse.response
          );
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
        console.error("Error booking:", error);
        twiml.say(
          { voice: "Polly.Joanna", language: "en-US" },
          "I'm sorry, there was an error. Please call back later."
        );
        twiml.hangup();
      }
    } else {
      // Invalid date/time - continue conversation
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        aiResponse.response
      );
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
    // Continue conversation
    session.status = "collecting";
    sessionStore.updateSession(CallSid, session);

    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      aiResponse.response
    );
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

    setTimeout(() => {
      sessionStore.deleteSession(CallSid);
    }, 60000);
  }

  res.status(200).send("OK");
});

export default router;
