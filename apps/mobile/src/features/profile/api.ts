import type { Locale, UpdateProfileInput } from "@yodkai/shared";

import { supabase } from "@/core/supabase/client";

export interface MyProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  provinceCode: string | null;
  locale: Locale;
  phoneVerified: boolean;
  trustScore: number;
}

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  province_code: string | null;
  locale: Locale;
  phone_verified: boolean;
  trust_score: number;
}

const PROFILE_COLUMNS =
  "id, display_name, avatar_url, province_code, locale, phone_verified, trust_score";

/** The signed-in user's own profile row (auto-created by DB trigger on signup). */
export async function fetchMyProfile(): Promise<MyProfile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("AUTH_REQUIRED");

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("auth_user_id", auth.user.id)
    .single<ProfileRow>();
  if (error) throw error;

  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    provinceCode: data.province_code,
    locale: data.locale,
    phoneVerified: data.phone_verified,
    trustScore: data.trust_score,
  };
}

export async function updateMyProfile(
  input: UpdateProfileInput,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("AUTH_REQUIRED");

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: input.displayName,
      province_code: input.provinceCode,
      locale: input.locale,
    })
    .eq("auth_user_id", auth.user.id);
  if (error) throw error;
}
