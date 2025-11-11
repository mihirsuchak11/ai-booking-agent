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
  const { CallSid, From, To, CallStatus } = req.body;

  console.log(
    `[INCOMING] Call: ${CallSid} from ${From} to ${To}, Status: ${CallStatus}`
  );

  // Prevent caching - Twilio should not cache TwiML responses
  res.set({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  // Create or get session
  let session = sessionStore.getSession(CallSid);
  const isNewCall = !session;

  if (!session) {
    session = sessionStore.createSession(CallSid, From, To);
    console.log(`[INCOMING] Created new session for ${CallSid}`);
  } else {
    console.log(
      `[INCOMING] Existing session found for ${CallSid}, conversation history: ${session.conversationHistory.length} messages`
    );

    // If we already have conversation history, this is NOT a new call
    // Twilio might be calling this endpoint again - redirect to gather instead
    if (session.conversationHistory.length > 0) {
      console.log(
        `[INCOMING] Session already in progress, redirecting to gather endpoint`
      );
      const twiml = new VoiceResponse();
      twiml.redirect(
        {
          method: "POST",
        },
        `${config.serviceUrl}/twilio/voice/gather`
      );
      res.type("text/xml");
      res.send(twiml.toString());
      return;
    }
  }

  const twiml = new VoiceResponse();

  // Only greet if this is a truly new call (no conversation history)
  if (isNewCall && session.conversationHistory.length === 0) {
    // Natural greeting with business name
    const greeting = `Hi! Thanks for calling ${config.business.name}. I'm here to help you book an appointment. What can I do for you?`;
    console.log(`[INCOMING] Sending greeting: "${greeting}"`);
    twiml.say({ voice: "Polly.Joanna", language: "en-US" }, greeting);
    twiml.pause({ length: 1 });
  }

  // Gather speech input
  const gather = twiml.gather({
    input: ["speech"],
    speechTimeout: "3",
    action: `${config.serviceUrl}/twilio/voice/gather`,
    method: "POST",
    language: "en-US",
    hints:
      "appointment, book, schedule, name, date, time, tomorrow, today, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday",
  });

  // Fallback if no input
  twiml.say(
    { voice: "Polly.Joanna", language: "en-US" },
    "I didn't catch that. Please call back when you're ready. Goodbye!"
  );
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

// Twilio webhook for speech input
router.post("/voice/gather", async (req: Request, res: Response) => {
  const { CallSid, SpeechResult, From } = req.body;

  // Prevent caching
  res.set({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  console.log(`[GATHER] Speech input for ${CallSid}: "${SpeechResult}"`);
  console.log(`[GATHER] Full request body:`, JSON.stringify(req.body, null, 2));

  const session = sessionStore.getSession(CallSid);
  if (!session) {
    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "I'm sorry, there was an error. Please call back. Goodbye!"
    );
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  const userMessage = SpeechResult || "";

  // Handle empty speech input with better retry logic
  if (!userMessage || userMessage.trim().length === 0) {
    console.log(`Empty speech input for ${CallSid}`);
    const retryCount = (session.retryCount || 0) + 1;
    session.retryCount = retryCount;
    sessionStore.updateSession(CallSid, session);

    const twiml = new VoiceResponse();

    // Different prompts based on retry count
    if (retryCount === 1) {
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "I didn't catch that. Could you please repeat?"
      );
    } else if (retryCount === 2) {
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "I'm having trouble hearing you. Please speak clearly."
      );
    } else {
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "I'm having difficulty understanding. Please call back when you're in a quieter location. Goodbye!"
      );
      twiml.hangup();
      res.type("text/xml");
      res.send(twiml.toString());
      return;
    }

    twiml.pause({ length: 1 });

    const gather = twiml.gather({
      input: ["speech"],
      speechTimeout: "4",
      action: `${config.serviceUrl}/twilio/voice/gather`,
      method: "POST",
      language: "en-US",
      hints: "appointment, book, schedule, name, date, time, tomorrow, today",
    });

    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  // Reset retry count on successful speech input
  if (session.retryCount) {
    session.retryCount = 0;
    sessionStore.updateSession(CallSid, session);
  }

  // Add user message to conversation history
  session.conversationHistory.push({ role: "user", content: userMessage });

  // Process with OpenAI
  let aiResponse;
  try {
    console.log(`Processing user message with OpenAI: "${userMessage}"`);
    aiResponse = await processConversation(userMessage, session);
    console.log(`OpenAI response received:`, {
      response: aiResponse.response,
      isComplete: aiResponse.isComplete,
      hasExtractedData: !!aiResponse.extractedData,
    });
  } catch (error: any) {
    console.error(`❌ Error processing conversation for ${CallSid}:`);
    console.error(`   Error message: ${error?.message || "Unknown error"}`);
    console.error(`   Error type: ${error?.constructor?.name || "Unknown"}`);
    console.error(`   Error stack:`, error?.stack);
    console.error(
      `   Full error:`,
      JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    );

    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "I'm sorry, I'm experiencing technical difficulties. Please try again in a moment."
    );
    twiml.pause({ length: 1 });

    const gather = twiml.gather({
      input: ["speech"],
      speechTimeout: "3",
      action: `${config.serviceUrl}/twilio/voice/gather`,
      method: "POST",
      language: "en-US",
    });

    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  // Add assistant response to conversation history
  session.conversationHistory.push({
    role: "assistant",
    content: aiResponse.response,
  });

  console.log(
    `[GATHER] Sending AI response to Twilio: "${aiResponse.response}"`
  );

  const twiml = new VoiceResponse();

  if (aiResponse.isComplete && aiResponse.extractedData) {
    // We have all the information, try to book the appointment
    session.status = "checking";
    sessionStore.updateSession(CallSid, session);

    const { customerName, appointmentDate, appointmentTime } =
      aiResponse.extractedData;

    // Parse date and time
    const dateTime = parseDateTime(appointmentDate, appointmentTime);

    if (!dateTime) {
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "I'm sorry, I couldn't understand the date and time. Let me ask again."
      );
      twiml.pause({ length: 1 });

      const gather = twiml.gather({
        input: ["speech"],
        speechTimeout: "4",
        action: `${config.serviceUrl}/twilio/voice/gather`,
        method: "POST",
        language: "en-US",
        hints:
          "tomorrow, today, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, morning, afternoon, evening, AM, PM",
      });

      session.status = "collecting";
      sessionStore.updateSession(CallSid, session);

      res.type("text/xml");
      res.send(twiml.toString());
      return;
    }

    // Check availability (business rules + calendar conflicts)
    try {
      const availability = await checkAvailability(
        dateTime.start,
        dateTime.end
      );

      if (!availability.available) {
        const message = availability.reason
          ? `I'm sorry, ${availability.reason.toLowerCase()} Please call back to choose another time. Goodbye!`
          : "I'm sorry, that time slot is not available. Please call back to choose another time. Goodbye!";

        twiml.say({ voice: "Polly.Joanna", language: "en-US" }, message);
        twiml.hangup();

        session.status = "failed";
        sessionStore.updateSession(CallSid, session);

        res.type("text/xml");
        res.send(twiml.toString());
        return;
      }

      // Create appointment
      const eventId = await createAppointment(
        customerName,
        From,
        dateTime.start,
        dateTime.end
      );

      // Confirm booking
      const confirmation = `Great! I've booked your appointment for ${appointmentDate} at ${appointmentTime}. You'll receive a confirmation shortly. Thank you for calling ${config.business.name}!`;

      twiml.say({ voice: "Polly.Joanna", language: "en-US" }, confirmation);
      twiml.hangup();

      session.status = "completed";
      session.collectedData = {
        customerName,
        appointmentDate,
        appointmentTime,
        phoneNumber: From,
      };
      sessionStore.updateSession(CallSid, session);

      console.log(
        `Appointment booked: ${eventId} for ${customerName} on ${appointmentDate} at ${appointmentTime}`
      );
    } catch (error) {
      console.error("Error booking appointment:", error);
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "I'm sorry, there was an error booking your appointment. Please call back or contact us directly. Goodbye!"
      );
      twiml.hangup();

      session.status = "failed";
      sessionStore.updateSession(CallSid, session);
    }
  } else {
    // Still collecting information
    session.status = "collecting";
    sessionStore.updateSession(CallSid, session);

    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      aiResponse.response
    );

    // Add a brief pause for natural conversation flow
    twiml.pause({ length: 1 });

    const gather = twiml.gather({
      input: ["speech"],
      speechTimeout: "3",
      action: `${config.serviceUrl}/twilio/voice/gather`,
      method: "POST",
      language: "en-US",
      hints:
        "appointment, book, schedule, name, date, time, tomorrow, today, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday",
    });

    // Fallback
    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "I didn't catch that. Please call back when you're ready. Goodbye!"
    );
    twiml.hangup();
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// Twilio webhook for call status updates
router.post("/voice/status", (req: Request, res: Response) => {
  const { CallSid, CallStatus } = req.body;

  console.log(`Call status update: ${CallSid} - ${CallStatus}`);

  if (
    CallStatus === "completed" ||
    CallStatus === "failed" ||
    CallStatus === "busy" ||
    CallStatus === "no-answer"
  ) {
    // Clean up session after a delay
    setTimeout(() => {
      sessionStore.deleteSession(CallSid);
    }, 60000); // Delete after 1 minute
  }

  res.status(200).send("OK");
});

export default router;
