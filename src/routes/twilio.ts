import express, { Request, Response } from "express";
import twilio from "twilio";
import { config } from "../config/env";
import { sessionStore, CallSession } from "../state/sessions";
import { processConversation } from "../services/openai";
import {
  checkAvailability,
  createAppointment,
  parseDateTime,
} from "../services/calendar";

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

  // Create session if new call
  let session = sessionStore.getSession(CallSid);
  if (!session) {
    session = sessionStore.createSession(CallSid, From, To);
    console.log(`[INCOMING] Created new session for ${CallSid}`);
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

    // Let AI generate retry message
    const aiResponse = await processConversation("", session);
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

  // Process with OpenAI
  let aiResponse;
  try {
    console.log(`[GATHER] Processing: "${userMessage}"`);
    aiResponse = await processConversation(userMessage, session);
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

    const dateTime = parseDateTime(appointmentDate, appointmentTime);

    if (dateTime) {
      try {
        const availability = await checkAvailability(
          dateTime.start,
          dateTime.end
        );

        if (availability.available) {
          await createAppointment(
            customerName,
            From,
            dateTime.start,
            dateTime.end
          );

          session.collectedData = {
            customerName,
            appointmentDate,
            appointmentTime,
            phoneNumber: From,
          };
          session.status = "completed";
          sessionStore.updateSession(CallSid, session);

          // Speak AI's final confirmation message
          twiml.say(
            { voice: "Polly.Joanna", language: "en-US" },
            aiResponse.response
          );
          twiml.hangup();
        } else {
          // Not available - let AI handle this
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
router.post("/voice/status", (req: Request, res: Response) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`[STATUS] ${CallSid} - ${CallStatus}`);

  if (
    CallStatus === "completed" ||
    CallStatus === "failed" ||
    CallStatus === "busy" ||
    CallStatus === "no-answer"
  ) {
    setTimeout(() => {
      sessionStore.deleteSession(CallSid);
    }, 60000);
  }

  res.status(200).send("OK");
});

export default router;
