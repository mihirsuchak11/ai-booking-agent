import OpenAI from "openai";
import { config } from "../config/env";
import { CallSession } from "../state/sessions";
import { getBusinessConfig, getAvailableTimeSlots } from "./businessRules";

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
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
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
  } catch (error) {
    console.error("OpenAI API error:", error);
    return {
      response:
        "I'm sorry, I'm having trouble processing that. Could you please repeat?",
      isComplete: false,
    };
  }
}
