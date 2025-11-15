export interface Business {
  id: string;
  name: string;
  timezone: string;
  default_phone_number: string | null;
  created_at: string;
}

export interface BusinessPhoneNumber {
  id: string;
  business_id: string;
  phone_number: string;
  label: string | null;
  created_at: string;
}

export interface BusinessConfig {
  business_id: string;
  greeting: string | null;
  working_hours: any; // JSONB
  min_notice_hours: number;
  notes_for_ai: string | null;
  openai_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  business_id: string;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  google_service_account: any | null; // JSONB
  google_calendar_id: string | null;
  openai_api_key: string | null;
  openai_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallSession {
  id: string;
  business_id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  status: "in_progress" | "completed" | "failed";
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  created_at: string;
}

export interface CallMessage {
  id: string;
  call_session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface Booking {
  id: string;
  business_id: string;
  call_session_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  start_time: string;
  end_time: string;
  external_calendar_id: string | null;
  created_at: string;
}

export interface BusinessConfigWithDetails {
  business: Business;
  config: BusinessConfig | null;
  integration: Integration | null;
}
