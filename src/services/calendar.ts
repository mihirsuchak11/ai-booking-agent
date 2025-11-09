import { google } from 'googleapis';
import { config } from '../config/env';
import { validateBusinessHours, getBusinessConfig } from './businessRules';

let oauth2Client: any = null;

function getOAuth2Client() {
  if (!oauth2Client) {
    oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret
    );
    
    oauth2Client.setCredentials({
      refresh_token: config.google.refreshToken,
    });
  }
  
  return oauth2Client;
}

export async function checkAvailability(
  startTime: Date,
  endTime: Date
): Promise<{ available: boolean; reason?: string }> {
  // First, validate against business rules (hours, days, minimum notice)
  const businessValidation = validateBusinessHours(startTime, endTime);
  if (!businessValidation.valid) {
    return {
      available: false,
      reason: businessValidation.reason,
    };
  }
  
  // In test mode, skip Google Calendar check
  if (config.testMode) {
    console.log('[TEST MODE] Skipping Google Calendar check - assuming slot is available');
    return { available: true };
  }
  
  // Then check Google Calendar for conflicts
  try {
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });
    
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: 'primary' }],
      },
    });
    
    const busy = response.data.calendars?.primary?.busy || [];
    
    if (busy.length > 0) {
      return {
        available: false,
        reason: 'This time slot is already booked. Please choose another time.',
      };
    }
    
    return { available: true };
  } catch (error) {
    console.error('Error checking calendar availability:', error);
    throw error;
  }
}

export async function createAppointment(
  customerName: string,
  customerPhone: string,
  startTime: Date,
  endTime: Date
): Promise<string> {
  // In test mode, skip actual calendar creation
  if (config.testMode) {
    const testEventId = `test-${Date.now()}`;
    console.log('[TEST MODE] Skipping Google Calendar creation');
    console.log(`[TEST MODE] Would create appointment:`, {
      customerName,
      customerPhone,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      eventId: testEventId,
    });
    return testEventId;
  }
  
  try {
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });
    
    const event = {
      summary: `Appointment: ${customerName}`,
      description: `Phone: ${customerPhone}\nBooked via AI Telecaller`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: config.business.timezone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: config.business.timezone,
      },
      reminders: {
        useDefault: true,
      },
    };
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
    
    return response.data.id || '';
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
}

export function parseDateTime(dateStr: string, timeStr: string): { start: Date; end: Date } | null {
  try {
    const businessConfig = getBusinessConfig();
    
    // Parse date (expecting YYYY-MM-DD format)
    const [year, month, day] = dateStr.split('-').map(Number);
    
    // Parse time (expecting HH:MM format in 24-hour)
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Create date in business timezone
    const start = new Date();
    start.setFullYear(year, month - 1, day);
    start.setHours(hours, minutes, 0, 0);
    
    // Use configured appointment duration
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + businessConfig.appointmentDurationMinutes);
    
    return { start, end };
  } catch (error) {
    console.error('Error parsing date/time:', error);
    return null;
  }
}

