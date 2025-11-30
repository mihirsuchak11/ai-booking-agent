import express, { Request, Response } from "express";
import { createDeepgramTTS } from "../services/deepgram-tts";
import { config } from "../config/env";

const router = express.Router();

/**
 * Generate audio from text using Deepgram TTS
 * Returns audio file that Twilio can play
 */
router.get("/tts", async (req: Request, res: Response) => {
  const { text, voice } = req.query;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'text' parameter" });
  }

  try {
    console.log(`[Audio] Generating TTS for: "${text.substring(0, 50)}..."`);

    // Create Deepgram TTS instance with optional voice
    const tts = createDeepgramTTS({
      model: (voice as string) || config.deepgram.ttsModel,
      encoding: "mulaw",
      sampleRate: 8000,
    });

    // Generate audio
    const audioBuffer = await tts.synthesize(text as string);

    // Set headers for Twilio compatibility
    res.set({
      "Content-Type": "audio/x-mulaw",
      "Content-Length": audioBuffer.length.toString(),
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
    });

    // Send audio buffer
    res.send(audioBuffer);
  } catch (error: any) {
    console.error("[Audio] TTS generation error:", error);
    res.status(500).json({ error: "Failed to generate audio", message: error.message });
  }
});

export default router;

