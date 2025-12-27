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

  // Supabase (for database)
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

for (const varName of requiredVars) {
  if (!process.env[varName] || process.env[varName]?.includes("your_")) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

console.log("🚀 System initialized with OpenAI Realtime API");
