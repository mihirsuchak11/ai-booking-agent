# Voice Flow Testing Guide

This guide explains how to test the voice booking flow using `test-voice-flow.js`.

## Quick Start

### 1. Set Environment Variables

```bash
# Required
SERVICE_URL=https://your-vercel-app.vercel.app  # or http://localhost:3000 for local

# Optional (for better test output)
TEST_PHONE=+1234567890
TEST_BUSINESS_PHONE=+1987654321
```

### 2. Run Tests

**Quick Test (Greeting Only):**
```bash
npm run test:voice:quick
```

**Full Conversation Flow:**
```bash
npm run test:voice
```

Or directly:
```bash
node test-voice-flow.js quick   # Quick test
node test-voice-flow.js full   # Full test
```

## What Gets Tested

### Quick Test (`quick`)
1. ✅ Health check endpoint
2. ✅ Incoming call webhook
3. ✅ First gather (greeting)

### Full Test (`full`)
1. ✅ Health check endpoint
2. ✅ Incoming call webhook
3. ✅ First gather (greeting)
4. ✅ User provides name
5. ✅ User provides date/time
6. ✅ User confirms booking
7. ✅ Call status update

## Test Scenarios

### Scenario 1: Happy Path
```
Call → Greeting → Name → Date/Time → Confirmation → Booking Complete
```

### Scenario 2: Empty Speech Handling
```
Call → Greeting → (silence) → Retry message → (silence) → Retry → ...
```

### Scenario 3: Error Handling
Tests how the system handles:
- Missing business configuration
- Invalid phone numbers
- API errors

## Understanding Output

### Success Indicators
- ✅ Green checkmarks = Test passed
- `Response status: 200` = Server responded correctly
- `Greeting sent: "..."` = AI greeting was generated
- `Gather configured` = System is listening for input

### Error Indicators
- ❌ Red X = Test failed
- `Call was hung up immediately!` = Issue with TwiML response
- `No greeting found` = Greeting not generated
- `Unexpected status: XXX` = Server error

## TwiML Response Structure

The test parses TwiML responses and shows:
- **Says**: Number of `<Say>` elements (AI speech)
- **Gathers**: Number of `<Gather>` elements (listening for input)
- **Redirects**: Number of `<Redirect>` elements (flow control)
- **Connects**: Number of `<Connect>` elements (Media Streams)
- **Hangs up**: Whether call ends

## Example Output

```
🎙️  FULL VOICE FLOW TEST
============================================================

1️⃣ Testing health check endpoint...
✅ Health check passed: {"status":"ok","streamingMode":false}

2️⃣ Testing incoming call webhook...
ℹ️  Response status: 200
ℹ️  TwiML elements:
ℹ️    - Says: 0
ℹ️    - Gathers: 0
ℹ️    - Redirects: 1
ℹ️    - Connects: 0
ℹ️    - Hangs up: false
✅ Redirecting to: https://your-app.vercel.app/twilio/voice/gather

3️⃣ Testing first gather (should send greeting)...
ℹ️  Response status: 200
✅ Greeting sent: "Hello! Thank you for calling. How can I help you today?"
✅ Gather configured - waiting for user input

4️⃣ Testing user provides name...
ℹ️  Response status: 200
✅ AI response: "Great! Nice to meet you, John. When would you like to schedule your appointment?"
✅ Continuing conversation - waiting for more input

...

✅ Full conversation flow test completed!
```

## Troubleshooting

### "Health check failed"
- Check `SERVICE_URL` is correct
- Ensure server is running
- Check network connectivity

### "Call was hung up immediately!"
- Check business phone number is registered in database
- Verify `resolveBusinessByPhoneNumber` is working
- Check server logs for errors

### "No greeting found"
- Check OpenAI API key is set
- Verify business config exists
- Check server logs for OpenAI errors

### "Unexpected status: 500"
- Check server logs for detailed error
- Verify all environment variables are set
- Check database connectivity

## Testing Against Different Environments

### Local Development
```bash
SERVICE_URL=http://localhost:3000 npm run test:voice
```

### Vercel Staging
```bash
SERVICE_URL=https://your-app-staging.vercel.app npm run test:voice
```

### Vercel Production
```bash
SERVICE_URL=https://your-app.vercel.app npm run test:voice
```

## Advanced Usage

### Custom Test Phone Numbers
```bash
TEST_PHONE=+15551234567 TEST_BUSINESS_PHONE=+15559876543 npm run test:voice
```

### Test Specific Endpoint
You can also import and use individual test functions:

```javascript
const { testFirstGather, testUserProvidesName } = require('./test-voice-flow');

// Test just the greeting
const result = await testFirstGather('CA1234567890');
```

## Integration with CI/CD

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Test Voice Flow
  run: |
    npm run test:voice:quick
  env:
    SERVICE_URL: ${{ secrets.SERVICE_URL }}
```

## Next Steps

After tests pass:
1. ✅ Deploy to Vercel
2. ✅ Update Twilio webhook URL
3. ✅ Make real test call
4. ✅ Monitor logs for issues

## Related Files

- `test-booking-flow.js` - Database booking tests
- `test-api.js` - API endpoint tests
- `test-deepgram.ts` - Deepgram API tests

