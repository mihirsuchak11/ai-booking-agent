import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/env";
import { CallSession } from "../state/sessions";
import { BusinessConfigWithDetails } from "../db/types";
import { StreamingSessionData, StreamingResponse } from "./openai";

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

  let prompt = `#Role
You are a warm, friendly receptionist for ${businessName}, speaking to callers over the phone. Your task is to help them book appointments naturally and efficiently.

#General Guidelines
- Be warm, friendly, and professional
- Speak clearly and naturally in plain language
- Keep most responses to 1-2 sentences and under 120 characters unless the caller asks for more detail (max: 300 characters)
- Do not use markdown formatting, like code blocks, quotes, bold, links, or italics
- Use varied phrasing; avoid repetition
- If unclear, ask for clarification
- If the user's message is empty, respond with an empty message
- If asked about your well-being, respond briefly and kindly

#Voice-Specific Instructions
- Speak in a conversational tone—your responses will be spoken aloud
- Pause after questions to allow for replies
- Confirm what the customer said if uncertain: "Just to confirm, did you say [what you heard]?"
- Never interrupt
- Use active listening cues: "Got it", "Sure thing", "Absolutely"
- Use contractions: "I'll", "you're", "that's", "we've"

#Style
- Use active listening cues
- Be warm and understanding, but concise
- Use simple words unless the caller uses technical terms
- Match the caller's energy—if they're in a hurry, be efficient; if they're chatty, be warm
- Use the caller's name once you learn it

#Call Flow Objective
${greeting ? `- Greet with: "${greeting}"` : `- Greet warmly: "Hi there! Thanks for calling ${businessName}. How can I help you today?"`}

- Collect the following information naturally:
  1. Customer name
  2. Preferred appointment date
  3. Preferred appointment time

- When you have all information, confirm it back naturally:
  "So just to make sure I have this right, [name], you'd like to come in on [date] at [time]?"

- After they confirm with "yes", "correct", "that's right", etc., complete the booking immediately

#Handling Confusion
- If you don't understand, say something like "I want to make sure I get this right—did you say [what you heard]?"
- Never just say "I didn't catch that"—always give context
- If they seem frustrated: "I totally understand, let me help sort this out"
- If they seem uncertain: "No worries, we can figure out the best time together"

#Emotional Awareness
- If caller sounds rushed: be efficient, skip small talk
- If caller sounds uncertain: be reassuring
- If caller confirms: sound genuinely pleased: "Wonderful! You're all set"

${notesForAi ? `\n#Additional Instructions\n${notesForAi}` : ""}

#Business Rules
- Minimum notice required: ${minNoticeHours} hours
- Timezone: ${timezone}
- Current date: ${currentDate}
- Current time: ${currentTime}

#Response Format
CRITICAL: You MUST always respond with valid JSON. No plain text responses.

When you have ALL information (name, date, time) AND the caller has confirmed, respond IMMEDIATELY with:
{
  "status": "complete",
  "response": "Perfect! I've got you down for [date] at [time]. We'll see you then, [name]! Have a great day!",
  "customerName": "[extracted name]",
  "appointmentDate": "YYYY-MM-DD",
  "appointmentTime": "HH:MM"
}

If you're still collecting information OR waiting for confirmation:
{
  "status": "collecting",
  "response": "Your natural, conversational response"
}

IMPORTANT: The moment the caller confirms the appointment details, return status: "complete" immediately.`;

  return prompt;
}

function getAnthropicClient(
  businessConfig: BusinessConfigWithDetails | null
): Anthropic {
  const apiKey =
    businessConfig?.integration?.anthropic_api_key || config.anthropic.apiKey;

  if (!apiKey) {
    throw new Error("Anthropic API key is not configured");
  }

  return new Anthropic({
    apiKey,
  });
}

export async function processConversationAnthropic(
  userMessage: string,
  session: CallSession,
  businessConfig: BusinessConfigWithDetails | null = null
): Promise<{ response: string; isComplete: boolean; extractedData?: any }> {
  const anthropic = getAnthropicClient(businessConfig);
  const systemPrompt = buildSystemPrompt(businessConfig);

  console.log(`[Anthropic] Processing: "${userMessage.substring(0, 50)}..."`);
  console.log(`[Anthropic] History length: ${session.conversationHistory.length}`);
  console.log(
    `[Anthropic] Business: ${businessConfig?.business.name || "default"}`
  );

  const model =
    businessConfig?.integration?.anthropic_model ||
    businessConfig?.config?.anthropic_model ||
    process.env.ANTHROPIC_MODEL ||
    config.anthropic.model ||
    "claude-3-5-haiku-20241022";

  console.log(`[Anthropic] Using model: ${model}`);

  // Build messages for Anthropic (system message + conversation history)
  const messages: Anthropic.MessageParam[] = session.conversationHistory
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));

  // Add current user message
  messages.push({
    role: "user",
    content: userMessage || "(silence)",
  });

  try {
    const timeoutMs = 10000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Anthropic API timeout")), timeoutMs);
    });

    const completionPromise = anthropic.messages.create({
      model: model as any,
      max_tokens: 200,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages,
    });

    const completion = (await Promise.race([
      completionPromise,
      timeoutPromise,
    ])) as Anthropic.Messages.Message;

    const assistantMessage =
      completion.content[0]?.type === "text"
        ? completion.content[0].text
        : "";

    console.log(
      `[Anthropic] Raw response (first 300 chars): ${assistantMessage.substring(
        0,
        300
      )}`
    );

    // Try to parse JSON response
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(assistantMessage);
      console.log(
        `[Anthropic] ✅ Parsed JSON successfully:`,
        JSON.stringify(parsedResponse)
      );
    } catch (e) {
      // Not JSON, treat as regular response
      console.log(`[Anthropic] ⚠️  Response is NOT JSON, treating as plain text`);
    }

    if (parsedResponse?.status === "complete") {
      console.log(
        `[Anthropic] ✅ Status is COMPLETE - extractedData:`,
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

    console.log(`[Anthropic] ⏳ Status is COLLECTING - continuing conversation`);
    return {
      response: parsedResponse?.response || assistantMessage,
      isComplete: false,
    };
  } catch (error: any) {
    console.error("Anthropic API error:", error?.message);

    if (error?.status === 401) {
      throw new Error("Anthropic API authentication failed");
    }
    if (error?.status === 429) {
      return {
        response: "I'm experiencing high demand. Please try again in a moment.",
        isComplete: false,
      };
    }
    if (error?.message === "Anthropic API timeout") {
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

/**
 * Process conversation with Anthropic (streaming version)
 */
export async function processConversationAnthropicStreaming(
  userMessage: string,
  session: StreamingSessionData,
  businessConfig: BusinessConfigWithDetails | null = null
): Promise<StreamingResponse> {
  const anthropic = getAnthropicClient(businessConfig);
  const systemPrompt = buildSystemPrompt(businessConfig);

  console.log(`[Anthropic Streaming] Processing: "${userMessage.substring(0, 50)}..."`);
  console.log(`[Anthropic Streaming] History length: ${session.conversationHistory.length}`);

  const model =
    businessConfig?.integration?.anthropic_model ||
    businessConfig?.config?.anthropic_model ||
    config.anthropic.model ||
    "claude-3-5-haiku-20241022";

  console.log(`[Anthropic Streaming] Using model: ${model}`);

  const messages: Anthropic.MessageParam[] = session.conversationHistory.map(
    (msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    })
  );

  messages.push({
    role: "user",
    content: userMessage || "(silence)",
  });

  try {
    const stream = await anthropic.messages.stream({
      model: model as any,
      max_tokens: 200,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages,
    });

    let fullResponse = "";

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
      }
    }

    console.log(`[Anthropic Streaming] Full response: ${fullResponse.substring(0, 300)}`);

    // Parse the JSON response
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(fullResponse);
      console.log(`[Anthropic Streaming] ✅ Parsed JSON successfully`);
    } catch (e) {
      console.log(`[Anthropic Streaming] ⚠️ Response is NOT JSON, treating as plain text`);
    }

    if (parsedResponse?.status === "complete") {
      console.log(`[Anthropic Streaming] ✅ Status is COMPLETE`);
      return {
        response: parsedResponse.response || fullResponse,
        isComplete: true,
        extractedData: {
          customerName: parsedResponse.customerName,
          appointmentDate: parsedResponse.appointmentDate,
          appointmentTime: parsedResponse.appointmentTime,
        },
      };
    }

    console.log(`[Anthropic Streaming] ⏳ Status is COLLECTING`);
    return {
      response: parsedResponse?.response || fullResponse,
      isComplete: false,
    };
  } catch (error: any) {
    console.error("[Anthropic Streaming] Error:", error?.message);

    if (error?.status === 401) {
      throw new Error("Anthropic API authentication failed");
    }
    if (error?.status === 429) {
      return {
        response: "I'm experiencing high demand. Please try again in a moment.",
        isComplete: false,
      };
    }

    return {
      response: "I'm sorry, I didn't quite catch that. Could you say that again?",
      isComplete: false,
    };
  }
}

