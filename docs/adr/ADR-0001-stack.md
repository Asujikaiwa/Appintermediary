# ADR-0001: Stack Selection

- **Status:** Accepted — 2026-07-06
- **Context:** Second-hand marketplace app (TH/EN/ZH), team skill = TypeScript,
  MVP in 1 week, low cloud budget (~10k MAU), iOS + Android.

## Decision

| Layer | Choice | Rejected alternatives (why) |
|---|---|---|
| App | Expo SDK 57 / React Native 0.86, New Architecture | Flutter (Dart learning cost vs 1-week deadline); Native ×2 (team size/time); KMP (immature shared-UI ecosystem) |
| UI | React Native Paper v5 (Material 3) | Tamagui (setup complexity), gluestack (API churn) |
| Navigation | Expo Router (typed routes, deep links built in) | bare React Navigation (more wiring) |
| State | TanStack Query v5 + Zustand v5 | Redux Toolkit (boilerplate overkill at this scope) |
| Backend | Supabase (Postgres + Auth + Realtime + Storage + Edge Functions) | Custom Fastify (auth/infra build time ≥3 days); Firebase (NoSQL poor fit for marketplace queries; unpredictable read costs; lock-in) |
| Offline | expo-sqlite (outbox/drafts) + MMKV (query-cache persist) | WatermelonDB/Isar-class sync engines (over-engineered for our offline scope) |
| CI/CD | GitHub Actions + EAS Build/Submit/Update | fastlane (EAS already manages signing/credentials) |
| Observability | Sentry + PostHog (added in Observability step) | Firebase suite (ties us into Firebase) |

## Consequences

- Whole stack in TypeScript, incl. Edge Functions (Deno) and shared zod schemas.
- All access control enforced by Postgres RLS + security-definer functions; the
  client never holds privileged credentials.
- Ejecting from Supabase later = standard Postgres dump + rewriting auth glue.
- OTA fixes via EAS Update for JS-only changes (store-policy compliant).
