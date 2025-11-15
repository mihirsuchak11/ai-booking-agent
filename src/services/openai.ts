import OpenAI from "openai";
import { config } from "../config/env";
import { CallSession } from "../state/sessions";
import { BusinessConfigWithDetails } from "../db/types";

function buildSystemPrompt(
  businessConfig: BusinessConfigWithDetails | null
): string {
  const businessName = businessConfig?.business.name || config.business.name;
  const timezone =
    businessConfig?.business.timezone || config.business.timezone;
  const minNoticeHours =
    businessConfig?.config?.min_notice_hours ||
    config.business.minimumNoticeHours;
  const greeting = businessConfig?.config?.greeting || null;
  const notesForAi = businessConfig?.config?.notes_for_ai || null;

  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", { timeZone: timezone });
  const currentTime = now.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });

  let prompt = `You are an AI assistant helping to book appointments over a phone call for ${businessName}.

Your responsibilities:
1. Greet the caller warmly when the call starts${
    greeting ? `\n   - Use this greeting: "${greeting}"` : ""
  }
2. Collect: customer name, appointment date, and appointment time
3. Confirm the details back to the caller before booking
4. Provide a final confirmation message after booking

CONVERSATION RULES:
- Be natural, friendly, and conversational
- Keep responses brief (1-2 sentences max)
- Ask ONE question at a time
- If the caller is unclear, ask for clarification naturally
- When you have all information, confirm it back: "Just to confirm, [name], you want an appointment on [date] at [time]. Is that correct?"
- CRITICAL: After they confirm with "yes", "correct", "that's right", etc., you MUST IMMEDIATELY return the completion JSON (status: "complete") with all the details. Do NOT ask any more questions.
${notesForAi ? `\nADDITIONAL INSTRUCTIONS:\n${notesForAi}` : ""}

BUSINESS RULES:
- Minimum notice: ${minNoticeHours} hours
- Timezone: ${timezone}
- Current date: ${currentDate}
- Current time: ${currentTime}

RESPONSE FORMAT:
CRITICAL: You MUST always respond with valid JSON. No plain text responses.

When you have ALL information (name, date, time) AND the caller has confirmed (said "yes", "correct", "that's right", etc.), respond IMMEDIATELY with:
{
  "status": "complete",
  "response": "Great! I've booked your appointment for [date] at [time]. You'll receive a confirmation shortly. Thank you for calling ${businessName}!",
  "customerName": "[extracted name]",
  "appointmentDate": "YYYY-MM-DD",
  "appointmentTime": "HH:MM"
}

If you're still collecting information OR waiting for confirmation, respond with:
{
  "status": "collecting",
  "response": "Your natural response or question"
}

IMPORTANT: The moment the caller confirms the appointment details, return status: "complete" immediately. Do not wait for another turn.`;

  return prompt;
}

function getOpenAIClient(
  businessConfig: BusinessConfigWithDetails | null
): OpenAI {
  const apiKey =
    businessConfig?.integration?.openai_api_key || config.openai.apiKey;

  if (!apiKey) {
    throw new Error("OpenAI API key is not configured");
  }

  return new OpenAI({
    apiKey,
  });
}

export async function processConversation(
  userMessage: string,
  session: CallSession,
  businessConfig: BusinessConfigWithDetails | null = null
): Promise<{ response: string; isComplete: boolean; extractedData?: any }> {
  const openai = getOpenAIClient(businessConfig);
  const systemPrompt = buildSystemPrompt(businessConfig);

  console.log(`[OpenAI] Processing: "${userMessage.substring(0, 50)}..."`);
  console.log(`[OpenAI] History length: ${session.conversationHistory.length}`);
  console.log(
    `[OpenAI] Business: ${businessConfig?.business.name || "default"}`
  );

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...session.conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage || "(silence)" },
  ];

  try {
    const model =
      businessConfig?.integration?.openai_model ||
      businessConfig?.config?.openai_model ||
      process.env.OPENAI_MODEL ||
      "gpt-3.5-turbo";
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

    console.log(
      `[OpenAI] Raw response (first 300 chars): ${assistantMessage.substring(
        0,
        300
      )}`
    );

    // Try to parse JSON response
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(assistantMessage);
      console.log(
        `[OpenAI] ✅ Parsed JSON successfully:`,
        JSON.stringify(parsedResponse)
      );
    } catch (e) {
      // Not JSON, treat as regular response
      console.log(`[OpenAI] ⚠️  Response is NOT JSON, treating as plain text`);
    }

    if (parsedResponse?.status === "complete") {
      console.log(
        `[OpenAI] ✅ Status is COMPLETE - extractedData:`,
        JSON.stringify(parsedResponse)
      );
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

    console.log(`[OpenAI] ⏳ Status is COLLECTING - continuing conversation`);
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
