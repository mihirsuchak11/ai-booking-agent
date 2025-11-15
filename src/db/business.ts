import { supabase } from "./client";
import {
  Business,
  BusinessConfigWithDetails,
  BusinessPhoneNumber,
} from "./types";

export async function resolveBusinessByPhoneNumber(
  phoneNumber: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("business_phone_numbers")
    .select("business_id")
    .eq("phone_number", phoneNumber)
    .single();

  if (error || !data) {
    console.error(
      `[DB] Failed to resolve business for phone ${phoneNumber}:`,
      error?.message
    );
    return null;
  }

  return data.business_id;
}

export async function loadBusinessConfig(
  businessId: string
): Promise<BusinessConfigWithDetails | null> {
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();

  if (businessError || !business) {
    console.error(
      `[DB] Failed to load business ${businessId}:`,
      businessError?.message
    );
    return null;
  }

  const { data: config, error: configError } = await supabase
    .from("business_configs")
    .select("*")
    .eq("business_id", businessId)
    .single();

  if (configError && configError.code !== "PGRST116") {
    // PGRST116 = not found, which is OK (config is optional)
    console.error(
      `[DB] Failed to load config for business ${businessId}:`,
      configError?.message
    );
  }

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("*")
    .eq("business_id", businessId)
    .single();

  if (integrationError && integrationError.code !== "PGRST116") {
    console.error(
      `[DB] Failed to load integration for business ${businessId}:`,
      integrationError?.message
    );
  }

  return {
    business: business as Business,
    config: config as any,
    integration: integration as any,
  };
}
