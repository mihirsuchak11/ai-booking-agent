# Setup Guide - AI Telecaller Platform

This guide will help you get all the required credentials and set up the service for testing.

## Step 1: Get Twilio Credentials

### 1.1 Create a Twilio Account

1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up for a free trial account (includes $15 credit)
3. Verify your phone number

### 1.2 Get Your Credentials

1. Log into [Twilio Console](https://console.twilio.com/)
2. On the dashboard, you'll see:
   - **Account SID** - Copy this value
   - **Auth Token** - Click "View" to reveal and copy

### 1.3 Get a Phone Number

1. In Twilio Console, go to **Phone Numbers** → **Manage** → **Buy a number**
2. Choose a number (you can get a free trial number)
3. Copy the phone number (format: +1234567890)

### 1.4 Update .env File

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

## Step 2: Get OpenAI API Key

### 2.1 Create OpenAI Account

1. Go to [https://platform.openai.com/](https://platform.openai.com/)
2. Sign up or log in
3. Add payment method (required for API access)

### 2.2 Create API Key

1. Go to [API Keys](https://platform.openai.com/api-keys)
2. Click **"Create new secret key"**
3. Name it (e.g., "telecaller-mvp")
4. **Copy the key immediately** (you won't see it again!)

### 2.3 Update .env File

```bash
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Step 3: Configure Business Settings

Update these in your `.env` file:

```bash
BUSINESS_NAME=My Business
BUSINESS_TIMEZONE=America/New_York
APPOINTMENT_DURATION_MINUTES=30
MINIMUM_NOTICE_HOURS=2
```

### Business Hours (Optional)

If you want custom hours, uncomment and modify `BUSINESS_HOURS_JSON`:

```bash
BUSINESS_HOURS_JSON='{"monday":[{"start":"09:00","end":"17:00"}],"tuesday":[{"start":"09:00","end":"17:00"}],"wednesday":[{"start":"09:00","end":"17:00"}],"thursday":[{"start":"09:00","end":"17:00"}],"friday":[{"start":"09:00","end":"17:00"}],"saturday":[],"sunday":[]}'
```

## Step 4: Install Dependencies

```bash
npm install
```

## Step 5: Start the Server

```bash
npm run dev
```

You should see:

```
🚀 AI Telecaller service running on port 3000
📞 Twilio webhook URL: http://localhost:3000/twilio/voice/incoming
⚠️  TEST MODE ENABLED - Google Calendar integration is bypassed
```

## Step 6: Expose Your Local Server (for Twilio Webhooks)

Since Twilio needs to send webhooks to your server, you need to expose your local server publicly.

### Option A: Using ngrok (Recommended)

1. Install ngrok: [https://ngrok.com/download](https://ngrok.com/download)
2. Sign up for free account and get your authtoken
3. Run:
   ```bash
   ngrok http 3000
   ```
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
5. Update `.env`:
   ```bash
   SERVICE_URL=https://abc123.ngrok.io
   ```

### Option B: Using Twilio CLI (Alternative)

```bash
npm install -g twilio-cli
twilio login
twilio phone-numbers:update +YOUR_TWILIO_NUMBER --voice-url=https://your-ngrok-url.ngrok.io/twilio/voice/incoming
```

## Step 7: Configure Twilio Webhook

1. Go to [Twilio Console](https://console.twilio.com/) → **Phone Numbers** → **Manage** → **Active numbers**
2. Click on your phone number
3. Scroll to **Voice & Fax** section
4. Under **"A CALL COMES IN"**, set:
   - **Webhook**: `https://your-ngrok-url.ngrok.io/twilio/voice/incoming`
   - **HTTP**: `POST`
5. Click **Save**

## Step 8: Test the Call

### Option A: Call from Your Phone (International Calling)

If you're calling from India to a US Twilio number:

1. **Dial the US number** from your Indian phone:

   - Format: `+1` followed by the 10-digit US number
   - Example: If Twilio number is `+15551234567`, dial `+15551234567` or `0015551234567`
   - Check with your carrier for international dialing prefix (usually `00` or `+`)

2. **Cost Considerations:**

   - International calls from India to US typically cost ₹2-5 per minute
   - Twilio charges for incoming calls (varies by country, check [Twilio Pricing](https://www.twilio.com/voice/pricing))
   - For testing, consider using Twilio's test tools (see Option B below)

3. **Make sure:**
   - Your server is running (`npm run dev`)
   - ngrok is running (`ngrok http 3000`)
   - Twilio webhook is configured correctly

### Option B: Use Twilio's Testing Tools (Recommended for Development)

**Better alternative** - Test without making actual phone calls:

#### Method 1: Twilio Console Test Tool

1. Go to [Twilio Console](https://console.twilio.com/) → **Phone Numbers** → Your Number
2. Click **"Test"** button (or use the test tool)
3. Enter a test phone number (any number works for testing)
4. Click **"Make Test Call"**
5. You can hear the call audio and see logs in real-time

#### Method 2: Twilio Studio (Visual Testing)

1. Go to [Twilio Console](https://console.twilio.com/) → **Studio** → **Flows**
2. Create a simple flow that calls your webhook
3. Test the flow without using real phone calls

#### Method 3: Use Twilio's REST API to Make Test Calls

Create a simple test script (we can add this if needed):

```bash
# Test call using Twilio API
curl -X POST https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Calls.json \
  -u YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN \
  --data-urlencode "From=+YOUR_TWILIO_NUMBER" \
  --data-urlencode "To=+YOUR_TEST_NUMBER" \
  --data-urlencode "Url=https://your-ngrok-url.ngrok.io/twilio/voice/incoming"
```

### Option C: Get an Indian Twilio Number (Best for Local Testing)

If you want to test with local calls:

1. Go to [Twilio Console](https://console.twilio.com/) → **Phone Numbers** → **Buy a number**
2. Select **India** as the country
3. Choose an Indian phone number
4. Update `TWILIO_PHONE_NUMBER` in `.env` with the Indian number
5. Call from your Indian phone (local call, much cheaper!)

**Note:** Indian Twilio numbers may have different capabilities/restrictions compared to US numbers.

## Testing Mode

Currently, `TEST_MODE=true` is set in `.env`. This means:

- ✅ Business hours validation works
- ✅ Minimum notice validation works
- ✅ AI conversation works
- ✅ Booking confirmation works
- ❌ Google Calendar integration is bypassed (no actual calendar entries)

When you're ready to enable Google Calendar:

1. Set `TEST_MODE=false` in `.env`
2. Follow the Google Calendar setup guide (to be added later)

## Troubleshooting

### "Missing required environment variable"

- Make sure all required variables in `.env` are filled
- Remove any `your_xxx_here` placeholders

### "Cannot connect to Twilio"

- Check your Account SID and Auth Token
- Make sure they don't have extra spaces

### "OpenAI API error"

- Verify your API key is correct
- Check your OpenAI account has credits
- Make sure payment method is added

### "Twilio webhook not working"

- Verify `SERVICE_URL` in `.env` matches your ngrok URL
- Make sure ngrok is running
- Check Twilio webhook URL is set correctly
- Test webhook URL in browser: `https://your-url.ngrok.io/health` should return `{"status":"ok"}`

### Call connects but no response

- Check server logs for errors
- Verify OpenAI API key is working
- Make sure speech recognition is enabled in Twilio

## Next Steps

Once testing works:

1. Test business hours validation (try booking outside hours)
2. Test minimum notice (try booking too soon)
3. Test full conversation flow
4. When ready, set up Google Calendar integration
