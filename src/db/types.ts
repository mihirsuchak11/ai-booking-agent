// Region types for multi-region support
export type RegionCode = "US" | "CA" | "IN" | "GB";

export interface RegionConfig {
  code: RegionCode;
  name: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  dateFormat: string;
  phonePrefix: string;
  defaultTimezone: string;
  deepgramLanguage: string;
  twilioEdge: string;
}

export const REGIONS: Record<RegionCode, RegionConfig> = {
  US: {
    code: "US",
    name: "United States",
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
    dateFormat: "MM/DD/YYYY",
    phonePrefix: "+1",
    defaultTimezone: "America/New_York",
    deepgramLanguage: "en-US",
    twilioEdge: "ashburn",
  },
  CA: {
    code: "CA",
    name: "Canada",
    currency: "CAD",
    currencySymbol: "$",
    locale: "en-CA",
    dateFormat: "YYYY-MM-DD",
    phonePrefix: "+1",
    defaultTimezone: "America/Toronto",
    deepgramLanguage: "en-CA",
    twilioEdge: "toronto",
  },
  IN: {
    code: "IN",
    name: "India",
    currency: "INR",
    currencySymbol: "₹",
    locale: "en-IN",
    dateFormat: "DD/MM/YYYY",
    phonePrefix: "+91",
    defaultTimezone: "Asia/Kolkata",
    deepgramLanguage: "en-IN",
    twilioEdge: "singapore",
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    currencySymbol: "£",
    locale: "en-GB",
    dateFormat: "DD/MM/YYYY",
    phonePrefix: "+44",
    defaultTimezone: "Europe/London",
    deepgramLanguage: "en-GB",
    twilioEdge: "dublin",
  },
};

export interface Business {
  id: string;
  name: string;
  timezone: string;
  default_phone_number: string | null;
  region: RegionCode;
  country_code: string;
  currency: string;
  locale: string;
  date_format: string;
  phone_format: string | null;
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
  anthropic_model: string | null;
  llm_provider: "openai" | "anthropic" | null;
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
  anthropic_api_key: string | null;
  anthropic_model: string | null;
  llm_provider: "openai" | "anthropic" | null;
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
