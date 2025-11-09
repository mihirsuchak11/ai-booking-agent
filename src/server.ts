import express from 'express';
import { config } from './config/env';
import twilioRoutes from './routes/twilio';

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Twilio webhook routes
app.use('/twilio', twilioRoutes);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🚀 AI Telecaller service running on port ${PORT}`);
  console.log(`📞 Twilio webhook URL: ${config.serviceUrl}/twilio/voice/incoming`);
});

