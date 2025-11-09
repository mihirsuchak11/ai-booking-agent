# Free Testing Methods - No Charges

All of these methods are **100% FREE** and don't require making actual phone calls.

## Method 1: Twilio Console Test Tool (Easiest)

**Completely free, no setup needed**

### Step 1: Make sure your server is running
```bash
npm run dev
```

### Step 2: Keep ngrok running
```bash
ngrok http 3000
```

### Step 3: Go to Twilio Console

1. Open [Twilio Console](https://console.twilio.com/)
2. Go to **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your Twilio phone number

### Step 4: Look for "Try it out" or Test Section

In your phone number settings, you should see:
- A **"Try it out"** button, or
- A **"Test"** section, or
- A way to simulate calls

### Step 5: Make a test call

Fill in:
- **To:** Any number (e.g., `+919999888777`)
- Leave other settings as default
- Click **"Make Test Call"** or **"Simulate"**

### Step 6: Watch in real-time

- Your server terminal will show the conversation
- Twilio Console shows the call details
- The AI will answer and collect appointment details

**Cost: $0** ✅

---

## Method 2: ngrok Replay Webhook (Also Free)

**Monitor and replay every webhook call**

### Step 1: Start ngrok
```bash
ngrok http 3000
```

### Step 2: Open ngrok Web Interface

In browser: `http://127.0.0.1:4040`

You'll see:
- All incoming requests
- Headers and body
- Responses from your server

### Step 3: Use Twilio Console Test Tool

Make a test call (from Method 1), then go to ngrok interface.

### Step 4: See the webhook

The ngrok interface shows:
```
POST /twilio/voice/incoming
Status: 200
Response time: 123ms
```

### Step 5: Replay the call

Click **"Replay"** to test the same call again without Twilio charges!

**Cost: $0** ✅

---

## Method 3: cURL Command (Advanced but Free)

**Make a test webhook request directly**

### Simple way - Just trigger the webhook

```bash
curl -X POST http://localhost:3000/twilio/voice/incoming \
  -d "CallSid=TEST123456789" \
  -d "From=+919999888777" \
  -d "To=+your_twilio_number" \
  -d "AccountSid=ACtest123"
```

This will:
- Trigger your `/twilio/voice/incoming` endpoint
- Your server will respond with TwiML
- No charges from Twilio

**Cost: $0** ✅

---

## Recommended: Combine Methods 1 & 2

**Best free testing experience:**

1. **Terminal 1:** Run your server
   ```bash
   npm run dev
   ```

2. **Terminal 2:** Run ngrok
   ```bash
   ngrok http 3000
   ```

3. **Browser Tab 1:** Open ngrok interface
   ```
   http://127.0.0.1:4040
   ```

4. **Browser Tab 2:** Open Twilio Console
   ```
   https://console.twilio.com/
   ```

5. **Test:**
   - Make a test call from Twilio Console
   - Watch server logs (Terminal 1)
   - Watch webhook in ngrok (Browser Tab 1)
   - Replay calls in ngrok (Browser Tab 1)

**This gives you complete visibility and costs $0!**

---

## What You Can Test (All Free)

✅ AI conversation and speech recognition
✅ Appointment detail collection
✅ Business hours validation
✅ Minimum notice validation
✅ Booking confirmation
✅ Error handling
✅ Edge cases (outside hours, invalid dates, etc.)

---

## Step-by-Step: First Free Test

### Setup (One-time)

1. Open **Terminal 1:**
   ```bash
   cd /Users/mihirsuchak/Projects/ai-telecaller
   npm run dev
   ```

2. Open **Terminal 2:**
   ```bash
   ngrok http 3000
   ```

3. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

4. Update your `.env` file:
   ```bash
   SERVICE_URL=https://abc123.ngrok.io
   ```

5. Update Twilio webhook (one-time):
   - Go to [Twilio Console](https://console.twilio.com/)
   - Phone Numbers → Your Number
   - Voice & Fax section
   - Set webhook URL to: `https://your-ngrok-url.ngrok.io/twilio/voice/incoming`
   - Save

### Testing (Repeat anytime)

1. Open [Twilio Console](https://console.twilio.com/)
2. Phone Numbers → Your Number
3. Look for **"Try it out"** section
4. Enter any test number
5. Click **"Make Test Call"**
6. Watch Terminal 1 for server logs
7. Watch Terminal 2 (ngrok) for webhook requests

**That's it! All free, all the time!**

---

## Why This Is Better Than Real Calls

| Feature | Real Call | Free Method |
|---------|-----------|------------|
| Cost | ₹2-5/min + fees | **$0** |
| Speed | ~30 seconds | Instant |
| Visibility | Limited | Full logs |
| Repeatability | 1 call | Unlimited |
| International | Slow | N/A |
| Testing edge cases | Hard | Easy |

---

## Still Want Real Calls Later?

When you're confident it works:
1. Buy an **Indian Twilio number** (local calls, cheap)
2. Or use **international calling** if needed
3. Both work with the same code

For now, **stick to free testing** until everything works perfectly!

