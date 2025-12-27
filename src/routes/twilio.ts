import express, { Request, Response } from "express";
import twilio from "twilio";
import { config } from "../config/env";
import {
  resolveBusinessByPhoneNumber,
} from "../db/business";
import { updateCallSession, createCallSession } from "../db/sessions";
import { getMediaStreamUrl } from "./media-stream";

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// Helper for standard TTS
function speak(twiml: any, text: string) {
  twiml.say({ voice: 'alice' }, text);
}

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
    speak(
      twiml,
      "I'm sorry, this number is not configured. Please contact support."
    );
    twiml.hangup();
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  const twiml = new VoiceResponse();
  const dbSessionId = await createCallSession(businessId, CallSid, From, To);

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
  if (dbSessionId) {
    stream.parameter({ name: "dbSessionId", value: dbSessionId });
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
  }

  res.status(200).send("OK");
});

export default router;
