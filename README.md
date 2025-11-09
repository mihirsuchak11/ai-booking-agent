# AI Telecaller Platform - MVP

AI-powered telecaller service that handles phone calls, collects appointment details, and books appointments on Google Calendar.

## Quick Start

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in your credentials** in `.env` file (see [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed instructions):
   - Twilio Account SID, Auth Token, and Phone Number
   - OpenAI API Key
   - Business configuration (optional)

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the server:**
   ```bash
   npm run dev
   ```

5. **Expose your local server** (for Twilio webhooks):
   ```bash
   # Install ngrok: https://ngrok.com/download
   ngrok http 3000
   ```

6. **Update `.env`** with your ngrok URL:
   ```bash
   SERVICE_URL=https://your-ngrok-url.ngrok.io
   ```

7. **Configure Twilio webhook** to point to your ngrok URL (see SETUP_GUIDE.md)

8. **Test by calling your Twilio phone number!**

📖 **For detailed setup instructions, see [SETUP_GUIDE.md](./SETUP_GUIDE.md)**

🌍 **Calling from India?** See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for international calling options and free testing alternatives.

## Environment Variables

### Required Variables
- `TWILIO_ACCOUNT_SID` - Your Twilio Account SID
- `TWILIO_AUTH_TOKEN` - Your Twilio Auth Token
- `TWILIO_PHONE_NUMBER` - Your Twilio phone number (e.g., +1234567890)
- `OPENAI_API_KEY` - Your OpenAI API key
- `GOOGLE_CLIENT_ID` - Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth Client Secret
- `GOOGLE_REFRESH_TOKEN` - Google OAuth Refresh Token
- `SERVICE_URL` - Public URL for Twilio webhooks (e.g., https://your-domain.com)

### Optional Business Configuration
- `BUSINESS_NAME` - Your business name (default: "Business")
- `BUSINESS_TIMEZONE` - Business timezone (default: "America/New_York")
- `BUSINESS_HOURS_JSON` - Custom business hours in JSON format (see below)
- `APPOINTMENT_DURATION_MINUTES` - Default appointment duration (default: 30)
- `MINIMUM_NOTICE_HOURS` - Minimum hours in advance for booking (default: 2)

### Business Hours Format

If not provided, defaults to Monday-Friday 9 AM - 5 PM. To customize, set `BUSINESS_HOURS_JSON`:

```json
{
  "monday": [{"start": "09:00", "end": "17:00"}],
  "tuesday": [{"start": "09:00", "end": "17:00"}],
  "wednesday": [{"start": "09:00", "end": "17:00"}],
  "thursday": [{"start": "09:00", "end": "17:00"}],
  "friday": [{"start": "09:00", "end": "17:00"}],
  "saturday": [{"start": "10:00", "end": "14:00"}],
  "sunday": []
}
```

You can have multiple time slots per day (e.g., lunch break).

## Architecture

- **Twilio**: Handles voice calls and webhooks
- **OpenAI**: Powers the conversation AI
- **Google Calendar**: Manages appointment bookings
- **In-memory sessions**: Tracks conversation state per call

## API Endpoints

- `POST /twilio/voice/incoming` - Twilio webhook for incoming calls
- `POST /twilio/voice/gather` - Twilio webhook for speech input
- `POST /twilio/voice/status` - Twilio webhook for call status updates
- `GET /health` - Health check endpoint

