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

    // TODO: Validate working hours from businessConfig.working_hours JSONB
    // For now, skip this check
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
