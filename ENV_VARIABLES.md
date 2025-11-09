# Environment Variables Reference

## Required Variables (Must Fill In)

These are the **minimum required** variables you need to fill in for the service to work:

### 1. Twilio Credentials (3 variables)

```bash
TWILIO_ACCOUNT_SID=AC_your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_actual_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

**Where to get:** [Twilio Console](https://console.twilio.com/)

### 2. OpenAI API Key (1 variable)

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

**Where to get:** [OpenAI API Keys](https://platform.openai.com/api-keys)

### 3. Service URL (1 variable)

```bash
SERVICE_URL=https://your-ngrok-url.ngrok.io
```

**Note:** Start with `http://localhost:3000`, then update to your ngrok URL when testing

---

## Optional Variables (Have Defaults)

These have default values but you can customize them:

```bash
PORT=3000                                    # Server port
BUSINESS_NAME=My Business                   # Your business name
BUSINESS_TIMEZONE=America/New_York          # Your timezone
APPOINTMENT_DURATION_MINUTES=30              # Default appointment length
MINIMUM_NOTICE_HOURS=2                       # Minimum advance booking time
TEST_MODE=true                               # Set to false when ready for Google Calendar
```

---

## Not Required for Testing (Leave as placeholder)

These are only needed when `TEST_MODE=false`:

```bash
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REFRESH_TOKEN=your_google_refresh_token_here
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
TWILIO_ACCOUNT_SID=AC_your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+15551234567
OPENAI_API_KEY=your_openai_api_key_here
SERVICE_URL=https://abc123.ngrok.io

# Optional (using defaults)
PORT=3000
BUSINESS_NAME=My Business
BUSINESS_TIMEZONE=America/New_York
TEST_MODE=true
```
