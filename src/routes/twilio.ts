import express, { Request, Response } from 'express';
import twilio from 'twilio';
import { config } from '../config/env';
import { sessionStore, CallSession } from '../state/sessions';
import { processConversation } from '../services/openai';
import { checkAvailability, createAppointment, parseDateTime } from '../services/calendar';

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// Twilio webhook for incoming calls
router.post('/voice/incoming', async (req: Request, res: Response) => {
  const { CallSid, From, To } = req.body;
  
  console.log(`Incoming call: ${CallSid} from ${From} to ${To}`);
  
  // Create or get session
  let session = sessionStore.getSession(CallSid);
  if (!session) {
    session = sessionStore.createSession(CallSid, From, To);
  }
  
  const twiml = new VoiceResponse();
  
  // Greet the caller
  const greeting = `Hello! Thank you for calling ${config.business.name}. I'm an AI assistant here to help you book an appointment. How can I help you today?`;
  
  twiml.say({ voice: 'alice' }, greeting);
  
  // Gather speech input
  const gather = twiml.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: `${config.serviceUrl}/twilio/voice/gather`,
    method: 'POST',
    language: 'en-US',
  });
  
  gather.say({ voice: 'alice' }, 'Please tell me what you need.');
  
  // Fallback if no input
  twiml.say({ voice: 'alice' }, "I didn't catch that. Please call back when you're ready. Goodbye!");
  twiml.hangup();
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Twilio webhook for speech input
router.post('/voice/gather', async (req: Request, res: Response) => {
  const { CallSid, SpeechResult, From } = req.body;
  
  console.log(`Speech input for ${CallSid}: ${SpeechResult}`);
  
  const session = sessionStore.getSession(CallSid);
  if (!session) {
    const twiml = new VoiceResponse();
    twiml.say({ voice: 'alice' }, "I'm sorry, there was an error. Please call back. Goodbye!");
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
    return;
  }
  
  const userMessage = SpeechResult || '';
  
  // Add user message to conversation history
  session.conversationHistory.push({ role: 'user', content: userMessage });
  
  // Process with OpenAI
  const aiResponse = await processConversation(userMessage, session);
  
  // Add assistant response to conversation history
  session.conversationHistory.push({ role: 'assistant', content: aiResponse.response });
  
  const twiml = new VoiceResponse();
  
  if (aiResponse.isComplete && aiResponse.extractedData) {
    // We have all the information, try to book the appointment
    session.status = 'checking';
    sessionStore.updateSession(CallSid, session);
    
    const { customerName, appointmentDate, appointmentTime } = aiResponse.extractedData;
    
    // Parse date and time
    const dateTime = parseDateTime(appointmentDate, appointmentTime);
    
    if (!dateTime) {
      twiml.say({ voice: 'alice' }, "I'm sorry, I couldn't understand the date and time. Let me ask again.");
      const gather = twiml.gather({
        input: 'speech',
        speechTimeout: 'auto',
        action: `${config.serviceUrl}/twilio/voice/gather`,
        method: 'POST',
      });
      gather.say({ voice: 'alice' }, 'What date and time would you like for your appointment?');
      
      session.status = 'collecting';
      sessionStore.updateSession(CallSid, session);
      
      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }
    
    // Check availability (business rules + calendar conflicts)
    try {
      const availability = await checkAvailability(dateTime.start, dateTime.end);
      
      if (!availability.available) {
        const message = availability.reason 
          ? `I'm sorry, ${availability.reason.toLowerCase()} Please call back to choose another time. Goodbye!`
          : "I'm sorry, that time slot is not available. Please call back to choose another time. Goodbye!";
        
        twiml.say({ voice: 'alice' }, message);
        twiml.hangup();
        
        session.status = 'failed';
        sessionStore.updateSession(CallSid, session);
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
      }
      
      // Create appointment
      const eventId = await createAppointment(
        customerName,
        From,
        dateTime.start,
        dateTime.end
      );
      
      // Confirm booking
      const confirmation = `Great! I've booked your appointment for ${appointmentDate} at ${appointmentTime}. You'll receive a confirmation shortly. Thank you for calling ${config.business.name}!`;
      
      twiml.say({ voice: 'alice' }, confirmation);
      twiml.hangup();
      
      session.status = 'completed';
      session.collectedData = {
        customerName,
        appointmentDate,
        appointmentTime,
        phoneNumber: From,
      };
      sessionStore.updateSession(CallSid, session);
      
      console.log(`Appointment booked: ${eventId} for ${customerName} on ${appointmentDate} at ${appointmentTime}`);
      
    } catch (error) {
      console.error('Error booking appointment:', error);
      twiml.say({ voice: 'alice' }, "I'm sorry, there was an error booking your appointment. Please call back or contact us directly. Goodbye!");
      twiml.hangup();
      
      session.status = 'failed';
      sessionStore.updateSession(CallSid, session);
    }
  } else {
    // Still collecting information
    session.status = 'collecting';
    sessionStore.updateSession(CallSid, session);
    
    twiml.say({ voice: 'alice' }, aiResponse.response);
    
    const gather = twiml.gather({
      input: 'speech',
      speechTimeout: 'auto',
      action: `${config.serviceUrl}/twilio/voice/gather`,
      method: 'POST',
    });
    
    gather.say({ voice: 'alice' }, 'Please continue.');
    
    // Fallback
    twiml.say({ voice: 'alice' }, "I didn't catch that. Please call back when you're ready. Goodbye!");
    twiml.hangup();
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Twilio webhook for call status updates
router.post('/voice/status', (req: Request, res: Response) => {
  const { CallSid, CallStatus } = req.body;
  
  console.log(`Call status update: ${CallSid} - ${CallStatus}`);
  
  if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
    // Clean up session after a delay
    setTimeout(() => {
      sessionStore.deleteSession(CallSid);
    }, 60000); // Delete after 1 minute
  }
  
  res.status(200).send('OK');
});

export default router;

