import Constants from "expo-constants";
import { z } from "zod";

/**
 * Validated public runtime config. Fails fast (and loudly) at startup when a
 * required EXPO_PUBLIC_* var is missing, instead of failing later with a
 * cryptic network error.
 */
const EnvSchema = z.object({
  supabaseUrl: z.url(),
  supabaseAnonKey: z.string().min(20),
  appVariant: z.enum(["development", "staging", "production"]),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  appVariant:
    (Constants.expoConfig?.extra?.appVariant as string | undefined) ??
    "development",
});

export const appVersion: string = Constants.expoConfig?.version ?? "0.0.0";
