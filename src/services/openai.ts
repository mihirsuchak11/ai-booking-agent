import OpenAI from "openai";
import { config } from "../config/env";
import { CallSession } from "../state/sessions";
import { getBusinessConfig, getAvailableTimeSlots } from "./businessRules";

// Log API key status (without exposing the actual key)
const apiKeyStatus = config.openai.apiKey
  ? `Set (${config.openai.apiKey.substring(
      0,
      7
    )}...${config.openai.apiKey.substring(config.openai.apiKey.length - 4)})`
  : "NOT SET";
console.log(`[OpenAI] API Key Status: ${apiKeyStatus}`);

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

function getBusinessHoursInfo(): string {
  const businessConfig = getBusinessConfig();
  const today = new Date();
  const slots = getAvailableTimeSlots(today);

  if (slots.length === 0) {
    return "We are closed today.";
  }

  const hoursList = slots.map((s) => `${s.start} to ${s.end}`).join(" and ");
  return `Our business hours are ${hoursList}.`;
}

const SYSTEM_PROMPT = `You are helping to book appointments over a phone call. The caller has ALREADY been greeted with "Hi! Thanks for calling ${
  config.business.name
}. I'm here to help you book an appointment. What can I do for you?"

Your goal is to collect the following information from the caller:
1. Customer name
2. Appointment date
3. Appointment time

STRICT RULES - FOLLOW THESE OR YOU WILL FAIL:
- NEVER greet the caller - NO "hello", "hi", "thank you for calling", etc.
- NEVER say "please continue", "go ahead", "proceed", or similar prompts
- NEVER repeat information about being an AI assistant or helping book appointments
- START IMMEDIATELY with your question - the greeting already happened
- If this is your first response, jump straight to asking what they need or for their name
- End responses naturally with a question mark - the system will automatically listen
- Keep responses to 1 sentence only - phone conversations need brevity
- Be conversational and natural
- Ask ONE question at a time
- Use natural language: "What's your name?" NOT "Please provide your name"
- If unclear, ask for clarification naturally
- Once you have all info, confirm it back before completing

BUSINESS RULES:
- Guide callers to choose times within business hours: ${getBusinessHoursInfo()}
- We require at least ${
  getBusinessConfig().minimumNoticeHours
} hours advance notice for bookings
- If caller wants a time outside business hours, suggest available times naturally

CURRENT CONTEXT:
- Timezone: ${config.business.timezone}
- Current date: ${new Date().toLocaleDateString("en-US", {
  timeZone: config.business.timezone,
})}
- Current time: ${new Date().toLocaleTimeString("en-US", {
  timeZone: config.business.timezone,
  hour: "2-digit",
  minute: "2-digit",
})}

RESPONSE FORMAT:
When you have collected all the information, respond with JSON:
{
  "status": "complete",
  "summary": "Brief natural confirmation (e.g., 'Perfect! I have you down for...')",
  "customerName": "John Doe",
  "appointmentDate": "2024-01-15",
  "appointmentTime": "14:00"
}

If still collecting information, respond with JSON:
{
  "status": "collecting",
  "response": "Your natural next question or response (end with a question mark if asking something)"
}

Remember: Your response will be spoken aloud, then there's a pause, then the system automatically listens. You NEVER need to say "please continue", "go ahead", "proceed", or any continuation prompts. Just ask your question naturally and stop.`;

export async function processConversation(
  userMessage: string,
  session: CallSession
): Promise<{ response: string; isComplete: boolean; extractedData?: any }> {
  // Verify API key is available
  if (!config.openai.apiKey) {
    console.error("[OpenAI] API key is missing!");
    throw new Error("OpenAI API key is not configured");
  }

  console.log(
    `[OpenAI] Processing message: "${userMessage.substring(0, 50)}..."`
  );
  console.log(
    `[OpenAI] Session history length: ${session.conversationHistory.length}`
  );

  // Build conversation history
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...session.conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  // If this is the first user message, remind the AI NOT to greet
  if (session.conversationHistory.length === 0) {
    messages.push({
      role: "system",
      content:
        "REMINDER: The caller was already greeted. Do NOT greet them. Start directly with your question.",
    });
  }

  try {
    // Use configurable model or fallback to gpt-3.5-turbo (faster and more cost-effective)
    const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
    console.log(`[OpenAI] Using model: ${model}`);

    // Create a promise with timeout
    const timeoutMs = 10000; // 10 second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("OpenAI API timeout")), timeoutMs);
    });

    const completionPromise = openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 150, // Reduced from 200 for faster responses
    });

    // Race between completion and timeout
    const completion = (await Promise.race([
      completionPromise,
      timeoutPromise,
    ])) as any;

    const assistantMessage = completion.choices[0]?.message?.content || "";

    // Clean up the response - remove any "please continue" or similar prompts
    let cleanedMessage = assistantMessage
      .replace(/\bplease continue\b/gi, "")
      .replace(/\bgo ahead\b/gi, "")
      .replace(/\bcontinue\b/gi, "")
      .replace(/\bplease proceed\b/gi, "")
      .replace(/\bproceed\b/gi, "")
      .trim();

    // If cleaning removed everything, use original message
    if (!cleanedMessage) {
      cleanedMessage = assistantMessage.trim();
    }

    // Try to parse JSON response if it's complete
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(cleanedMessage);
    } catch {
      // Not JSON, treat as regular response
    }

    if (parsedResponse?.status === "complete") {
      return {
        response: parsedResponse.summary || cleanedMessage,
        isComplete: true,
        extractedData: {
          customerName: parsedResponse.customerName,
          appointmentDate: parsedResponse.appointmentDate,
          appointmentTime: parsedResponse.appointmentTime,
        },
      };
    }

    return {
      response: parsedResponse?.response || cleanedMessage,
      isComplete: false,
    };
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    console.error("Error details:", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type,
    });

    // Check for specific error types
    if (error?.status === 401) {
      console.error("OpenAI API key is invalid or missing");
      throw new Error("OpenAI API authentication failed");
    }
    if (error?.status === 429) {
      console.error("OpenAI API rate limit exceeded");
      return {
        response:
          "I'm experiencing high demand right now. Please try again in a moment.",
        isComplete: false,
      };
    }
    if (error?.code === "insufficient_quota") {
      console.error("OpenAI API quota exceeded");
      throw new Error("OpenAI API quota exceeded");
    }

    // Handle timeout errors
    if (
      error?.message === "OpenAI API timeout" ||
      error?.code === "ECONNABORTED"
    ) {
      console.error("OpenAI API request timed out");
      return {
        response:
          "I'm processing your request. Could you please repeat what you just said?",
        isComplete: false,
      };
    }

    return {
      response: "I'm sorry, I didn't catch that. Could you say that again?",
      isComplete: false,
    };
  }
}
