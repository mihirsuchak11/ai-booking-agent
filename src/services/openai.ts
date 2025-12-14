import OpenAI from "openai";
import { config } from "../config/env";
import { CallSession } from "../state/sessions";
import { BusinessConfigWithDetails, REGIONS, RegionCode } from "../db/types";
import {
  processConversationAnthropic,
  processConversationAnthropicStreaming,
} from "./anthropic";

// Simplified session interface for streaming sessions
export interface StreamingSessionData {
  callSid: string;
  from: string;
  to: string;
  businessId?: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  collectedData: {
    customerName?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    phoneNumber?: string;
  };
  status: "collecting" | "completed" | "failed";
  createdAt: Date;
}

export interface StreamingResponse {
  response: string;
  isComplete: boolean;
  extractedData?: {
    customerName: string;
    appointmentDate: string;
    appointmentTime: string;
  };
}

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

  // Region-specific settings
  const region = (businessConfig?.business?.region || "US") as RegionCode;
  const regionConfig = REGIONS[region];
  const locale = businessConfig?.business?.locale || regionConfig.locale;
  const dateFormat = businessConfig?.business?.date_format || regionConfig.dateFormat;

  const now = new Date();
  const currentDate = now.toLocaleDateString(locale, { timeZone: timezone });
  const currentTime = now.toLocaleTimeString(locale, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });

  // Region-specific language instructions
  let regionInstructions = "";
  switch (region) {
    case "GB":
      regionInstructions = `
#Regional Language (United Kingdom)
- Use British English spellings (e.g., "colour", "favourite", "organised")
- Use British phrases (e.g., "Lovely!", "Brilliant!", "Cheers")
- Say "mobile" instead of "cell phone"
- Use 24-hour time format when confirming appointments`;
      break;
    case "IN":
      regionInstructions = `
#Regional Language (India)
- Be respectful of Indian naming conventions (may include titles like "ji")
- Common greetings: "Namaste" can be used if caller uses it first
- Be aware of common Indian English phrases
- Use 12-hour time format with AM/PM`;
      break;
    case "CA":
      regionInstructions = `
#Regional Language (Canada)
- Use Canadian English (mix of British and American spellings)
- Be polite and courteous (common Canadian trait)
- Use 12-hour time format with AM/PM`;
      break;
    default: // US
      regionInstructions = `
#Regional Language (United States)
- Use American English spellings
- Use 12-hour time format with AM/PM`;
  }

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
${regionInstructions}

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
${
  greeting
    ? `- Greet with: "${greeting}"`
    : `- Greet warmly: "Hi there! Thanks for calling ${businessName}. How can I help you today?"`
}

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
- Region: ${regionConfig.name}
- Date format: ${dateFormat}
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

/**
 * Build an enhanced system prompt for more human-like conversations
 * Used by the streaming voice agent
 */
function buildHumanLikeSystemPrompt(
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

  // Region-specific settings
  const region = (businessConfig?.business?.region || "US") as RegionCode;
  const regionConfig = REGIONS[region];
  const locale = businessConfig?.business?.locale || regionConfig.locale;
  const dateFormat = businessConfig?.business?.date_format || regionConfig.dateFormat;

  // Region-specific language style
  let regionStyle = "";
  switch (region) {
    case "GB":
      regionStyle = `- Use British English and phrases like "Lovely!", "Brilliant!", "Cheers"
- Say "mobile" instead of "cell phone"`;
      break;
    case "IN":
      regionStyle = `- Be respectful of Indian naming conventions
- "Namaste" can be used if caller uses it first`;
      break;
    case "CA":
      regionStyle = `- Use Canadian English (mix of British and American)
- Be extra polite and courteous`;
      break;
    default:
      regionStyle = `- Use American English`;
  }

  let prompt = `You are a warm, friendly receptionist for ${businessName}. You're having a real phone conversation.

PERSONALITY:
- Sound genuinely happy to help, like a real person who enjoys their job
- Use natural conversational fillers: "Let me check that for you...", "Okay, got it!", "Perfect!"
- Match the caller's energy—if they're in a hurry, be efficient; if they're chatty, be warm
- Use the caller's name once you learn it
- NEVER sound robotic or scripted
${regionStyle}

VOICE BEHAVIOR:
- Keep responses SHORT (1-2 sentences max) - this is a phone call, not an email
- Speak naturally, as if talking to a friend, and sound like a calm, friendly male receptionist
- Use contractions: "I'll", "you're", "that's", "we've"
- Add brief acknowledgments: "Got it", "Sure thing", "Absolutely"

CONVERSATION FLOW:
1. ${
    greeting
      ? `Greet with: "${greeting}"`
      : `Greet warmly: "Hi there! Thanks for calling ${businessName}. How can I help you today?"`
  }
2. Collect: name, preferred date/time for appointment
3. Confirm details naturally: "So just to make sure I have this right, [name], you'd like to come in on [date] at [time]?"
4. After confirmation, complete the booking

HANDLING CONFUSION:
- If you don't understand, say something like "I want to make sure I get this right—did you say [what you heard]?"
- Never just say "I didn't catch that"—always give context
- If they seem frustrated: "I totally understand, let me help sort this out"

EMOTIONAL AWARENESS:
- If caller sounds rushed: be efficient, skip small talk
- If caller sounds uncertain: be reassuring "No worries, we can figure out the best time together"
- If caller confirms: sound genuinely pleased "Wonderful! You're all set"

BUSINESS CONTEXT:
- Region: ${regionConfig.name}
- Date format: ${dateFormat}
- Timezone: ${timezone}
${notesForAi ? `\nADDITIONAL INSTRUCTIONS:\n${notesForAi}` : ""}

RESPONSE FORMAT:
CRITICAL: You MUST always respond with valid JSON. No plain text responses.

When you have ALL information (name, date, time) AND the caller has confirmed, respond with:
{
  "status": "complete",
  "response": "Wonderful! I've got you down for [date] at [time]. We'll see you then, [name]! Have a great day!",
  "customerName": "[extracted name]",
  "appointmentDate": "YYYY-MM-DD",
  "appointmentTime": "HH:MM"
}

If you're still collecting information OR waiting for confirmation:
{
  "status": "collecting",
  "response": "Your natural, human-like response"
}

Remember: You're a real person having a conversation. Be warm, be brief, be helpful.`;

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
  // Route to correct provider based on config
  const provider =
    businessConfig?.integration?.llm_provider ||
    businessConfig?.config?.llm_provider ||
    config.llmProvider;

  console.log(`[LLM] Using provider: ${provider}`);

  if (provider === "anthropic") {
    return processConversationAnthropic(userMessage, session, businessConfig);
  }

  // Default to OpenAI
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
      config.openai.model;
    console.log(`[OpenAI] Using model: ${model}`);

    const timeoutMs = 10000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("OpenAI API timeout")), timeoutMs);
    });

    const completionPromise = openai.chat.completions.create({
      model,
      messages,
      temperature: 0.6,
      max_tokens: 100,
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

/**
 * Process conversation with streaming for faster responses
 * Used by the real-time voice agent
 */
export async function processConversationStreaming(
  userMessage: string,
  session: StreamingSessionData,
  businessConfig: BusinessConfigWithDetails | null = null
): Promise<StreamingResponse> {
  // Route to correct provider based on config
  const provider =
    businessConfig?.integration?.llm_provider ||
    businessConfig?.config?.llm_provider ||
    config.llmProvider;

  console.log(`[LLM Streaming] Using provider: ${provider}`);

  if (provider === "anthropic") {
    return processConversationAnthropicStreaming(
      userMessage,
      session,
      businessConfig
    );
  }

  // Default to OpenAI
  const openai = getOpenAIClient(businessConfig);
  const systemPrompt = buildHumanLikeSystemPrompt(businessConfig);

  console.log(
    `[OpenAI Streaming] Processing: "${userMessage.substring(0, 50)}..."`
  );
  console.log(
    `[OpenAI Streaming] History length: ${session.conversationHistory.length}`
  );

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...session.conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage || "(silence)" },
  ];

  try {
    const model =
      businessConfig?.integration?.openai_model ||
      businessConfig?.config?.openai_model ||
      config.openai.model;

    console.log(`[OpenAI Streaming] Using model: ${model}`);

    // Use streaming for faster time-to-first-token
    const stream = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 200,
      stream: true,
    });

    let fullResponse = "";

    // Collect streamed response
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullResponse += content;
    }

    console.log(
      `[OpenAI Streaming] Full response: ${fullResponse.substring(0, 300)}`
    );

    // Parse the JSON response
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(fullResponse);
      console.log(`[OpenAI Streaming] ✅ Parsed JSON successfully`);
    } catch (e) {
      console.log(
        `[OpenAI Streaming] ⚠️ Response is NOT JSON, treating as plain text`
      );
    }

    if (parsedResponse?.status === "complete") {
      console.log(`[OpenAI Streaming] ✅ Status is COMPLETE`);
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

    console.log(`[OpenAI Streaming] ⏳ Status is COLLECTING`);
    return {
      response: parsedResponse?.response || fullResponse,
      isComplete: false,
    };
  } catch (error: any) {
    console.error("[OpenAI Streaming] Error:", error?.message);

    if (error?.status === 401) {
      throw new Error("OpenAI API authentication failed");
    }
    if (error?.status === 429) {
      return {
        response: "I'm experiencing high demand. Please try again in a moment.",
        isComplete: false,
      };
    }

    return {
      response:
        "I'm sorry, I didn't quite catch that. Could you say that again?",
      isComplete: false,
    };
  }
}

/**
 * Process conversation with streaming and callback for each chunk
 * Allows TTS to start before full response is received
 */
export async function processConversationWithChunks(
  userMessage: string,
  session: StreamingSessionData,
  businessConfig: BusinessConfigWithDetails | null = null,
  onChunk?: (chunk: string) => void
): Promise<StreamingResponse> {
  const openai = getOpenAIClient(businessConfig);
  const systemPrompt = buildHumanLikeSystemPrompt(businessConfig);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...session.conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage || "(silence)" },
  ];

  try {
    const model =
      businessConfig?.integration?.openai_model ||
      businessConfig?.config?.openai_model ||
      config.openai.model ||
      "gpt-4o";

    const stream = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 200,
      stream: true,
    });

    let fullResponse = "";
    let buffer = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullResponse += content;
      buffer += content;

      // Emit chunks at sentence boundaries for more natural TTS
      if (onChunk && /[.!?,]/.test(buffer)) {
        onChunk(buffer);
        buffer = "";
      }
    }

    // Emit any remaining buffer
    if (onChunk && buffer.trim()) {
      onChunk(buffer);
    }

    // Parse the full response
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(fullResponse);
    } catch (e) {
      // Not JSON
    }

    if (parsedResponse?.status === "complete") {
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

    return {
      response: parsedResponse?.response || fullResponse,
      isComplete: false,
    };
  } catch (error: any) {
    console.error("[OpenAI Chunks] Error:", error?.message);
    return {
      response:
        "I'm sorry, I didn't quite catch that. Could you say that again?",
      isComplete: false,
    };
  }
}
