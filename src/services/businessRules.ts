import { config } from '../config/env';

export interface BusinessHours {
  [day: string]: Array<{ start: string; end: string }>; // e.g., "09:00", "17:00"
}

export interface BusinessConfig {
  workingHours: BusinessHours;
  appointmentDurationMinutes: number;
  minimumNoticeHours: number; // Minimum hours in advance for booking
  timezone: string;
}

// Parse business hours from env var or use defaults
function parseBusinessHours(): BusinessHours {
  const hoursJson = process.env.BUSINESS_HOURS_JSON;
  
  if (hoursJson) {
    try {
      return JSON.parse(hoursJson);
    } catch (error) {
      console.warn('Invalid BUSINESS_HOURS_JSON, using defaults');
    }
  }
  
  // Default: Monday-Friday, 9 AM - 5 PM
  return {
    monday: [{ start: '09:00', end: '17:00' }],
    tuesday: [{ start: '09:00', end: '17:00' }],
    wednesday: [{ start: '09:00', end: '17:00' }],
    thursday: [{ start: '09:00', end: '17:00' }],
    friday: [{ start: '09:00', end: '17:00' }],
    saturday: [],
    sunday: [],
  };
}

export function getBusinessConfig(): BusinessConfig {
  return {
    workingHours: parseBusinessHours(),
    appointmentDurationMinutes: parseInt(process.env.APPOINTMENT_DURATION_MINUTES || '30', 10),
    minimumNoticeHours: parseInt(process.env.MINIMUM_NOTICE_HOURS || '2', 10),
    timezone: config.business.timezone,
  };
}

function getDayName(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: timezone,
  });
  return formatter.format(date).toLowerCase();
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function isTimeInRange(
  time: Date,
  startTime: string,
  endTime: string,
  timezone: string
): boolean {
  const { hours: startHours, minutes: startMinutes } = parseTime(startTime);
  const { hours: endHours, minutes: endMinutes } = parseTime(endTime);
  
  // Convert time to business timezone
  const timeInTz = new Date(time.toLocaleString('en-US', { timeZone: timezone }));
  const hours = timeInTz.getHours();
  const minutes = timeInTz.getMinutes();
  
  const timeMinutes = hours * 60 + minutes;
  const startMinutesTotal = startHours * 60 + startMinutes;
  const endMinutesTotal = endHours * 60 + endMinutes;
  
  return timeMinutes >= startMinutesTotal && timeMinutes < endMinutesTotal;
}

export function validateBusinessHours(
  startTime: Date,
  endTime: Date
): { valid: boolean; reason?: string } {
  const businessConfig = getBusinessConfig();
  const dayName = getDayName(startTime, businessConfig.timezone);
  
  // Check if it's a working day
  const dayHours = businessConfig.workingHours[dayName];
  if (!dayHours || dayHours.length === 0) {
    return {
      valid: false,
      reason: `We're closed on ${dayName}. Please choose a weekday.`,
    };
  }
  
  // Check if time is within working hours
  let isWithinHours = false;
  for (const slot of dayHours) {
    if (
      isTimeInRange(startTime, slot.start, slot.end, businessConfig.timezone) &&
      isTimeInRange(endTime, slot.start, slot.end, businessConfig.timezone)
    ) {
      isWithinHours = true;
      break;
    }
  }
  
  if (!isWithinHours) {
    const firstSlot = dayHours[0];
    return {
      valid: false,
      reason: `Our business hours are ${firstSlot.start} to ${dayHours[dayHours.length - 1].end}. Please choose a time within these hours.`,
    };
  }
  
  // Check minimum notice requirement
  const now = new Date();
  const hoursUntilAppointment = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursUntilAppointment < businessConfig.minimumNoticeHours) {
    return {
      valid: false,
      reason: `We require at least ${businessConfig.minimumNoticeHours} hours notice. Please choose a later time.`,
    };
  }
  
  return { valid: true };
}

export function getAvailableTimeSlots(date: Date): Array<{ start: string; end: string }> {
  const businessConfig = getBusinessConfig();
  const dayName = getDayName(date, businessConfig.timezone);
  const dayHours = businessConfig.workingHours[dayName] || [];
  
  // Return working hours for the day
  return dayHours;
}

