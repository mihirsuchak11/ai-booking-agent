require('dotenv').config();
const twilio = require('twilio');

// Validate environment variables
const requiredVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'SERVICE_URL'];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.error(`❌ Missing environment variable: ${varName}`);
    process.exit(1);
  }
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const serviceUrl = process.env.SERVICE_URL;

// Initialize Twilio client
const client = twilio(accountSid, authToken);

// Test number - can be any number (doesn't need to be real for testing)
const toNumber = process.argv[2] || '+919876543210'; // Default: Indian test number

console.log('🔄 Making test call...');
console.log(`   From: ${fromNumber}`);
console.log(`   To: ${toNumber}`);
console.log(`   Webhook: ${serviceUrl}/twilio/voice/incoming`);
console.log('');

client.calls
  .create({
    url: `${serviceUrl}/twilio/voice/incoming`,
    to: toNumber,
    from: fromNumber,
  })
  .then(call => {
    console.log('✅ Call created successfully!');
    console.log(`   Call SID: ${call.sid}`);
    console.log(`   Status: ${call.status}`);
    console.log('');
    console.log('📞 The AI should now answer and collect appointment details.');
    console.log('   Check your server logs to see the conversation.');
    console.log('');
  })
  .catch(error => {
    console.error('❌ Error creating call:');
    console.error(error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    process.exit(1);
  });

