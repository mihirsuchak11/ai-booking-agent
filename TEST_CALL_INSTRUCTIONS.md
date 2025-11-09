# Test Call Instructions

This guide shows how to make a test call using the Twilio REST API.

## Prerequisites

1. **Server running:**
   ```bash
   npm run dev
   ```

2. **ngrok running** (in another terminal):
   ```bash
   ngrok http 3000
   ```

3. **Update `.env`** with your ngrok URL:
   ```bash
   SERVICE_URL=https://your-ngrok-url.ngrok.io
   ```

4. **Verify Twilio credentials in `.env`:**
   - `TWILIO_ACCOUNT_SID` ✅
   - `TWILIO_AUTH_TOKEN` ✅
   - `TWILIO_PHONE_NUMBER` ✅

## Make a Test Call

### Option 1: Use Default Test Number

```bash
node test-call.js
```

This will:
- Call the default test number: `+919876543210` (Indian number)
- Use your Twilio number as sender
- Trigger your AI webhook
- You'll see the call ID in console

### Option 2: Use Custom Phone Number

```bash
node test-call.js +919999888777
```

Or any other number:
```bash
node test-call.js +15551234567
```

## What Happens

1. **Script runs** → Creates a Twilio call
2. **Twilio calls** → The number you specified
3. **Webhook triggered** → Your server receives the call
4. **AI answers** → Greeting is played
5. **Call logs** → Check your terminal to see conversation

## Expected Output

### In the script terminal:
```
🔄 Making test call...
   From: +1234567890
   To: +919876543210
   Webhook: https://abc123.ngrok.io/twilio/voice/incoming

✅ Call created successfully!
   Call SID: CA123456789abc
   Status: queued

📞 The AI should now answer and collect appointment details.
   Check your server logs to see the conversation.
```

### In the server terminal (npm run dev):
```
[TEST MODE] Skipping Google Calendar check - assuming slot is available
[TEST MODE] Skipping Google Calendar creation
[TEST MODE] Would create appointment: {
  customerName: 'John Doe',
  customerPhone: '+919876543210',
  ...
}
```

## Troubleshooting

### "Missing environment variable"
- Make sure `.env` file has all required variables
- Remove any `your_xxx_here` placeholders

### "Invalid phone number"
- Use format: `+` followed by country code and number
- Examples: `+919876543210`, `+15551234567`

### "Connection refused"
- Server not running? Run `npm run dev` first
- ngrok not running? Run `ngrok http 3000` in another terminal

### "Webhook URL not found"
- Check `SERVICE_URL` in `.env` matches your ngrok URL
- Test with browser: `https://your-url.ngrok.io/health`

### "No audio/call not connecting"
- Check Twilio console for call logs
- Verify account has credits
- Check server logs for errors

## Real-time Monitoring

Watch the call happen in real-time:

1. **Server logs** - See conversation transcript
2. **ngrok web interface** - Open `http://127.0.0.1:4040` to see webhook requests
3. **Twilio console** - Go to Calls section to see call details

## Testing Workflow

1. Make a test call:
   ```bash
   node test-call.js
   ```

2. Listen to the greeting and hang up

3. Check your server logs for messages

4. Try again with a valid phone number

5. If it works, the AI will collect:
   - Your name
   - Appointment date
   - Appointment time

6. It will confirm the booking (in test mode, no calendar entry)

## Notes

- Test calls will show in Twilio console as regular calls
- You'll be charged Twilio's standard call rates (usually $0.01-0.05 per call)
- Use frequently to test without high costs
- In test mode, no Google Calendar entries are created

