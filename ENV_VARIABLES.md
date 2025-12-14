# Environment Variables Reference

## Required Variables (Must Fill In)

These are the **minimum required** variables you need to fill in for the service to work:

### 1. Twilio Credentials (3 variables)

```bash
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

**Where to get:** [Twilio Console](https://console.twilio.com/)

### 2. OpenAI API Key (1 variable)

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

**Where to get:** [OpenAI API Keys](https://platform.openai.com/api-keys)

### 3. Service URL (1 variable)

```bash
SERVICE_URL
```

**Note:** Start with `http://localhost:3000`, then update to your ngrok URL when testing

---

## Optional Variables (Have Defaults)

These have default values but you can customize them:

```bash
PORT                                    # Server port
BUSINESS_NAME                   # Your business name
BUSINESS_TIMEZONE          # Your timezone
APPOINTMENT_DURATION_MINUTES=              # Default appointment length
MINIMUM_NOTICE_HOURS                       # Minimum advance booking time
TEST_MODE                               # Set to false when ready for Google Calendar

# OpenAI Realtime API (for lower latency)
REALTIME_MODE=true                          # Enable OpenAI Realtime API (bypasses Deepgram)
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17  # Realtime model
OPENAI_REALTIME_VOICE=alloy                 # Voice: alloy, echo, shimmer
```

---

## Not Required for Testing (Leave as placeholder)

These are only needed when `TEST_MODE=false`:

```bash
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
```

---

## Quick Checklist

Before running the service, make sure you've filled in:

- [ ] `TWILIO_ACCOUNT_SID` - From Twilio Console dashboard
- [ ] `TWILIO_AUTH_TOKEN` - From Twilio Console (click "View" to reveal)
- [ ] `TWILIO_PHONE_NUMBER` - Your Twilio phone number (format: +1234567890)
- [ ] `OPENAI_API_KEY` - From OpenAI platform
- [ ] `SERVICE_URL` - Your ngrok URL (after starting ngrok)

**Important:** Remove any `your_xxx_here` placeholders or the service will fail to start!

---

## Example .env File (Minimal for Testing)

```bash
# Required
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
OPENAI_API_KEY
SERVICE_URL

# Optional (using defaults)
PORT
BUSINESS_NAME
BUSINESS_TIMEZONE
TEST_MODE
```
