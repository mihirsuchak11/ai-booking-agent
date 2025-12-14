import express from "express";
import { createServer } from "http";
import { config } from "./config/env";
import twilioRoutes from "./routes/twilio";
import { setupMediaStreamWebSocket } from "./routes/media-stream";

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    streamingMode: config.streamingMode,
  });
});

// Twilio webhook routes
app.use("/twilio", twilioRoutes);

// Export app for Vercel serverless function
export default app;

// Start server only if not in Vercel environment
if (process.env.VERCEL !== "1") {
  const PORT = config.port;

  // Create HTTP server
  const server = createServer(app);

  // Set up WebSocket server for Media Streams (if streaming mode enabled)
  if (config.streamingMode) {
    setupMediaStreamWebSocket(server);
    console.log(`🎙️ Media Streams WebSocket enabled at /media-stream`);
    console.log(`🎤 Streaming mode: OpenAI Realtime API (speech-to-speech)`);
  } else {
    console.log(`📞 Traditional mode: Twilio Gather/Say + OpenAI`);
  }

  server.listen(PORT, () => {
    console.log(`🚀 AI Telecaller service running on port ${PORT}`);
    console.log(
      `📞 Twilio webhook URL: ${config.serviceUrl}/twilio/voice/incoming`
    );
  });
}
