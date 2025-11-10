# Vercel Deployment Guide

## Setup Complete ✅

Your Express/Node.js application is now configured for Vercel deployment.

## Files Created/Modified

1. **`vercel.json`** - Vercel configuration file that routes all requests to your Express app
2. **`api/index.ts`** - Serverless function entry point for Vercel
3. **`src/server.ts`** - Updated to export the app and detect Vercel environment
4. **`.vercelignore`** - Files to exclude from deployment
5. **`tsconfig.json`** - Updated to include the `api` folder

## Deployment Steps

### 1. Install Vercel CLI (if not already installed)

```bash
npm i -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Deploy to Vercel

```bash
vercel
```

For production deployment:

```bash
vercel --prod
```

### 4. Set Environment Variables

In your Vercel project dashboard (or via CLI), set the following environment variables:

**Required:**

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `OPENAI_API_KEY`

**Required (unless TEST_MODE=true):**

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

**Optional:**

- `SERVICE_URL` - **IMPORTANT**: Set this to your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
- `BUSINESS_NAME`
- `BUSINESS_TIMEZONE`
- `BUSINESS_HOURS_JSON`
- `APPOINTMENT_DURATION_MINUTES`
- `MINIMUM_NOTICE_HOURS`
- `TEST_MODE` - Set to `true` to bypass Google Calendar integration

### 5. Update Twilio Webhook URL

After deployment, update your Twilio webhook URL to:

```
https://your-app.vercel.app/twilio/voice/incoming
```

## Testing Locally

Your app still works locally! Run:

```bash
npm run dev
```

The app will detect it's not running on Vercel and start a local server.

## Important Notes

- The `SERVICE_URL` environment variable should be set to your Vercel deployment URL
- All routes are handled by a single serverless function
- The app automatically detects Vercel environment and doesn't start a local server
- Health check endpoint: `/health`
