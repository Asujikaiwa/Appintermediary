import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

import { env } from "@/core/config/env";

/**
 * Auth session storage backed by Keychain (iOS) / Keystore-encrypted prefs
 * (Android). Tokens intentionally do NOT survive OS backup/restore
 * (BLUEPRINT.md §2 — backup exclusion for credentials).
 *
 * NOTE: SecureStore warns above ~2048 bytes on some platforms; Supabase
 * sessions fit today. If we later store larger payloads, switch to the
 * "encryption key in SecureStore + ciphertext in MMKV" pattern.
 */
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // mobile: deep-link handling is explicit
  },
});
