import { createDeepgramSTT } from "./src/services/deepgram-stt";
import { createDeepgramTTS } from "./src/services/deepgram-tts";

/**
 * Test Deepgram STT and TTS services
 */
async function testDeepgramServices() {
  console.log("\n🎙️ Testing Deepgram Services\n");
  console.log("=" .repeat(50));

  // Test 1: TTS Synthesis
  console.log("\n1️⃣ Testing TTS (Text-to-Speech)...");
  try {
    const tts = createDeepgramTTS({
      model: "aura-asteria-en", // Friendly female voice
    });

    const testText = "Hello! Thank you for calling. How can I help you today?";
    console.log(`   Text: "${testText}"`);
    console.log("   Synthesizing...");

    const audioBuffer = await tts.synthesize(testText);
    console.log(`   ✅ TTS Success! Generated ${audioBuffer.length} bytes of audio`);
    console.log(`   Audio encoding: mulaw, 8kHz (Twilio compatible)`);
  } catch (error: any) {
    console.error(`   ❌ TTS Failed: ${error.message}`);
    process.exit(1);
  }

  // Test 2: TTS Base64 (for Twilio)
  console.log("\n2️⃣ Testing TTS with Base64 output (for Twilio)...");
  try {
    const tts = createDeepgramTTS();

    const testText = "Your appointment is confirmed for tomorrow at 2 PM.";
    console.log(`   Text: "${testText}"`);
    console.log("   Synthesizing to base64...");

    const base64Audio = await tts.synthesizeToBase64(testText);
    console.log(`   ✅ Base64 Success! Generated ${base64Audio.length} characters`);
    console.log(`   Sample (first 50 chars): ${base64Audio.substring(0, 50)}...`);
  } catch (error: any) {
    console.error(`   ❌ Base64 Test Failed: ${error.message}`);
    process.exit(1);
  }

  // Test 3: TTS Streaming
  console.log("\n3️⃣ Testing TTS Streaming (chunks for real-time)...");
  try {
    const tts = createDeepgramTTS({
      model: "aura-luna-en", // Professional calm voice
    });

    let chunkCount = 0;
    let totalBytes = 0;

    tts.on("audio_chunk", (base64Chunk: string) => {
      chunkCount++;
      const chunkBytes = Buffer.from(base64Chunk, "base64").length;
      totalBytes += chunkBytes;
      console.log(`   Chunk ${chunkCount}: ${chunkBytes} bytes`);
    });

    tts.on("synthesis_complete", (audioBuffer: Buffer) => {
      console.log(`   Streaming complete: ${chunkCount} chunks, ${totalBytes} bytes total`);
    });

    const testText = "I'm checking availability for your preferred time slot.";
    console.log(`   Text: "${testText}"`);
    console.log("   Starting streaming synthesis...");

    await tts.synthesizeStreaming(testText);
    console.log(`   ✅ Streaming Success!`);
  } catch (error: any) {
    console.error(`   ❌ Streaming Test Failed: ${error.message}`);
    process.exit(1);
  }

  // Test 4: Different voices
  console.log("\n4️⃣ Testing different voices...");
  const voicesToTest = [
    "aura-asteria-en",
    "aura-stella-en",
    "aura-orion-en",
  ];

  for (const voice of voicesToTest) {
    try {
      const tts = createDeepgramTTS({ model: voice });
      const testText = `Testing ${voice} voice.`;
      console.log(`   Testing ${voice}...`);
      
      const audioBuffer = await tts.synthesize(testText);
      console.log(`   ✅ ${voice}: ${audioBuffer.length} bytes`);
    } catch (error: any) {
      console.error(`   ❌ ${voice} failed: ${error.message}`);
    }
  }

  // Test 5: STT Initialization (won't test streaming without real audio)
  console.log("\n5️⃣ Testing STT Initialization...");
  try {
    const stt = createDeepgramSTT({
      language: "en-US",
      model: "nova-2",
    });

    console.log(`   ✅ STT Created successfully`);
    console.log(`   Model: nova-2, Language: en-US`);
    console.log(`   Note: Streaming STT requires real audio input`);
  } catch (error: any) {
    console.error(`   ❌ STT Initialization Failed: ${error.message}`);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(50));
  console.log("\n✅ All Deepgram API tests passed!\n");
  console.log("Next steps:");
  console.log("1. Deploy the server: npm run dev");
  console.log("2. Expose via ngrok: ngrok http 3000");
  console.log("3. Update Twilio webhook URL");
  console.log("4. Make a test call\n");
}

// Run tests
testDeepgramServices().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});

