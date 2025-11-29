# Testing Deepgram Integration

## Prerequisites

### 1. Get Your Deepgram API Key

1. Go to https://console.deepgram.com
2. Sign up or log in
3. Click on **API Keys** (in left sidebar)
4. Click **Create New API Key**
5. Name it (e.g., "Booking Agent")
6. Select scope: **Full Access**
7. Copy the API key

### 2. Set Environment Variables

Create or update your `.env` file in the project root:

```bash
# Deepgram (required)
DEEPGRAM_API_KEY=your_api_key_here

# Optional: customize models and language
DEEPGRAM_STT_MODEL=nova-2
DEEPGRAM_TTS_MODEL=aura-asteria-en
DEEPGRAM_LANGUAGE=en-US

# Other required vars (from existing setup)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
OPENAI_API_KEY=your_openai_api_key
SERVICE_URL=http://localhost:3000

# For testing without Google Calendar
TEST_MODE=true
```

## Testing Steps

### Step 1: Test Deepgram API Connection

```bash
npm run test:deepgram
```

This will:

- ✅ Test TTS synthesis (basic)
- ✅ Test TTS with Base64 output (Twilio format)
- ✅ Test TTS streaming (real-time chunks)
- ✅ Test different voice models
- ✅ Test STT initialization

**Expected output:**

```
🎙️ Testing Deepgram Services

==================================================

1️⃣ Testing TTS (Text-to-Speech)...
   Text: "Hello! Thank you for calling. How can I help you today?"
   Synthesizing...
   ✅ TTS Success! Generated 4812 bytes of audio
   Audio encoding: mulaw, 8kHz (Twilio compatible)

2️⃣ Testing TTS with Base64 output (for Twilio)...
   Text: "Your appointment is confirmed for tomorrow at 2 PM."
   Synthesizing to base64...
   ✅ Base64 Success! Generated 6428 characters
   Sample (first 50 chars): kICAiIiIiICAiICAiICAiICAiICAiICAiICAiICAiICAi...

... (more tests)

✅ All Deepgram API tests passed!
```

### Step 2: Test Full Voice Pipeline

Once API tests pass:

```bash
npm run dev
```

This starts the server on `http://localhost:3000`

### Step 3: Expose Server to Internet (for Twilio)

In a new terminal:

```bash
ngrok http 3000
```

This gives you a public URL like: `https://abc123.ngrok.io`

### Step 4: Update Twilio Webhook

1. Go to https://console.twilio.com
2. Click **Phone Numbers** → select your number
3. Under **Voice Configuration**, set:
   - **Webhook URL**: `https://abc123.ngrok.io/twilio/voice/incoming`
   - **HTTP method**: `POST`
4. Click **Save**

### Step 5: Make a Test Call

Call your Twilio phone number from any phone!

**What you should hear:**

1. Greeting from AI (using Deepgram Aura voice)
2. AI asks for your name
3. You say your name
4. AI asks for appointment date/time
5. After collecting info, AI confirms and books

## Troubleshooting

### `DEEPGRAM_API_KEY` is missing error

- Check your `.env` file has the correct key
- Make sure you copied the entire API key (not partial)
- Restart the server after updating `.env`

### "TTS Failed" in test

- Verify API key is valid
- Check if Deepgram account is active (not trial expired)
- Try getting a fresh API key from console.deepgram.com

### No audio from Twilio call

- Check server logs for Deepgram TTS errors
- Verify `STREAMING_MODE=true` (or not set, defaults to true)
- Make sure ngrok tunnel is still active
- Check Twilio webhook settings

### Slow response time

- Normal: First response takes ~500ms-1s (STT → LLM → TTS)
- If slower: check Deepgram and OpenAI API status
- Consider upgrading Deepgram plan for higher rate limits

## Available Deepgram Aura Voices

### Female Voices

- `aura-asteria-en` - Friendly, conversational (default)
- `aura-luna-en` - Calm, professional
- `aura-stella-en` - Warm, approachable
- `aura-athena-en` - Clear, authoritative
- `aura-hera-en` - Confident, mature

### Male Voices

- `aura-perseus-en` - Clear, conversational
- `aura-orion-en` - Deep, professional
- `aura-arcas-en` - Friendly, young
- `aura-angus-en` - Warm, mature
- `aura-orpheus-en` - Rich, expressive
- `aura-helios-en` - Energetic, dynamic
- `aura-zeus-en` - Powerful, commanding

Try different voices by setting:

```bash
DEEPGRAM_TTS_MODEL=aura-luna-en
```

## Production Checklist

- [ ] API key is in environment variables (not hardcoded)
- [ ] `STREAMING_MODE=true` for production
- [ ] All environment variables are set
- [ ] Twilio webhook URL is correct
- [ ] Server is deployed (not just local ngrok)
- [ ] Error handling is in place
- [ ] Monitoring/logging is set up

## Resources

- Deepgram Docs: https://developers.deepgram.com
- Deepgram Discord: https://discord.gg/deepgram
- Twilio Docs: https://www.twilio.com/docs/voice
- Test Deepgram voices: https://deepgram.com/product/text-to-speech
