# Testing Guide - Calling from India

## Quick Answer: How to Call US Twilio Number from India

### Method 1: Direct International Call

1. **Dial Format:**

   - From Indian mobile: `+1` followed by 10-digit US number
   - Example: `+15551234567` or `0015551234567`
   - The `00` is India's international access code (or use `+`)

2. **Cost:**

   - Typically ₹2-5 per minute from India to US
   - Check with your carrier for exact rates
   - Twilio also charges for incoming calls

3. **Requirements:**
   - International calling enabled on your phone plan
   - Sufficient balance/credit

### Method 2: Use Twilio Test Tools (Recommended - FREE)

**Best option for development** - No phone calls needed!

#### Option A: Twilio Console Test Tool

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Phone Numbers** → **Manage** → **Active numbers**
3. Click on your Twilio number
4. Look for **"Test"** or **"Try it out"** button
5. Enter any test number and make a test call
6. You'll see logs and can hear the audio

#### Option B: Use ngrok Web Interface

1. Start your server: `npm run dev`
2. Start ngrok: `ngrok http 3000`
3. Open ngrok web interface: `http://127.0.0.1:4040`
4. You can replay webhook requests here
5. Use Twilio's test tools to trigger calls

#### Option C: Create Test Script

Create `test-call.js`:

```javascript
const twilio = require("twilio");
require("dotenv").config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Make a test call
client.calls
  .create({
    url: `${process.env.SERVICE_URL}/twilio/voice/incoming`,
    to: "+919876543210", // Your Indian number for testing
    from: process.env.TWILIO_PHONE_NUMBER,
  })
  .then((call) => console.log("Call SID:", call.sid))
  .catch((error) => console.error("Error:", error));
```

Run: `node test-call.js`

### Method 3: Get an Indian Twilio Number (Best for Local Testing)

**Why this is better:**

- ✅ Local calls from India (much cheaper)
- ✅ No international calling needed
- ✅ Faster connection
- ✅ Better call quality

**How to get:**

1. Go to [Twilio Console](https://console.twilio.com/)
2. **Phone Numbers** → **Buy a number**
3. Select **India** as country
4. Choose a number (may have limited availability)
5. Update `.env`: `TWILIO_PHONE_NUMBER=+91XXXXXXXXXX`

**Note:**

- Indian numbers may cost more than US numbers
- Some features may vary by country
- Check [Twilio India Pricing](https://www.twilio.com/voice/pricing/in)

## Recommended Testing Workflow

### For Development (No Real Calls):

1. Use Twilio Console test tools
2. Monitor logs in your terminal
3. Check ngrok web interface for webhook requests
4. Test conversation flow without phone charges

### For Production Testing (Real Calls):

1. Get an Indian Twilio number (if available)
2. Or use international calling (be aware of costs)
3. Test with real users/customers
4. Monitor call quality and response times

## Cost Comparison

| Method                        | Cost per Call          | Best For           |
| ----------------------------- | ---------------------- | ------------------ |
| International call (India→US) | ₹2-5/min + Twilio fees | Production testing |
| Twilio test tools             | FREE                   | Development        |
| Indian Twilio number          | Local call rates       | Production (India) |
| Twilio API test calls         | FREE (test mode)       | Development        |

## Troubleshooting International Calls

### "Call not connecting"

- Check international calling is enabled on your plan
- Verify you're dialing with correct format (`+1` or `001`)
- Check Twilio number is active in console

### "High latency/poor quality"

- Normal for international calls
- Consider getting Indian Twilio number for better quality
- Check your internet connection (affects ngrok)

### "Call connects but no audio"

- Check server logs for errors
- Verify ngrok URL is accessible
- Check Twilio webhook configuration
- Test webhook URL in browser: `https://your-url.ngrok.io/health`

## Quick Test Checklist

Before making real calls:

- [ ] Server running (`npm run dev`)
- [ ] ngrok running (`ngrok http 3000`)
- [ ] `.env` file has correct `SERVICE_URL`
- [ ] Twilio webhook configured in console
- [ ] Test webhook with browser: `https://your-url.ngrok.io/health`
- [ ] Check server logs for any errors

## Need Help?

- **Twilio Support:** [support.twilio.com](https://support.twilio.com)
- **Twilio Docs:** [twilio.com/docs](https://www.twilio.com/docs)
- **Check logs:** Your terminal will show all webhook requests and errors
