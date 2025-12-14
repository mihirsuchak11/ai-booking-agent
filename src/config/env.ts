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
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    // Realtime API settings
    realtimeModel: process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17",
    realtimeVoice: process.env.OPENAI_REALTIME_VOICE || "alloy", // Options: alloy, echo, shimmer
  },

  // Anthropic Claude configuration
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
  },

  // LLM Provider selection: "openai" or "anthropic"
  llmProvider: (process.env.LLM_PROVIDER || "openai") as "openai" | "anthropic",

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

  // Streaming mode - use Media Streams for real-time voice
  // Note: Disabled on Vercel because serverless functions don't support WebSockets
  streamingMode:
    process.env.VERCEL === "1" ? false : process.env.STREAMING_MODE !== "false", // Default to true (unless on Vercel)

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
];

// Add LLM provider API key based on selected provider
if (config.llmProvider === "anthropic") {
  if (!config.anthropic.apiKey) {
    requiredVars.push("ANTHROPIC_API_KEY");
  }
} else {
  // Default to OpenAI
  requiredVars.push("OPENAI_API_KEY");
}

for (const varName of requiredVars) {
  if (!process.env[varName] || process.env[varName]?.includes("your_")) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

console.log("🚀 System initialized with OpenAI Realtime API");
