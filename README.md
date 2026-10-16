# Yodkai — Second-hand Marketplace (Offer-based)

Seller posts item → Buyer sends price offer → Seller accepts → Meetup →
Buyer inspects item matches the listing (inspection gate) → Deal completed → platform fee per successful deal.

Blueprint: [`BLUEPRINT.md`](./BLUEPRINT.md) · ADRs: [`docs/adr/`](./docs/adr/)

## Stack

| Layer | Tech |
|---|---|
| Mobile | Expo SDK 57 (React Native 0.86, New Architecture), Expo Router, React Native Paper (MD3) |
| State | TanStack Query v5 (server) + Zustand v5 (UI) |
| Backend | Supabase (Postgres + Auth + Realtime + Storage + Edge Functions) |
| CI/CD | GitHub Actions + EAS Build/Submit/Update |

## Prerequisites

- Node 20+, pnpm 9+ (`corepack enable`)
- Docker (for local Supabase)
- Supabase CLI (`npm i -g supabase`)
- Android Studio emulator and/or Xcode simulator

## Quick start (target: new dev running in 30 minutes)

```bash
# 1. install deps
pnpm install

# 2. start local backend (Postgres + Auth + Storage + Studio)
supabase start          # prints local URL + anon key

# 3. configure app env
cp apps/mobile/.env.example apps/mobile/.env
# paste SUPABASE url/anon key printed by `supabase start`

# 4. apply migrations + seed
supabase db reset       # runs supabase/migrations + supabase/seed.sql

# 5. run the app (Expo dev server)
pnpm --filter mobile dev
# press "a" for Android emulator, "i" for iOS simulator
```

## Verify the scaffold works

```bash
pnpm lint && pnpm typecheck && pnpm test   # all green
supabase db reset                          # migrations apply cleanly
```
Expected: app boots to the sign-in screen. Log in with a **test phone number**
(local dev only, see `supabase/config.toml` → `[auth.sms.test_otp]`):
phone `0900000001` → OTP `123456`. First login lands on profile setup
(name / province / language), then the Home tab with Supabase status.

## Environments

| Env | App variant | Bundle ID | Supabase project | EAS channel |
|---|---|---|---|---|
| dev | development build | `com.yodkai.app.dev` | local / dev project | `development` |
| staging | internal | `com.yodkai.app.staging` | staging project | `staging` |
| prod | store | `com.yodkai.app` | prod project | `production` |

Switch via `APP_VARIANT` (see `apps/mobile/app.config.ts`). Secrets live in EAS/GitHub secrets — never in the repo.

## Conventions

- TypeScript `strict` everywhere; ESLint + Prettier enforced in CI
- Conventional Commits + SemVer; changelog per release
- Feature modules under `apps/mobile/src/features/<feature>/` (components / hooks / api / domain)
- Shared zod schemas in `packages/shared` (used by both app and Edge Functions)
