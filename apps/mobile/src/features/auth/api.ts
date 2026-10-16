import { supabase } from "@/core/supabase/client";

/**
 * Phone-OTP auth (BLUEPRINT.md §5.2 screens 5–6).
 * Local dev: supabase/config.toml [auth.sms.test_otp] — 66900000001 / 123456.
 * Google/Apple sign-in arrive with the store-prep step (need native config).
 */

export async function requestOtp(phoneE164: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
  if (error) throw error;
}

export async function verifyOtp(
  phoneE164: string,
  token: string,
): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token,
    type: "sms",
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
