import { supabase } from "./client";
import { CallSession } from "./types";

export async function createCallSession(
  businessId: string,
  callSid: string,
  fromNumber: string,
  toNumber: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("call_sessions")
    .insert({
      business_id: businessId,
      call_sid: callSid,
      from_number: fromNumber,
      to_number: toNumber,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(`[DB] Failed to create call session:`, error?.message);
    return null;
  }

  return data.id;
}

export async function updateCallSession(
  callSid: string,
  updates: {
    status?: "in_progress" | "completed" | "failed";
    ended_at?: string;
    summary?: string;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from("call_sessions")
    .update(updates)
    .eq("call_sid", callSid);

  if (error) {
    console.error(
      `[DB] Failed to update call session ${callSid}:`,
      error?.message
    );
    return false;
  }

  return true;
}

export async function getCallSessionByCallSid(
  callSid: string
): Promise<CallSession | null> {
  const { data, error } = await supabase
    .from("call_sessions")
    .select("*")
    .eq("call_sid", callSid)
    .single();

  if (error || !data) {
    return null;
  }

  return data as CallSession;
}
