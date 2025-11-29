const axios = require("axios");
const FormData = require("form-data");

// Configuration
const SERVICE_URL = process.env.SERVICE_URL || "http://localhost:3000";
const TEST_PHONE = process.env.TEST_PHONE || "+1234567890";
const TEST_BUSINESS_PHONE = process.env.TEST_BUSINESS_PHONE || "+1987654321";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${step} ${message}`, colors.cyan);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

/**
 * Simulate Twilio webhook POST request
 */
async function postTwilioWebhook(endpoint, params) {
  const formData = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    formData.append(key, value);
  });

  try {
    const response = await axios.post(`${SERVICE_URL}${endpoint}`, formData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      maxRedirects: 0,
      validateStatus: (status) => status < 400, // Accept redirects
    });

    return {
      status: response.status,
      data: response.data,
      headers: response.headers,
    };
  } catch (error) {
    if (error.response) {
      return {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers,
      };
    }
    throw error;
  }
}

/**
 * Parse TwiML response
 */
function parseTwiML(xml) {
  const result = {
    says: [],
    gathers: [],
    redirects: [],
    hangsUp: false,
    connects: [],
  };

  // Extract <Say> elements
  const sayMatches = xml.match(/<Say[^>]*>(.*?)<\/Say>/gs);
  if (sayMatches) {
    sayMatches.forEach((match) => {
      const text = match.replace(/<[^>]*>/g, "").trim();
      result.says.push(text);
    });
  }

  // Extract <Gather> elements
  if (xml.includes("<Gather")) {
    result.gathers.push({
      action: xml.match(/action="([^"]+)"/)?.[1] || "",
      method: xml.match(/method="([^"]+)"/)?.[1] || "POST",
    });
  }

  // Extract <Redirect> elements
  const redirectMatches = xml.match(/<Redirect[^>]*>([^<]+)<\/Redirect>/g);
  if (redirectMatches) {
    redirectMatches.forEach((match) => {
      const url = match.replace(/<[^>]*>/g, "").trim();
      result.redirects.push(url);
    });
  }

  // Check for hangup
  result.hangsUp = xml.includes("<Hangup");

  // Check for <Connect><Stream>
  if (xml.includes("<Connect>") && xml.includes("<Stream")) {
    const streamUrl = xml.match(/url="([^"]+)"/)?.[1] || "";
    result.connects.push({ type: "stream", url: streamUrl });
  }

  return result;
}

/**
 * Test 1: Health Check
 */
async function testHealthCheck() {
  logStep("1️⃣", "Testing health check endpoint...");

  try {
    const response = await axios.get(`${SERVICE_URL}/health`);
    logSuccess(`Health check passed: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    logError(`Health check failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Incoming Call (First Contact)
 */
async function testIncomingCall() {
  logStep("2️⃣", "Testing incoming call webhook...");

  const callSid = `CA${Date.now()}`;
  const params = {
    CallSid: callSid,
    From: TEST_PHONE,
    To: TEST_BUSINESS_PHONE,
    CallStatus: "ringing",
  };

  try {
    const response = await postTwilioWebhook("/twilio/voice/incoming", params);
    
    if (response.status !== 200) {
      logError(`Unexpected status: ${response.status}`);
      return { success: false, callSid: null };
    }

    const twiml = parseTwiML(response.data);
    
    logInfo(`Response status: ${response.status}`);
    logInfo(`TwiML elements:`);
    logInfo(`  - Says: ${twiml.says.length}`);
    logInfo(`  - Gathers: ${twiml.gathers.length}`);
    logInfo(`  - Redirects: ${twiml.redirects.length}`);
    logInfo(`  - Connects: ${twiml.connects.length}`);
    logInfo(`  - Hangs up: ${twiml.hangsUp}`);

    if (twiml.redirects.length > 0) {
      logSuccess(`Redirecting to: ${twiml.redirects[0]}`);
    } else if (twiml.connects.length > 0) {
      logSuccess(`Connecting to stream: ${twiml.connects[0].url}`);
    } else if (twiml.hangsUp) {
      logError("Call was hung up immediately!");
      return { success: false, callSid };
    } else {
      logError("Unexpected TwiML response");
      return { success: false, callSid };
    }

    return { success: true, callSid, twiml };
  } catch (error) {
    logError(`Incoming call test failed: ${error.message}`);
    return { success: false, callSid: null };
  }
}

/**
 * Test 3: First Gather (Greeting)
 */
async function testFirstGather(callSid) {
  logStep("3️⃣", "Testing first gather (should send greeting)...");

  const params = {
    CallSid: callSid,
    From: TEST_PHONE,
    To: TEST_BUSINESS_PHONE,
    SpeechResult: "", // Empty - should trigger greeting
  };

  try {
    const response = await postTwilioWebhook("/twilio/voice/gather", params);
    const twiml = parseTwiML(response.data);

    logInfo(`Response status: ${response.status}`);
    
    if (twiml.says.length > 0) {
      logSuccess(`Greeting sent: "${twiml.says[0].substring(0, 100)}..."`);
    } else {
      logError("No greeting found in response!");
      return { success: false };
    }

    if (twiml.gathers.length > 0) {
      logSuccess(`Gather configured - waiting for user input`);
    } else {
      logError("No gather found - call might hang up!");
      return { success: false };
    }

    return { success: true, twiml };
  } catch (error) {
    logError(`First gather test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Test 4: User Provides Name
 */
async function testUserProvidesName(callSid) {
  logStep("4️⃣", "Testing user provides name...");

  const params = {
    CallSid: callSid,
    From: TEST_PHONE,
    To: TEST_BUSINESS_PHONE,
    SpeechResult: "My name is John Smith",
  };

  try {
    const response = await postTwilioWebhook("/twilio/voice/gather", params);
    const twiml = parseTwiML(response.data);

    logInfo(`Response status: ${response.status}`);
    
    if (twiml.says.length > 0) {
      logSuccess(`AI response: "${twiml.says[0].substring(0, 100)}..."`);
    }

    if (twiml.gathers.length > 0) {
      logSuccess(`Continuing conversation - waiting for more input`);
    } else if (twiml.hangsUp) {
      logError("Call ended unexpectedly!");
      return { success: false };
    }

    return { success: true, twiml };
  } catch (error) {
    logError(`Name test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Test 5: User Provides Date
 */
async function testUserProvidesDate(callSid) {
  logStep("5️⃣", "Testing user provides appointment date...");

  const params = {
    CallSid: callSid,
    From: TEST_PHONE,
    To: TEST_BUSINESS_PHONE,
    SpeechResult: "I'd like to book for tomorrow at 2 PM",
  };

  try {
    const response = await postTwilioWebhook("/twilio/voice/gather", params);
    const twiml = parseTwiML(response.data);

    logInfo(`Response status: ${response.status}`);
    
    if (twiml.says.length > 0) {
      logSuccess(`AI response: "${twiml.says[0].substring(0, 100)}..."`);
    }

    if (twiml.gathers.length > 0) {
      logSuccess(`Continuing conversation`);
    } else if (twiml.hangsUp) {
      logInfo("Call ended - might be booking complete or error");
    }

    return { success: true, twiml };
  } catch (error) {
    logError(`Date test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Test 6: User Confirms Booking
 */
async function testUserConfirms(callSid) {
  logStep("6️⃣", "Testing user confirms booking...");

  const params = {
    CallSid: callSid,
    From: TEST_PHONE,
    To: TEST_BUSINESS_PHONE,
    SpeechResult: "Yes, that's correct",
  };

  try {
    const response = await postTwilioWebhook("/twilio/voice/gather", params);
    const twiml = parseTwiML(response.data);

    logInfo(`Response status: ${response.status}`);
    
    if (twiml.says.length > 0) {
      logSuccess(`Final response: "${twiml.says[0]}"`);
    }

    if (twiml.hangsUp) {
      logSuccess("Call ended - booking likely completed");
    } else {
      logInfo("Call still active - might need more information");
    }

    return { success: true, twiml };
  } catch (error) {
    logError(`Confirmation test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Test 7: Empty Speech Retry
 */
async function testEmptySpeechRetry(callSid) {
  logStep("7️⃣", "Testing empty speech retry handling...");

  const params = {
    CallSid: callSid,
    From: TEST_PHONE,
    To: TEST_BUSINESS_PHONE,
    SpeechResult: "", // Empty again
  };

  try {
    const response = await postTwilioWebhook("/twilio/voice/gather", params);
    const twiml = parseTwiML(response.data);

    logInfo(`Response status: ${response.status}`);
    
    if (twiml.says.length > 0) {
      logSuccess(`Retry message: "${twiml.says[0].substring(0, 80)}..."`);
    }

    if (twiml.gathers.length > 0) {
      logSuccess("Still listening - retry handled correctly");
    } else if (twiml.hangsUp) {
      logInfo("Call ended after retries (expected after 3 attempts)");
    }

    return { success: true, twiml };
  } catch (error) {
    logError(`Retry test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Test 8: Call Status Update
 */
async function testCallStatus(callSid) {
  logStep("8️⃣", "Testing call status webhook...");

  const params = {
    CallSid: callSid,
    CallStatus: "completed",
  };

  try {
    const response = await postTwilioWebhook("/twilio/voice/status", params);
    
    if (response.status === 200) {
      logSuccess("Call status updated successfully");
      return true;
    } else {
      logError(`Unexpected status: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Status test failed: ${error.message}`);
    return false;
  }
}

/**
 * Full Conversation Flow Test
 */
async function testFullConversationFlow() {
  log("\n" + "=".repeat(60), colors.bright);
  log("🎙️  FULL VOICE FLOW TEST", colors.bright);
  log("=".repeat(60), colors.bright);

  // Step 1: Health check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    logError("Health check failed - aborting tests");
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  // Step 2: Incoming call
  const incomingResult = await testIncomingCall();
  if (!incomingResult.success || !incomingResult.callSid) {
    logError("Incoming call failed - aborting tests");
    return;
  }

  const callSid = incomingResult.callSid;
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Step 3: First gather (greeting)
  const greetingResult = await testFirstGather(callSid);
  if (!greetingResult.success) {
    logError("Greeting failed - aborting tests");
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Step 4: User provides name
  await testUserProvidesName(callSid);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Step 5: User provides date/time
  await testUserProvidesDate(callSid);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Step 6: User confirms
  await testUserConfirms(callSid);
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Step 7: Call status
  await testCallStatus(callSid);

  log("\n" + "=".repeat(60), colors.bright);
  logSuccess("Full conversation flow test completed!");
  log("=".repeat(60) + "\n", colors.bright);
}

/**
 * Quick Test (Just greeting)
 */
async function testQuickFlow() {
  log("\n" + "=".repeat(60), colors.bright);
  log("⚡ QUICK TEST (Greeting Only)", colors.bright);
  log("=".repeat(60), colors.bright);

  const healthOk = await testHealthCheck();
  if (!healthOk) return;

  await new Promise((resolve) => setTimeout(resolve, 500));

  const incomingResult = await testIncomingCall();
  if (!incomingResult.success || !incomingResult.callSid) return;

  await new Promise((resolve) => setTimeout(resolve, 500));

  await testFirstGather(incomingResult.callSid);

  log("\n" + "=".repeat(60), colors.bright);
  logSuccess("Quick test completed!");
  log("=".repeat(60) + "\n", colors.bright);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || "full";

  log(`\n📍 Service URL: ${SERVICE_URL}`, colors.yellow);
  log(`📞 Test Phone: ${TEST_PHONE}`, colors.yellow);
  log(`🏢 Business Phone: ${TEST_BUSINESS_PHONE}`, colors.yellow);

  try {
    if (testType === "quick") {
      await testQuickFlow();
    } else if (testType === "full") {
      await testFullConversationFlow();
    } else {
      logError(`Unknown test type: ${testType}`);
      logInfo("Usage: node test-voice-flow.js [quick|full]");
      process.exit(1);
    }
  } catch (error) {
    logError(`Test suite failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  testHealthCheck,
  testIncomingCall,
  testFirstGather,
  testUserProvidesName,
  testUserProvidesDate,
  testUserConfirms,
  testFullConversationFlow,
  testQuickFlow,
};

