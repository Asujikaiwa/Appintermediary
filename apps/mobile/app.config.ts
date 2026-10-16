import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Three build variants sharing one codebase (BLUEPRINT.md §15):
 *   APP_VARIANT=development -> com.yodkai.app.dev   (dev client, local Supabase)
 *   APP_VARIANT=staging     -> com.yodkai.app.staging
 *   (unset / production)    -> com.yodkai.app
 *
 * Public runtime config comes from EXPO_PUBLIC_* env vars (safe to embed —
 * the Supabase anon key is public by design; security is enforced by RLS).
 * Secrets must NEVER be referenced here.
 */
const variant = process.env.APP_VARIANT ?? "production";

const bundleId =
  variant === "production"
    ? "com.yodkai.app"
    : variant === "staging"
      ? "com.yodkai.app.staging"
      : "com.yodkai.app.dev";

const appName =
  variant === "production"
    ? "Yodkai"
    : variant === "staging"
      ? "Yodkai (Staging)"
      : "Yodkai (Dev)";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName,
  slug: "yodkai",
  version: "1.0.0",
  scheme: "yodkai",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: true,
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleId,
    // outbox/drafts SQLite must not survive device backup (BLUEPRINT.md §3.3)
    allowBackup: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
    "expo-localization",
    [
      "expo-image-picker",
      {
        photosPermission:
          "แอปใช้รูปจากคลังภาพเพื่อลงประกาศขายสินค้า",
      },
    ],
    [
      "expo-notifications",
      {
        // default channel; POST_NOTIFICATIONS is requested at runtime with context
        defaultChannel: "default",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    // filled in by `eas update:configure`; EAS Update = OTA for JS bundle only
    url: process.env.EAS_UPDATE_URL,
  },
  extra: {
    appVariant: variant,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
