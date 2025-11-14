import OpenAI from "openai";
import { config } from "../config/env";
import { CallSession } from "../state/sessions";
import { getBusinessConfig, getAvailableTimeSlots } from "./businessRules";

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

const SYSTEM_PROMPT = `You are an AI assistant helping to book appointments over a phone call for ${
  config.business.name
}.

Your responsibilities:
1. Greet the caller warmly when the call starts
2. Collect: customer name, appointment date, and appointment time
3. Confirm the details back to the caller before booking
4. Provide a final confirmation message after booking

CONVERSATION RULES:
- Be natural, friendly, and conversational
- Keep responses brief (1-2 sentences max)
- Ask ONE question at a time
- If the caller is unclear, ask for clarification naturally
- When you have all information, confirm it back: "Just to confirm, [name], you want an appointment on [date] at [time]. Is that correct?"
- After they confirm, say you'll book it and provide final confirmation

BUSINESS RULES:
- Business hours: ${getBusinessHoursInfo()}
- Minimum notice: ${getBusinessConfig().minimumNoticeHours} hours
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
When you have ALL information and caller confirmed, respond with JSON:
{
  "status": "complete",
  "response": "Great! I've booked your appointment for [date] at [time]. You'll receive a confirmation shortly. Thank you for calling ${
    config.business.name
  }!",
  "customerName": "John Doe",
  "appointmentDate": "2024-01-15",
  "appointmentTime": "14:00"
}

Otherwise, respond with JSON:
{
  "status": "collecting",
  "response": "Your natural response or question"
}`;

export async function processConversation(
  userMessage: string,
  session: CallSession
): Promise<{ response: string; isComplete: boolean; extractedData?: any }> {
  if (!config.openai.apiKey) {
    console.error("[OpenAI] API key is missing!");
    throw new Error("OpenAI API key is not configured");
  }

  console.log(`[OpenAI] Processing: "${userMessage.substring(0, 50)}..."`);
  console.log(`[OpenAI] History length: ${session.conversationHistory.length}`);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...session.conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage || "(silence)" },
  ];

  try {
    const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
    console.log(`[OpenAI] Using model: ${model}`);

    const timeoutMs = 10000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("OpenAI API timeout")), timeoutMs);
    });

    const completionPromise = openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 200,
    });

    const completion = (await Promise.race([
      completionPromise,
      timeoutPromise,
    ])) as any;

    const assistantMessage = completion.choices[0]?.message?.content || "";

    // Try to parse JSON response
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(assistantMessage);
    } catch {
      // Not JSON, treat as regular response
    }

    if (parsedResponse?.status === "complete") {
      return {
        response: parsedResponse.response || assistantMessage,
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
    console.error("OpenAI API error:", error?.message);

    if (error?.status === 401) {
      throw new Error("OpenAI API authentication failed");
    }
    if (error?.status === 429) {
      return {
        response: "I'm experiencing high demand. Please try again in a moment.",
        isComplete: false,
      };
    }
    if (error?.message === "OpenAI API timeout") {
      return {
        response: "I'm processing your request. Could you repeat that?",
        isComplete: false,
      };
    }

    return {
      response: "I'm sorry, I didn't catch that. Could you say that again?",
      isComplete: false,
    };
  }
}
