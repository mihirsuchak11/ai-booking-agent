# OpenAI Realtime API - Setup Guide

## What is Realtime Mode?

Realtime Mode uses OpenAI's Realtime API for **direct speech-to-speech** conversation, eliminating the need for separate STT/TTS services. This provides:

- ✅ **Lower latency** (~200-400ms vs 1-2s traditional pipeline)
- ✅ **Native audio processing** - single WebSocket connection
- ✅ **Built-in interruption handling** - seamless barge-in support
- ⚠️ **Higher cost** (~30x vs Deepgram pipeline)

## Quick Start

### 1. Enable Realtime Mode

Add to your `.env` file:

```bash
# Enable OpenAI Realtime API
REALTIME_MODE=true

# Optional: Customize model and voice
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
OPENAI_REALTIME_VOICE=alloy
```

### 2. Restart Your Server

```bash
npm run dev
```

You should see:
```
🚀 REALTIME MODE ENABLED - Using OpenAI Realtime API for speech-to-speech
```

### 3. Test a Call

Make a test call to your Twilio number. The conversation will now use OpenAI's Realtime API instead of Deepgram.

## Configuration Options

### Available Voices

OpenAI Realtime supports these voices:
- `alloy` - Neutral, balanced voice (default) 
- `echo` - Crisp, clear voice
- `shimmer` - Warm, expressive voice

Set via:
```bash
OPENAI_REALTIME_VOICE=echo
```

### Model Options

Currently available models:
- `gpt-4o-realtime-preview-2024-12-17` (default)
- `gpt-4o-mini-realtime-preview` (faster, lower cost)

Set via:
```bash
OPENAI_REALTIME_MODEL=gpt-4o-mini-realtime-preview
```

## Switching Modes

### Use Realtime Mode (Recommended for best experience)
```bash
REALTIME_MODE=true
```

### Use Deepgram Mode (Lower cost)
```bash
REALTIME_MODE=false
# Requires DEEPGRAM_API_KEY
```

## Cost Comparison

### OpenAI Realtime API
- Audio input: $0.06/minute
- Audio output: $0.24/minute
- **~$0.90 per 3-minute call**

### Deepgram Pipeline
- STT: ~$0.0043/min
- TTS: ~$0.015/request
- **~$0.02-0.03 per 3-minute call**

## Troubleshooting

### "DEEPGRAM_API_KEY required" error
If you see this while `REALTIME_MODE=true`, make sure:
1. `REALTIME_MODE=true` (not just `true` without equals)
2. Environment variables are loaded (restart server)

### No audio output
1. Check logs for `[OpenAI Realtime] Connected`
2. Verify `OPENAI_API_KEY` is valid
3. Check OpenAI API quota/usage

### High latency still
1. Verify Realtime mode is active (check startup logs)
2. Check network connection quality
3. Try different voice model

## Next Steps

Once Realtime Mode is working:
1. Monitor call quality and user experience
2. Track costs in OpenAI dashboard
3. Adjust voice/model based on preferences
4. Collect metrics to compare with Deepgram mode
