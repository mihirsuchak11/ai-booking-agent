require('dotenv').config();
const axios = require('axios');

// Get service URL from env or use localhost
const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:3000';

// Test function to simulate Twilio webhook
async function testTwilioWebhook(endpoint, body) {
  try {
    console.log(`\n📞 Testing: ${endpoint}`);
    console.log(`📤 Request body:`, JSON.stringify(body, null, 2));
    
    // Convert body to URL-encoded format (Twilio sends form data)
    const params = new URLSearchParams();
    Object.keys(body).forEach(key => {
      params.append(key, body[key]);
    });
    
    const response = await axios.post(`${SERVICE_URL}${endpoint}`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
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

// Test scenarios
async function runTests() {
  console.log('🧪 Testing AI Booking Agent API');
  console.log(`📍 Service URL: ${SERVICE_URL}\n`);

  // Generate a test CallSid
  const testCallSid = `CA${Date.now()}`;
  const testFrom = '+1234567890';
  const testTo = '+0987654321';

  try {
    // Test 1: Initial call (incoming webhook)
    console.log('='.repeat(60));
    console.log('TEST 1: Initial Call (Incoming Webhook)');
    console.log('='.repeat(60));
    
    await testTwilioWebhook('/twilio/voice/incoming', {
      CallSid: testCallSid,
      From: testFrom,
      To: testTo,
      CallStatus: 'ringing',
    });

    // Wait a bit for session to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: First speech input
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: First Speech Input');
    console.log('='.repeat(60));
    
    await testTwilioWebhook('/twilio/voice/gather', {
      CallSid: testCallSid,
      SpeechResult: 'Hi, I want to book an appointment',
      From: testFrom,
      CallStatus: 'in-progress',
    });

    // Wait for OpenAI processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Provide name
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: Providing Name');
    console.log('='.repeat(60));
    
    await testTwilioWebhook('/twilio/voice/gather', {
      CallSid: testCallSid,
      SpeechResult: 'My name is John Doe',
      From: testFrom,
      CallStatus: 'in-progress',
    });

    // Wait for OpenAI processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: Provide date and time
    console.log('\n' + '='.repeat(60));
    console.log('TEST 4: Providing Date and Time');
    console.log('='.repeat(60));
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    await testTwilioWebhook('/twilio/voice/gather', {
      CallSid: testCallSid,
      SpeechResult: `I want to book for tomorrow at 2 PM`,
      From: testFrom,
      CallStatus: 'in-progress',
    });

    // Test 5: Health check
    console.log('\n' + '='.repeat(60));
    console.log('TEST 5: Health Check');
    console.log('='.repeat(60));
    
    try {
      const healthResponse = await axios.get(`${SERVICE_URL}/health`);
      console.log('✅ Health check passed:', healthResponse.data);
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Check if axios is installed
try {
  require.resolve('axios');
} catch (e) {
  console.error('❌ axios is not installed. Installing...');
  console.log('Run: npm install axios');
  process.exit(1);
}

// Run tests
runTests();

