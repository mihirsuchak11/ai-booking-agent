# API Testing Guide

Test the AI Booking Agent API endpoints without making actual phone calls.

## Quick Test with cURL

### 1. Test Health Check
```bash
curl https://ai-booking-agent-teal.vercel.app/health
```

### 2. Test Initial Call (Incoming Webhook)
```bash
curl -X POST https://ai-booking-agent-teal.vercel.app/twilio/voice/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123456789" \
  -d "From=+1234567890" \
  -d "To=+0987654321" \
  -d "CallStatus=ringing"
```

### 3. Test Speech Input (First Message)
```bash
curl -X POST https://ai-booking-agent-teal.vercel.app/twilio/voice/gather \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123456789" \
  -d "SpeechResult=Hi, I want to book an appointment" \
  -d "From=+1234567890" \
  -d "CallStatus=in-progress"
```

### 4. Test Providing Name
```bash
curl -X POST https://ai-booking-agent-teal.vercel.app/twilio/voice/gather \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123456789" \
  -d "SpeechResult=My name is John Doe" \
  -d "From=+1234567890" \
  -d "CallStatus=in-progress"
```

### 5. Test Providing Date/Time
```bash
curl -X POST https://ai-booking-agent-teal.vercel.app/twilio/voice/gather \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123456789" \
  -d "SpeechResult=I want to book for tomorrow at 2 PM" \
  -d "From=+1234567890" \
  -d "CallStatus=in-progress"
```

**Important:** Use the same `CallSid` for all requests in a conversation to maintain session state.

## Test with Node.js Script

### Install axios (if not already installed)
```bash
npm install axios
```

### Run the test script
```bash
# For local testing
npm run test:api

# For Vercel testing (set SERVICE_URL in .env)
SERVICE_URL=https://ai-booking-agent-teal.vercel.app npm run test:api
```

The script will:
1. Test the initial call webhook
2. Simulate a conversation flow
3. Show all TwiML responses
4. Display any errors

## Testing Locally

If testing against localhost:

```bash
# Start local server
npm run dev

# In another terminal, run tests
SERVICE_URL=http://localhost:3000 npm run test:api
```

## What to Look For

### ✅ Success Indicators:
- TwiML XML responses with `<Say>` and `<Gather>` elements
- AI-generated responses (not just error messages)
- Different responses for different inputs

### ❌ Error Indicators:
- "I'm sorry, I'm having trouble processing that" - OpenAI API issue
- "I'm sorry, there was an error" - Session/configuration issue
- HTML error pages - Route/endpoint issue
- Empty responses - Server crash

## Debugging Tips

1. **Check Vercel Logs:**
   - Go to Vercel Dashboard → Your Project → Functions → View logs
   - Look for console.log outputs and errors

2. **Verify Environment Variables:**
   - `OPENAI_API_KEY` must be set correctly
   - `SERVICE_URL` should match your deployment URL

3. **Test Step by Step:**
   - Start with health check
   - Then test incoming webhook
   - Then test speech input one at a time

4. **Check Session State:**
   - Use the same `CallSid` for related requests
   - Sessions are stored in memory (will reset on server restart)

