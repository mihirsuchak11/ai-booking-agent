# Environment Variables Reference

## Required Variables (Must Fill In)

These are the **minimum required** variables you need to fill in for the service to work:

### 1. Twilio Credentials (3 variables)

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

**Where to get:** [Twilio Console](https://console.twilio.com/)

### 2. OpenAI API Key (1 variable)

```bash
OPENAI_API_KEY=sk-...
```

**Where to get:** [OpenAI API Keys](https://platform.openai.com/api-keys)

### 3. Service URL (1 variable)

```bash
SERVICE_URL=
```

**Note:** Start with `http://localhost:3000`, then update to your ngrok URL when testing (e.g., `https://abcdef.ngrok-free.app`).

---

## Optional Variables (Have Defaults)

These have default values but you can customize them:

```bash
PORT=3000                                 # Server port
BUSINESS_NAME=Business                    # Your business name
BUSINESS_TIMEZONE=America/New_York        # Your timezone
APPOINTMENT_DURATION_MINUTES=30           # Default appointment length in minutes
MINIMUM_NOTICE_HOURS=2                    # Minimum advance booking time in hours

# OpenAI Realtime API Settings
OPENAI_MODEL=gpt-4o-mini                   # Model for non-streaming logic
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17  # Streaming model
OPENAI_REALTIME_VOICE=alloy                # Options: alloy, echo, shimmer
```

### Database (Optional)

If using Supabase for persistent storage:
```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Example .env File

```bash
# Required
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890
OPENAI_API_KEY=sk-...
SERVICE_URL=https://your-ngrok-url.app

# Optional Customization
BUSINESS_NAME="My AI Clinic"
BUSINESS_TIMEZONE="America/Los_Angeles"
```
