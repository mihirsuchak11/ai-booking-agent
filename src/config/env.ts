import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  serviceUrl: process.env.SERVICE_URL || "http://localhost:3000",

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL || "gpt-4o",
  },

  // Deepgram configuration (STT + TTS)
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY!,
    sttModel: process.env.DEEPGRAM_STT_MODEL || "nova-2",
    ttsModel: process.env.DEEPGRAM_TTS_MODEL || "aura-asteria-en",
    language: process.env.DEEPGRAM_LANGUAGE || "en-US",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
  },

  business: {
    name: process.env.BUSINESS_NAME || "Business",
    timezone: process.env.BUSINESS_TIMEZONE || "America/New_York",
    hoursJson: process.env.BUSINESS_HOURS_JSON, // Optional: JSON string for custom hours
    appointmentDurationMinutes: parseInt(
      process.env.APPOINTMENT_DURATION_MINUTES || "30",
      10
    ),
    minimumNoticeHours: parseInt(process.env.MINIMUM_NOTICE_HOURS || "2", 10),
  },

  // Testing mode - bypasses Google Calendar integration
  testMode: process.env.TEST_MODE === "true",

  // Streaming mode - use Media Streams for real-time voice
  streamingMode: process.env.STREAMING_MODE !== "false", // Default to true

  // Supabase (optional - will use DB if provided)
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
};

// Validate required environment variables
const requiredVars = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "OPENAI_API_KEY",
];

// Google Calendar vars only required if not in test mode
if (!config.testMode) {
  requiredVars.push(
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN"
  );
}

// Streaming mode requires Deepgram (for both STT and TTS)
if (config.streamingMode) {
  requiredVars.push("DEEPGRAM_API_KEY");
}

for (const varName of requiredVars) {
  if (!process.env[varName] || process.env[varName]?.includes("your_")) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

if (config.testMode) {
  console.log(
    "⚠️  TEST MODE ENABLED - Google Calendar integration is bypassed"
  );
}

if (config.streamingMode) {
  console.log(
    "🎙️  STREAMING MODE ENABLED - Using Deepgram (STT + TTS) for human-like voice"
  );
}
