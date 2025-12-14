import { supabase } from "./client";
import { Booking, BusinessConfig } from "./types";

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

export async function checkDbAvailability(
  businessId: string,
  startTime: Date,
  endTime: Date,
  businessConfig: BusinessConfig | null
): Promise<AvailabilityResult> {
  // Check business hours and minimum notice from config
  if (businessConfig) {
    const now = new Date();
    const hoursUntilStart =
      (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilStart < businessConfig.min_notice_hours) {
      return {
        available: false,
        reason: `We require at least ${businessConfig.min_notice_hours} hours notice.`,
      };
    }

    // Validate working hours
    if (businessConfig.working_hours) {
      const hoursCheck = validateWorkingHours(
        startTime,
        endTime,
        businessConfig.working_hours
      );
      if (!hoursCheck.valid) {
        return {
          available: false,
          reason: hoursCheck.reason,
        };
      }
    }
  }

  // Check for overlapping bookings
  const { data: conflicts, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("business_id", businessId)
    .lt("start_time", endTime.toISOString())
    .gt("end_time", startTime.toISOString());

  if (error) {
    console.error(`[DB] Failed to check availability:`, error?.message);
    return {
      available: false,
      reason: "Error checking availability. Please try again.",
    };
  }

  if (conflicts && conflicts.length > 0) {
    return {
      available: false,
      reason: "This time slot is already booked. Please choose another time.",
    };
  }

  return { available: true };
}

/**
 * Validate if appointment time falls within business working hours
 */
function validateWorkingHours(
  startTime: Date,
  endTime: Date,
  working_hours: any
): { valid: boolean; reason?: string } {
  // Get day of week (0 = Sunday, 1 = Monday, etc.)
  const dayOfWeek = startTime.getDay();
  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayName = dayNames[dayOfWeek];

  // Check if working_hours has this day
  const dayHours = working_hours[dayName];

  if (!dayHours) {
    console.log(`[Validation] No working hours defined for ${dayName}`);
    return { valid: true }; // If not configured, allow booking
  }

  // Check if business is open on this day
  if (!dayHours.isOpen) {
    const dayNameCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return {
      valid: false,
      reason: `We're closed on ${dayNameCapitalized}s. Please choose another day.`,
    };
  }

  // Check time ranges
  const startHour = startTime.getHours();
  const startMinute = startTime.getMinutes();
  const endHour = endTime.getHours();
  const endMinute = endTime.getMinutes();

  // Parse business hours (format: "HH:MM" or "H:MM")
  const [openHour, openMinute] = dayHours.start.split(":").map(Number);
  const [closeHour, closeMinute] = dayHours.end.split(":").map(Number);

  // Convert to minutes for easier comparison
  const appointmentStart = startHour * 60 + startMinute;
  const appointmentEnd = endHour * 60 + endMinute;
  const businessOpen = openHour * 60 + openMinute;
  const businessClose = closeHour * 60 + closeMinute;

  if (appointmentStart < businessOpen || appointmentEnd > businessClose) {
    const formatTime = (hour: number, minute: number) => {
      const period = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
    };

    return {
      valid: false,
      reason: `We're only open from ${formatTime(
        openHour,
        openMinute
      )} to ${formatTime(closeHour, closeMinute)} on ${dayName}s.`,
    };
  }

  return { valid: true };
}

export async function createDbBooking(
  businessId: string,
  callSessionId: string | null,
  customerName: string,
  customerPhone: string | null,
  startTime: Date,
  endTime: Date
): Promise<string | null> {
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      business_id: businessId,
      call_session_id: callSessionId,
      customer_name: customerName,
      customer_phone: customerPhone,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(`[DB] Failed to create booking:`, error?.message);
    return null;
  }

  return data.id;
}

export async function getBookingsForBusiness(
  businessId: string,
  startDate?: Date,
  endDate?: Date
): Promise<Booking[]> {
  let query = supabase
    .from("bookings")
    .select("*")
    .eq("business_id", businessId)
    .order("start_time", { ascending: true });

  if (startDate) {
    query = query.gte("start_time", startDate.toISOString());
  }

  if (endDate) {
    query = query.lte("end_time", endDate.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[DB] Failed to get bookings:`, error?.message);
    return [];
  }

  return (data || []) as Booking[];
}
