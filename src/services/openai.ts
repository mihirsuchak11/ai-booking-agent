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

const SYSTEM_PROMPT = `You are a friendly AI assistant helping to book appointments for ${
  config.business.name
}.

Your goal is to collect the following information from the caller:
1. Customer name
2. Appointment date
3. Appointment time

Guidelines:
- Be conversational and natural
- Ask one question at a time
- If the caller provides incomplete information, ask clarifying questions
- Once you have all the information, summarize it back to confirm
- Keep responses brief (1-2 sentences max) since this is a phone conversation
- Be polite and professional
- If the caller wants to cancel or says they don't need an appointment, politely end the conversation
- Guide callers to choose times within business hours: ${getBusinessHoursInfo()}
- We require at least ${
  getBusinessConfig().minimumNoticeHours
} hours advance notice for bookings

Current timezone: ${config.business.timezone}
Current date: ${new Date().toLocaleDateString("en-US", {
  timeZone: config.business.timezone,
})}

When you have collected all the information, respond with a JSON object in this exact format:
{
  "status": "complete",
  "summary": "Brief confirmation message",
  "customerName": "John Doe",
  "appointmentDate": "2024-01-15",
  "appointmentTime": "14:00"
}

If you're still collecting information, respond with:
{
  "status": "collecting",
  "response": "Your next question or response to the caller"
}`;

export async function processConversation(
  userMessage: string,
  session: CallSession
): Promise<{ response: string; isComplete: boolean; extractedData?: any }> {
  // Build conversation history
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...session.conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    // Use configurable model or fallback to gpt-3.5-turbo (more widely available)
    const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 200,
    });

    const assistantMessage = completion.choices[0]?.message?.content || "";

    // Try to parse JSON response if it's complete
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(assistantMessage);
    } catch {
      // Not JSON, treat as regular response
    }

    if (parsedResponse?.status === "complete") {
      return {
        response: parsedResponse.summary || assistantMessage,
        isComplete: true,
        extractedData: {
          customerName: parsedResponse.customerName,
          appointmentDate: parsedResponse.appointmentDate,
          appointmentTime: parsedResponse.appointmentTime,
        },
      };
    }

    return {
      response: parsedResponse?.response || assistantMessage,
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

    return {
      response:
        "I'm sorry, I'm having trouble processing that. Could you please repeat?",
      isComplete: false,
    };
  }
}
