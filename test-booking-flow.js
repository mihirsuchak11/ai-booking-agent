require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// Get service URL from env or use localhost
const SERVICE_URL = process.env.SERVICE_URL || "http://localhost:3000";
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER || "+13642048572";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

if (!supabase) {
  console.warn(
    "⚠️  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Booking verification will be skipped."
  );
}

// Test function to simulate Twilio webhook
async function testTwilioWebhook(endpoint, body) {
  try {
    console.log(`\n📞 Testing: ${endpoint}`);
    console.log(`📤 Request body:`, JSON.stringify(body, null, 2));

    // Convert body to URL-encoded format (Twilio sends form data)
    const params = new URLSearchParams();
    Object.keys(body).forEach((key) => {
      params.append(key, body[key]);
    });

    const response = await axios.post(
      `${SERVICE_URL}${endpoint}`,
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log(`✅ Status: ${response.status}`);
    console.log(`📥 Response (TwiML):`);
    console.log(response.data);

    return response.data;
  } catch (error) {
    console.error(`❌ Error:`, error.response?.data || error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }
    throw error;
  }
}

async function verifyBookingWasCreated(callSid) {
  if (!supabase) {
    console.log(
      "➡️  Skipping verification because Supabase is not configured."
    );
    return;
  }

  console.log(`\n🔎 Verifying booking for CallSid: ${callSid}`);

  const { data: session, error: sessionError } = await supabase
    .from("call_sessions")
    .select("id,status,summary")
    .eq("call_sid", callSid)
    .limit(1)
    .single();

  if (sessionError || !session) {
    console.error("❌ Could not find call session in database.", sessionError);
    return;
  }

  console.log("✅ Call session found:", {
    id: session.id,
    status: session.status,
    summary: session.summary,
  });

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id,start_time,end_time,customer_name,customer_phone")
    .eq("call_session_id", session.id);

  if (bookingsError) {
    console.error("❌ Failed to fetch bookings.", bookingsError);
    return;
  }

  if (!bookings || bookings.length === 0) {
    console.warn("⚠️  No bookings were created for this call session.");
    return;
  }

  console.log(`🎉 Booking(s) found: ${bookings.length}`);
  bookings.forEach((booking, index) => {
    console.log(`   #${index + 1}:`, {
      bookingId: booking.id,
      customer: booking.customer_name,
      phone: booking.customer_phone,
      start: booking.start_time,
      end: booking.end_time,
    });
  });
}

// Simulate full booking conversation
async function testBookingFlow() {
  console.log("🧪 Testing Full Booking Flow via API");
  console.log(`📍 Service URL: ${SERVICE_URL}`);
  console.log(`📱 Twilio Phone: ${TWILIO_PHONE}\n`);

  // Generate a unique test CallSid
  const testCallSid = `CA${Date.now()}${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const testFrom = "+919998886113"; // Your test number
  const testTo = TWILIO_PHONE; // Your actual Twilio number

  try {
    // Step 1: Initial call (incoming webhook)
    console.log("=".repeat(70));
    console.log("STEP 1: Initial Call (Incoming Webhook)");
    console.log("=".repeat(70));

    await testTwilioWebhook("/twilio/voice/incoming", {
      CallSid: testCallSid,
      From: testFrom,
      To: testTo,
      CallStatus: "ringing",
    });

    // Wait for session to be created
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 2: First speech - greeting response
    console.log("\n" + "=".repeat(70));
    console.log("STEP 2: User responds to greeting");
    console.log("=".repeat(70));

    await testTwilioWebhook("/twilio/voice/gather", {
      CallSid: testCallSid,
      SpeechResult: "Hi, I want to book an appointment",
      From: testFrom,
      CallStatus: "in-progress",
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 3: Provide name
    console.log("\n" + "=".repeat(70));
    console.log("STEP 3: User provides name");
    console.log("=".repeat(70));

    await testTwilioWebhook("/twilio/voice/gather", {
      CallSid: testCallSid,
      SpeechResult: "My name is John Doe",
      From: testFrom,
      CallStatus: "in-progress",
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 4: Provide date
    console.log("\n" + "=".repeat(70));
    console.log("STEP 4: User provides date");
    console.log("=".repeat(70));

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await testTwilioWebhook("/twilio/voice/gather", {
      CallSid: testCallSid,
      SpeechResult: `I want to book for ${dateStr}`,
      From: testFrom,
      CallStatus: "in-progress",
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 5: Provide time
    console.log("\n" + "=".repeat(70));
    console.log("STEP 5: User provides time");
    console.log("=".repeat(70));

    await testTwilioWebhook("/twilio/voice/gather", {
      CallSid: testCallSid,
      SpeechResult: "At 2 PM please",
      From: testFrom,
      CallStatus: "in-progress",
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 6: Confirm (if AI asks for confirmation)
    console.log("\n" + "=".repeat(70));
    console.log("STEP 6: User confirms booking");
    console.log("=".repeat(70));

    await testTwilioWebhook("/twilio/voice/gather", {
      CallSid: testCallSid,
      SpeechResult: "Yes, that is correct",
      From: testFrom,
      CallStatus: "in-progress",
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 7: Verify booking in Supabase
    console.log("\n" + "=".repeat(70));
    console.log("STEP 7: Verify booking in Supabase");
    console.log("=".repeat(70));

    await verifyBookingWasCreated(testCallSid);

    console.log("\n" + "=".repeat(70));
    console.log("✅ Booking flow test completed!");
    console.log("=".repeat(70));
    console.log(`\n📋 Test CallSid: ${testCallSid}`);
    console.log(`📋 Check Supabase for:`);
    console.log(`   - call_sessions table: WHERE call_sid = '${testCallSid}'`);
    console.log(
      `   - bookings table: WHERE call_session_id matches the session ID\n`
    );
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    if (error.response) {
      console.error("Response:", error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testBookingFlow();
