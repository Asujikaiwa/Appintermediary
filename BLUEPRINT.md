# เฟส 1: Blueprint & Architecture — แอปแมตช์ซื้อ-ขายของมือสอง (codename: "Yodkai")

> เอกสารนี้คือพิมพ์เขียวก่อนเขียนโค้ด — รอ approve ก่อนเริ่มเฟส 2 (Implementation)
> อัปเดตล่าสุด: 2026-07-06

---

## 0. Assumptions & Conflict Flags

### Assumptions (ต้องยืนยันก่อนเริ่มโค้ด)
| # | Assumption | ผลถ้าผิด |
|---|-----------|----------|
| A1 | สินค้าเป็น **physical goods** ทั้งหมด → ไม่ต้องใช้ Apple/Google IAP (ค่าธรรมเนียมต่อดีลสำเร็จของ physical goods ได้รับยกเว้นจากกฎ IAP) | ถ้ามี digital goods ต้องเพิ่ม IAP lifecycle เต็ม |
| A2 | ผู้ใช้เป้าหมายเริ่มที่ไทย → ภาษาไทยเป็น default, EN/ZH ตามมา | โครง i18n รองรับอยู่แล้ว แค่เพิ่มไฟล์แปล |
| A3 | สเปกเครื่องต่ำสุด: Android 7.0 (API 24) / iOS 15.1 (ขั้นต่ำของ Expo SDK 57 — ยืนยันอีกครั้งตอน `expo init`) | ถ้าต้องต่ำกว่านี้ต้อง downgrade SDK |
| A4 | ✅ **ยืนยันแล้ว (2026-07-06):** ผู้ขายโพสต์ของ (รูป+รายละเอียด) → ผู้ซื้อกดเสนอราคาที่ประกาศ → push แจ้งผู้ขาย → ผู้ขายกดรับข้อเสนอ → นัดรับสินค้า → **inspection gate: ผู้ซื้อตรวจว่าของตรงตามประกาศก่อน** จึงเข้าขั้นซื้อขาย/จ่ายเงิน | ดู ADR-0002 (แทนที่โมเดล buy_requests/matches เดิม) |
| A5 | งบ cloud ต่ำ: เป้า < $50/เดือน ที่ 10k MAU | เลือก Supabase + Cloudflare ตามงบนี้ |

### ⚠️ Conflict Flags (ต้องตัดสินใจ)
1. **Escrow ในแอป vs MVP 1 สัปดาห์** — ทำพร้อมกันไม่ได้ เสนอแบ่งเฟส:
   - **Week 1 (MVP):** แมตช์ + แชท + ยืนยันดีล + บันทึกค่าธรรมเนียมเป็น ledger (ยังไม่เก็บเงินจริง)
   - **Week 2–3 (Phase 2):** Escrow ผ่าน Opn Payments (PromptPay QR เข้าบัญชีแพลตฟอร์ม → โอนให้ผู้ขายเมื่อผู้ซื้อกดยืนยันรับของ ผ่าน Transfer/Recipient API)
2. **⚠️ กฎหมาย escrow ไทย** — การถือเงินแทนบุคคลที่สามอาจเข้าข่ายธุรกิจ e-Money/บริการชำระเงินภายใต้ พ.ร.บ.ระบบการชำระเงิน 2560 (กำกับโดย ธปท.) **ต้องปรึกษาที่ปรึกษากฎหมายก่อนเปิด escrow จริง** ทางเลือกที่เสี่ยงต่ำกว่า: ใช้ Account Chaining ของ Opn (เงินไหลผ่าน gateway ไม่ค้างบัญชีเรา) หรือเริ่มแบบ "นัดเจอ + จ่ายตรง" แล้วเก็บค่าธรรมเนียมจากผู้ขายแยก
3. **Certificate pinning + device attestation ใน 1 สัปดาห์** — เลื่อนไป Phase 2 ได้โดยไม่โดน store reject (TLS + Supabase RLS + rate limit ครอบอยู่แล้ว) แต่ **remote min-version check ต้องมีตั้งแต่ release แรก** (ใส่ทีหลังไม่ทัน) — อยู่ใน scope Week 1

---

## 1. สรุปสถาปัตยกรรม + Phasing

**คอนเซ็ปต์ (rev.2 ตาม A4):** Offer-based marketplace — ผู้ขายลงประกาศของเก่า (รูป + รายละเอียดตาม template หมวดหมู่) → ผู้ซื้อเสนอราคาตรงที่ประกาศ → push แจ้งผู้ขาย → ผู้ขายกดรับ → เปิดแชท+นัดรับสินค้า → **ผู้ซื้อตรวจของตรงตามประกาศ (inspection gate)** → จึงซื้อขาย/(Phase 2) จ่ายผ่าน escrow → แพลตฟอร์มหักค่าธรรมเนียมต่อดีลสำเร็จ (ของไม่ตรง = ดีลยกเลิก ไม่เก็บ fee)

```
┌─────────────────────────── Mobile App (Expo / React Native) ───────────────────────────┐
│  Presentation   Expo Router screens + React Native Paper (Material 3) + i18next        │
│       ↓ hooks                                                                          │
│  Domain         use-cases (pure TS) · zod validation · entity types                    │
│       ↓ ports                                                                          │
│  Data           TanStack Query (server cache) · Zustand (UI state)                     │
│                 supabase-js client · expo-sqlite (offline cache + outbox)              │
└──────────┬──────────────────────────────────────────────┬──────────────────────────────┘
           │ HTTPS / WSS (Realtime)                       │ Expo Push (FCM/APNs)
┌──────────▼──────────────────── Supabase (Backend) ──────▼──────────────────────────────┐
│  PostgREST API (auto, versioned via views)   Auth (OTP/social, JWT)                    │
│  Realtime (chat, offer notifications)        Storage + CDN (listing images)            │
│  Edge Functions (Deno/TS):                                                             │
│    offer-notify · deal-transition · fee-ledger · opn-webhook (Phase 2) · push-fanout  │
│  Postgres 15: RLS ทุกตาราง · pg_cron (match sweep) · audit triggers                    │
└──────────┬──────────────────────────────────────────────────────────────────────────────┘
           │ Webhook (signed)                 
┌──────────▼─────────────┐   ┌──────────────────┐   ┌─────────────────────────┐
│ Opn Payments (Phase 2) │   │ Sentry (crash/   │   │ PostHog (analytics +    │
│ PromptPay QR · Transfer│   │ perf, app+edge)  │   │ feature flags/AB, self- │
│ Account Chaining       │   └──────────────────┘   │ serve free tier)        │
└────────────────────────┘                          └─────────────────────────┘
```

### Sync / Offline flow
```
อ่าน:  UI → TanStack Query → (cache MMKV persist) → ถ้า stale → supabase-js → Postgres
       offline → เสิร์ฟจาก persisted cache (ดู feed/แชทเก่า/ประกาศตัวเองได้)
เขียน: UI → mutation → optimistic update → ถ้า offline → outbox (expo-sqlite)
       → เมื่อ online (NetInfo listener + expo-task-manager background) → replay ตามลำดับ
       → ทุก mutation สำคัญแนบ idempotency_key (uuid v7) → server upsert kill duplicate
Conflict: Last-Write-Wins ด้วย updated_at + version column สำหรับ listing
          ยกเว้น deal state machine → ห้าม LWW ใช้ transition guard ใน Postgres function
Realtime: Supabase Realtime channel ต่อ deal/chat → reconnect + fetch missed ด้วย
          `created_at > last_seen` cursor เมื่อ WS กลับมา
```

### Escrow flow (Phase 2)
```
ดีลตกลง → Edge Fn สร้าง charge (PromptPay QR, amount = ราคา) → ผู้ซื้อสแกนจ่าย
→ opn-webhook (ตรวจ signature) → deal.status = 'paid_held'
→ นัดรับ → ผู้ซื้อตรวจของตรงตามประกาศ กดยืนยัน inspection ผ่าน (หรือ auto-release 3 วันหลังส่งมอบ + ไม่มี dispute)
→ Edge Fn สั่ง Transfer ให้ผู้ขาย (ราคา − ค่าธรรมเนียม) → deal.status = 'completed'
→ dispute → freeze + admin review (RBAC: admin เท่านั้น)
ทุก state transition = Postgres function เดียว (SERIALIZABLE) + audit_log
```

---

## 2. Trade-off Analysis

### 2.1 App framework
| เกณฑ์ | **React Native + Expo ✅** | Flutter | Native (Swift+Kotlin) | KMP |
|---|---|---|---|---|
| ตรงสกิลทีม (TypeScript) | ✅ ตรง 100% | ❌ Dart ใหม่ทั้งทีม | ❌ 2 ภาษาใหม่ | ❌ Kotlin ใหม่ |
| MVP 1 สัปดาห์ | ✅ Expo Router + EAS เร็วสุด | พอได้แต่บวกเวลาเรียน Dart | ❌ ×2 codebase | ❌ setup ช้า |
| Native API ที่ต้องใช้ (กล้อง, push, location) | ✅ มี Expo modules ครบ | ✅ | ✅ ดีสุด | ✅ |
| OTA update | ✅ EAS Update (ถูกกฎ store สำหรับ JS bundle) | ❌ Shorebird แยกจ่าย | ❌ ไม่มี | ❌ |
| ประสิทธิภาพ list ยาว | ดี (FlashList + New Architecture) | ดีมาก | ดีสุด | ดี |
| **ตัดสิน** | **เลือก** | ตัดทิ้ง: ต้นทุนเรียนรู้ | ตัดทิ้ง: ทีม/เวลาไม่พอ | ตัดทิ้ง: ecosystem UI ยังเด็ก |

**Pinned:** `expo@~57.0.2` (React Native 0.86, React 19.3) · New Architecture enabled · min iOS 15.1 / Android API 24
*(pin exact ผ่าน `package-lock.json` ตอน init — ตัวเลข patch เปลี่ยนรายสัปดาห์)*

### 2.2 Backend (โจทย์: save cost + ประสิทธิภาพดีสุด)
| เกณฑ์ | **Supabase ✅** | Custom Node (Fastify) | Firebase |
|---|---|---|---|
| ค่าใช้จ่าย 10k MAU | ✅ Free → Pro $25/mo | VPS+RDS ~$40–80/mo + เวลา ops | Free → Blaze คาดเดายาก (อ่านถี่แพง) |
| เร็วพอสำหรับ 1 สัปดาห์ | ✅ Auth/Realtime/Storage สำเร็จรูป | ❌ สร้าง auth เอง 2–3 วัน | ✅ |
| Query แบบ marketplace (filter/join/geo) | ✅ Postgres เต็มรูป + PostGIS | ✅ | ❌ NoSQL join/filter ลำบาก |
| TypeScript ทั้ง stack | ✅ Edge Functions = Deno TS + typegen | ✅ | บางส่วน |
| Lock-in | ต่ำ (Postgres มาตรฐาน ย้ายออกได้) | ไม่มี | ❌ สูง |
| **ตัดสิน** | **เลือก** | ตัดทิ้ง: ไม่ทัน timeline | ตัดทิ้ง: query + cost model ไม่เหมาะ |

### 2.3 UI Library & State
| ชั้น | เลือก | เหตุผล / ทางเลือกที่ตัด |
|---|---|---|
| Design system | **React Native Paper v5** (Material 3) | ครบ component พื้นฐาน + theming + a11y ในตัว · ตัด Tamagui (config ซับซ้อน กินเวลา setup), gluestack (churn ของ API สูง) |
| Navigation | **Expo Router v6** | file-based, typed routes, deep link ฟรี |
| Server state | **TanStack Query v5** + MMKV persister | cache + retry + offline persist มาตรฐานอุตสาหกรรม |
| UI state | **Zustand v5** | เบา ไม่มี boilerplate · ตัด Redux (เกินจำเป็น) |
| Forms/validation | **react-hook-form + zod** | zod ใช้ซ้ำได้ทั้ง client และ Edge Functions |
| List | **@shopify/flash-list v2** | 60fps feed รูปเยอะ |
| i18n | **i18next + react-i18next** | plural rules th/en/zh, ICU format |
| Local DB | **expo-sqlite** (outbox + drafts) + **react-native-mmkv** (query cache) | ตัด WatermelonDB/Isar: sync engine เต็มรูปเกินจำเป็นสำหรับ scope offline ระดับนี้ |

---

## 3. Database Schema

### 3.1 Backend (Postgres) — ERD ย่อ
```
profiles 1──n listings 1──n listing_images
listings 1──n conversations (ต่อคู่ buyer×listing) 1──n messages
conversations 1──n offers (เสนอ/ต่อรองได้หลายรอบ)
offers 1──0..1 deals 1──n deal_events (audit)
deals 1──0..1 payments (Phase 2)
profiles 1──n reviews (ต่อ deal สำเร็จ)
profiles 1──n reports · notifications · saved_searches
categories 1──n category_fields (template รายละเอียดต่อหมวด)
```

### 3.2 ตารางหลัก (คอลัมน์สำคัญ)
```sql
-- ทุกตารางมี: id uuid pk default gen_random_uuid(), created_at, updated_at
-- RLS เปิดทุกตาราง (นโยบายสรุปใน §14 RBAC)

profiles      (auth_user_id fk→auth.users, display_name, avatar_url, phone_verified bool,
               role text check in ('user','admin') default 'user',
               locale text default 'th', trust_score int, banned_at timestamptz)

categories    (slug, name_i18n jsonb, parent_id, sort_order)
category_fields(category_id fk, key, label_i18n jsonb, type text/*text|number|select*/,
               options jsonb, required bool)   -- template รายละเอียดของแต่ละหมวด

listings      (seller_id fk, category_id fk, title, description,
               attributes jsonb,               -- ค่าจาก category_fields
               condition text check in ('like_new','good','fair','poor'),
               asking_price numeric(12,2), currency char(3) default 'THB',
               province_code text, geo geography(point),   -- PostGIS
               status text check in ('draft','active','matched','sold','removed'),
               version int default 1,          -- optimistic lock
               search_tsv tsvector generated)  -- full-text th/en

listing_images(listing_id fk, storage_path, sort_order, width, height, blurhash)

conversations (listing_id fk, buyer_id fk, seller_id fk,
               unique(listing_id, buyer_id))

offers        (conversation_id fk, listing_id fk, buyer_id fk,
               amount numeric(12,2) check > 0, note text,
               status text check in ('pending','accepted','declined',
                                     'withdrawn','expired'),
               expires_at timestamptz default now()+interval '48 hours',
               -- partial unique index: 1 pending offer ต่อ conversation
               responded_at timestamptz)

messages      (conversation_id fk, sender_id fk, body text, image_path text,
               client_id uuid unique,          -- idempotency จาก outbox
               delivered_at, read_at)

deals         (offer_id fk unique, agreed_price numeric(12,2),
               fee_amount numeric(12,2), fee_rate numeric(5,4),   -- เช่น 0.03
               method text check in ('meetup','ship','escrow'),
               status text check in ('accepted','meetup_planned','inspection_passed',
                                     'inspection_failed','paid_held','completed',
                                     'disputed','cancelled'),
               idempotency_key uuid unique, buyer_confirmed_at, seller_confirmed_at)
deal_events   (deal_id fk, actor_id fk, from_status, to_status, meta jsonb) -- audit

payments      (deal_id fk, provider text default 'opn', charge_id text unique,
               transfer_id text, amount, fee, status,
               webhook_payload jsonb, signature_verified bool)    -- Phase 2

reviews       (deal_id fk, reviewer_id fk, reviewee_id fk, rating int 1..5, body,
               unique(deal_id, reviewer_id))
saved_searches(user_id fk, query jsonb, notify bool)
notifications (user_id fk, type, payload jsonb, read_at, push_sent_at)
reports       (reporter_id fk, target_type, target_id uuid, reason, status)
audit_log     (actor_id, action, target_type, target_id, meta jsonb) -- admin actions
app_config    (key pk, value jsonb)  -- min_supported_version, fee_rate, kill_switches
```

**Deal state machine (บังคับใน Postgres function เดียว — กัน race):**
`offer:accepted → deal:accepted → meetup_planned → inspection_passed → (paid_held →) completed`
· `inspection_failed → cancelled` (ของไม่ตรงประกาศ = ดีลไม่เกิด **ไม่เก็บ fee**, นับ strike ผู้ขายใน trust score)
· แตกแขนง `disputed`, `cancelled` · ทุก transition ตรวจ role + สถานะเดิม + เขียน `deal_events` ใน transaction เดียว (SERIALIZABLE) · รับ offer สำเร็จจะ decline offer อื่นที่ pending ของ listing เดียวกันอัตโนมัติ + listing.status='matched'

### 3.3 Local DB (expo-sqlite)
```sql
outbox        (id, op_type, payload json, idempotency_key, retry_count,
               next_retry_at, created_at)          -- replay เรียงตาม created_at
drafts        (id, kind /*listing|buy_request*/, payload json, updated_at)
kv_meta       (key pk, value)                       -- last_sync cursors, schema_version
-- migration: PRAGMA user_version + ไฟล์ migrations/000N.sql รันเรียงลำดับ
-- query cache (feed/chat) อยู่ใน MMKV ผ่าน TanStack persister — ทิ้งได้ ไม่ต้อง migrate
```

**Backup/restore policy:** token อยู่ใน expo-secure-store (Keychain/Keystore, `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` = ไม่ติด iCloud/Auto Backup) · SQLite outbox/drafts exclude จาก Android Auto Backup (`android:fullBackupContent` rules) เพราะ replay ข้ามเครื่องอันตราย · ข้อมูลจริงอยู่ server ทั้งหมด reinstall แล้ว login ใหม่ได้ครบ

**Backend DR:** Supabase Pro daily backup (RPO 24h, RTO ~1h) + `pg_dump` รายวันเก็บ Cloudflare R2 ผ่าน GitHub Actions cron · migration แบบ zero-downtime: expand → migrate → contract (ห้าม drop column ใน release เดียวกับที่เลิกใช้)

---

## 4. Directory Tree

### 4.1 App (Expo monorepo — pnpm workspaces)
```
yodkai/
├── package.json · pnpm-workspace.yaml · turbo.json
├── .github/workflows/           # ci.yml (lint+test+typecheck), eas-build.yml, backend.yml
├── apps/mobile/
│   ├── app/                     # Expo Router (file-based)
│   │   ├── _layout.tsx          # root: providers, theme, i18n, min-version gate
│   │   ├── (auth)/              # sign-in.tsx, otp.tsx, onboarding.tsx
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx      # bottom tabs
│   │   │   ├── index.tsx        # Home feed
│   │   │   ├── search.tsx
│   │   │   ├── sell/            # new-listing wizard (3 steps)
│   │   │   ├── inbox/           # offers (รับ/ส่ง) + chats list
│   │   │   └── me/              # profile, my listings, my deals, settings
│   │   ├── listing/[id].tsx     # + make-offer bottom sheet
│   │   ├── chat/[conversationId].tsx
│   │   └── deal/[id].tsx        # deal state UI + inspection confirm + (P2) pay
│   ├── src/
│   │   ├── features/            # feature modules — presentation+domain+data ต่อฟีเจอร์
│   │   │   ├── auth/ listings/ offers/ chat/ deals/
│   │   │   ├── payments/        # Phase 2
│   │   │   └── profile/ reviews/ notifications/
│   │   │       └── (แต่ละโมดูล: components/ hooks/ api.ts domain.ts types.ts)
│   │   ├── core/
│   │   │   ├── supabase/        # client.ts, generated types (supabase gen types)
│   │   │   ├── offline/         # outbox.ts, sync-engine.ts, sqlite migrations/
│   │   │   ├── i18n/            # th.json en.json zh.json + config
│   │   │   ├── theme/           # design tokens (MD3), dark mode
│   │   │   ├── analytics/       # posthog wrapper + event names (typed)
│   │   │   ├── config/          # remote config, feature flags, min-version check
│   │   │   └── ui/              # shared components: EmptyState, Skeleton, ErrorView
│   │   └── test/                # setup, fixtures, msw handlers
│   ├── e2e/                     # Maestro flows (.yaml)
│   ├── app.config.ts            # env variants: dev/staging/prod (แยก bundle id)
│   ├── eas.json                 # build profiles + EAS Update channels
│   └── .env.example
├── packages/shared/             # zod schemas + types ใช้ร่วม app ↔ edge functions
└── docs/ ADR/                   # adr-0001-stack.md, runbook.md, ...
```

### 4.2 Backend (Supabase ใน repo เดียวกัน)
```
supabase/
├── config.toml
├── migrations/                  # 0001_init.sql ... (declarative, CI apply)
├── functions/                   # Edge Functions (Deno TS)
│   ├── _shared/                 # auth guard, error contract, zod, rate-limit
│   ├── offer-notify/index.ts    # push เมื่อมี offer ใหม่/ถูกรับ/ปฏิเสธ + expiry sweep (pg_cron)
│   ├── deal-transition/index.ts # state machine endpoint (idempotent)
│   ├── push-fanout/index.ts     # Expo Push API
│   ├── opn-webhook/index.ts     # Phase 2: verify signature → payments
│   └── account-delete/index.ts  # ปุ่มลบบัญชี (บังคับโดย store)
├── seed.sql                     # categories + category_fields + demo users
└── tests/                       # pgTAP (RLS policies) + deno test (functions)
```

### API design & versioning
- อ่าน/เขียนทั่วไป: PostgREST ผ่าน **Postgres views แบบมี version** (`api_v1.listings`) — เปลี่ยน schema ภายในได้โดย view เดิมไม่พัง = client เก่าใช้ต่อได้
- Logic สำคัญ (deal transition, matching): Edge Functions path `/v1/...`
- **Error contract เดียวทั้งระบบ:** `{ error: { code: string, message: string, details?: object, retryable: boolean } }` + HTTP status ตรงความหมาย
- Backward compatibility: additive changes เท่านั้นใน v1; breaking → v2 + `min_supported_version` ใน `app_config` บังคับ force-update ผ่าน gate ใน `_layout.tsx` (มีตั้งแต่ release แรก)

---

## 5. Screen Inventory + User Journey

### 5.1 Navigation map
```
Splash/Gate(min-version) → (ยังไม่ login) Onboarding 3 หน้า → Sign-in (Phone OTP | Google | Apple*)
                         → (login แล้ว) Tabs:
  [Home] feed แนะนำ+ล่าสุด ─→ Listing Detail ─→ กด "เสนอราคา" (bottom sheet)
  [Search] filter หมวด/ราคา/จังหวัด/ระยะทาง ─→ ผลลัพธ์ ─→ Detail · บันทึกการค้นหา
  [Sell(+)] ลงขาย wizard 3 ขั้น: รูป → รายละเอียดตามหมวด → ราคา/พื้นที่
  [Inbox] Offers (ที่ได้รับ=ผู้ขาย / ที่ส่ง=ผู้ซื้อ, accept/decline) · Chats ─→ Chat ─→ Deal
  [Me] โปรไฟล์ · ประกาศของฉัน · ดีล · รีวิว · ตั้งค่า
Deal flow: ผู้ซื้อเสนอราคา → push ผู้ขาย → ผู้ขายกดรับ (เปิดแชทอัตโนมัติ) → นัดรับสินค้า
           → เจอกัน: ผู้ซื้อตรวจของ → ตรง=inspection_passed → (P2: จ่าย QR escrow) → completed → รีวิว
           → ไม่ตรง=inspection_failed → ยกเลิก ไม่เก็บ fee
* Sign in with Apple บังคับบน iOS เมื่อมี social login อื่น
```

### 5.2 Screen inventory (MVP = 24 หน้าจอ)
| # | Screen | หน้าที่ | สถานะที่ต้องมี |
|---|---|---|---|
| 1 | Splash + version gate | โหลด config, บังคับอัปเดต | loading, force-update |
| 2–4 | Onboarding ×3 | คุณค่าแอป + ขอ notification แบบมี context (หน้า 3) | skip ได้ |
| 5 | Sign-in | Phone OTP หลัก + Google + Apple(iOS) | error, loading |
| 6 | OTP verify | 6 หลัก + resend timer | wrong code, expired |
| 7 | Profile setup | ชื่อ, จังหวัด, ภาษา | — |
| 8 | Home feed | ประกาศแนะนำ/ใกล้ฉัน/ล่าสุด | skeleton, empty, offline banner |
| 9 | Search + filters | full-text + facet | empty("บันทึกการค้นหา รับแจ้งเตือนเมื่อมีของ" CTA), recent |
| 10 | Listing detail | รูป gallery, attributes, ผู้ขาย+trust, ปุ่มแชท/เสนอซื้อ | sold, removed |
| 11 | Create listing (3 ขั้น) | รูป≤10 (บีบอัด+blurhash) → template หมวด → ราคา/พื้นที่ | draft autosave, offline queue |
| 12 | Make offer sheet | จำนวนเงิน + note + อายุข้อเสนอ 48h (จาก listing detail) | validation, มี pending อยู่แล้ว |
| 13 | Offers received (ผู้ขาย) | รายการข้อเสนอต่อประกาศ + accept/decline | empty, expired |
| 14 | Offers sent (ผู้ซื้อ) | สถานะข้อเสนอ + withdraw | empty |
| 15 | Chats list | unread, last message | empty |
| 16 | Chat room | realtime (เปิดอัตโนมัติเมื่อ offer ถูกรับ), รูป, ปุ่มนัดรับ, ส่งซ้ำเมื่อ fail | offline queue, blocked |
| 17 | Deal sheet/detail | state machine UI, นัดรับ, **ปุ่มยืนยัน "ของตรงตามประกาศ" (ผู้ซื้อ)**, (P2) QR จ่าย | ทุก status + inspection_failed + dispute |
| 18 | Review form | ดาว + ข้อความ หลังดีลจบ | — |
| 19 | My listings / requests | จัดการ, ปิดการขาย | empty |
| 20 | My deals | active/history + ค่าธรรมเนียม | empty |
| 21 | Public profile | รีวิว, ของที่ขาย, trust score | banned |
| 22 | Settings | ภาษา th/en/zh, dark mode, แจ้งเตือน, **ลบบัญชี**, ToS/licenses | — |
| 23 | Notifications center | รายการ + deep link | empty |
| 24 | Report/Block sheet | เหตุผล + ส่ง | — |

ทุกหน้ามีครบ: loading (skeleton) / empty / error+retry / offline ตามข้อ 8

### 5.3 User journeys หลัก (วัด funnel รายขั้นใน PostHog)
1. **Seller:** เปิดแอป → onboarding → OTP → ลงขาย (≤3 นาที ถึง first value) → ได้ push "มีคนเสนอราคา" → กดรับ → แชทนัดรับ → ผู้ซื้อตรวจของผ่าน → ได้เงิน(-fee) → รีวิว
2. **Buyer:** ค้นหา/เลื่อน feed → เข้า listing → เสนอราคา → push "ผู้ขายรับข้อเสนอ" → แชทนัดรับ → ตรวจของตรงประกาศ → จ่าย QR (P2) → completed → รีวิว
3. **Activation metric:** ลงประกาศแรกสำเร็จ (seller) / ส่งข้อเสนอแรก (buyer)

### 5.4 ฟีเจอร์เสริมที่เสนอ (ตามที่ขอให้ช่วยคิด)
| ฟีเจอร์ | คุณค่า | เฟส |
|---|---|---|
| Template รายละเอียดต่อหมวด (`category_fields`) | บังคับข้อมูลครบ → เป็นเกณฑ์ตรวจ "ของตรงตามประกาศ" ตอน inspection | **MVP** |
| Saved search + push เมื่อมีของใหม่ตรงเงื่อนไข | re-engagement หลัก | **MVP** |
| Trust score + ยืนยันเบอร์/รีวิว | ลด scam — จุดตายของ marketplace มือสอง | MVP (พื้นฐาน) |
| AI ช่วยตั้งราคา (เทียบราคาปิดดีลในหมวดเดียวกัน) | ลด friction ผู้ขายมือใหม่ | P2 |
| AI อ่านรูป → เติมหมวด/สภาพ/รายละเอียดอัตโนมัติ | ลงประกาศเร็วขึ้นมาก | P3 |
| QR ยืนยันนัดรับของ (สแกนตอนเจอกัน = delivered) | หลักฐานส่งมอบสำหรับ escrow release | P2 |
| Boost ประกาศ (จ่ายเพื่อดันอันดับ) | รายได้เสริม — physical marketplace ใช้ payment ปกติได้ ไม่บังคับ IAP แต่ต้องรีวิวกฎ store ก่อนเปิด | P3 |

---

## 6. Checklist ครบ 20 ข้อ + Store Submission

สัญลักษณ์: ✅ = อยู่ใน MVP Week 1 · 🔶 = ต้องมีก่อน submit store · ⏳ = Phase 2+ (ไม่บล็อก launch)

| ข้อ | รายการ | สถานะ/แผน |
|---|---|---|
| 1 | Architecture & Scalability | ✅ §1–2, §4 — RN+Expo, Clean-ish layering, feature modules, versioned views API |
| 2 | Reliability/Offline | ✅ outbox+idempotency+LWW (§1,3) · SLO: crash-free ≥99.5%, ANR <0.47%, uptime 99.9% · ⏰ DR drill = P2 |
| 3 | Performance | ✅ เป้า: cold start <2s, TTI <3s, 60fps (FlashList), APK/AAB download <40MB · วัดด้วย Sentry perf + Android Profiler/Instruments · image: expo-image + WebP + Supabase CDN transform |
| 4 | Security | ✅ MASVS baseline: SecureStore, TLS, RLS, zod ทุก input, R8 obfuscation, rate limit (Edge Fn + pg) · ⏳P2: cert pinning, Play Integrity/App Attest, root detect · 🔶 webhook signature (พร้อม escrow) |
| 5 | Observability | ✅ Sentry (crash+ANR+perf, dSYM/mapping ผ่าน EAS อัตโนมัติ) + PostHog events + Supabase logs · alert: crash-free <99.5% หลัง release, error rate webhook |
| 6 | Infra & Cost | ✅ Supabase migrations = IaC, GitHub Actions + EAS Build/Submit, fastlane ไม่ต้องใช้ (EAS จัดการ signing) · ประมาณการ §7 |
| 7 | ASO | 🔶 ชื่อ+keyword th/en, screenshots 3 ภาษา, in-app review API หลังดีลสำเร็จ (จังหวะ happy) · deep link: `yodkai://` + Universal/App Links + landing page (Cloudflare Pages, JSON-LD SoftwareApplication) |
| 8 | UX/A11y | ✅ MD3 + HIG spacing, Dynamic Type, contrast AA, touch ≥48dp, dark mode, empty/loading/error/offline ครบ (ตาราง §5.2) · permission แบบมี context |
| 9 | Privacy/PDPA | 🔶 consent ก่อนเปิด analytics (PostHog `opt_in` หลังยินยอมเท่านั้น), ปุ่มลบบัญชี (Edge Fn ลบจริง), Privacy Policy th/en, ATT (iOS — ไม่มี ads SDK = แจ้ง "ไม่ tracking" ใน Nutrition Label), Data Safety form ตรงจริง |
| 10 | Growth | ✅ event plan: `app_open → onboarding_done → first_listing / first_message → match_accepted → deal_completed` (snake_case, typed ใน analytics wrapper) · PostHog feature flags = kill switch + A/B |
| 11 | i18n | ✅ th default + en, zh ตาม · i18next + ICU plural · Intl.NumberFormat THB · store listing แยก locale |
| 12 | Testing | ✅ Jest+RNTL (domain+hooks), pgTAP (RLS), Maestro E2E: สมัคร→ลงขาย→แมตช์→แชท→ดีล · case: offline, permission denied, kill กลางทาง · device matrix: Android low-end (RAM 3GB), iPhone SE-class, จอใหญ่ |
| 13 | Docs | ✅ README + ADR-0001(stack), ADR-0002(escrow-phasing) + runbook (bad release: halt rollout → kill switch flag → EAS Update rollback) · TS strict + ESLint+Prettier ใน CI |
| 14 | RBAC & Data | ✅ roles: user/admin — RLS: อ่าน public listing ได้ทุกคน, แก้เฉพาะเจ้าของ, deal เห็นเฉพาะคู่กรณี, admin ผ่าน service role + audit_log · ERD §3 · seed.sql + msw fixtures |
| 15 | Release Eng | ✅ dev/staging/prod แยก bundle id + Supabase project · staged rollout 10→50→100% · halt เกณฑ์: crash-free <99% · **min-version gate ตั้งแต่ release แรก** · EAS Update = OTA (JS เท่านั้น ถูกกฎ store) · pnpm lockfile + dependabot + `pnpm audit` ใน CI · load test: k6 ที่ p95<500ms @ 2× คาดการณ์ |
| 16 | Content & Comms | ✅ เนื้อหาแก้ได้ไม่ต้อง release: categories/fee/ประกาศ ใน DB + app_config · push ประเภท: match ใหม่, ข้อความ, ดีลเปลี่ยนสถานะ (มี quiet hours 22:00–08:00 + collapse key) · email OTP/transactional ผ่าน Resend + SPF/DKIM/DMARC · ToS + OSS licenses ใน Settings |
| 17 | Success criteria | Product: D1 ≥35%, D7 ≥15%, listing→offer ≥25%, offer→deal สำเร็จ ≥15%, rating ≥4.3 · Tech: crash-free ≥99.5%, ANR <0.47%, p95 API <500ms, cold start <2s |
| 18 | Product definition | ✅ §5 |
| 19 | Design direction | เสนอ 3 ทาง (เลือกตอน approve): (a) **Trust Green** — เขียว #00B14F + Noto Sans Thai, mood เป็นกันเอง อ้างอิง Kaidee/Carousell · (b) Warm Amber — ส้ม #F59E0B mood ตลาดนัด มีชีวิตชีวา · (c) Minimal Slate — น้ำเงินเทา premium อ้างอิง Mercari |
| 20 | Integrations | Distribution: Play Store + App Store (TestFlight/Internal ก่อน) · 3rd party: Supabase, Opn Payments (P2 — physical goods ไม่บังคับ IAP), Google/Apple sign-in, Expo Push, Sentry, PostHog · ไม่มี subscription/IAP ใน scope |

### Store submission checklist (ก่อนกด submit)
- [ ] Privacy Policy URL ออนไลน์ (th/en) + Account deletion URL (Google บังคับ)
- [ ] iOS: Sign in with Apple เปิดอยู่ · Privacy Nutrition Labels + Privacy Manifest ตรงจริง · export compliance (ใช้ HTTPS มาตรฐาน = exempt)
- [ ] Android: Data Safety form · target API ล่าสุดตามกำหนด Play · POST_NOTIFICATIONS runtime permission
- [ ] Age rating ตรง (มี UGC + chat → ต้องมี report/block ✅ มีแล้ว §5.2 #24)
- [ ] UGC policy: กลไก report + block + moderation (admin) — Apple 1.2 บังคับ
- [ ] Screenshots + description อย่างน้อย th, en
- [ ] ทดสอบ deep link + push บน build production จริง (ไม่ใช่ dev client)

---

## 7. ประมาณการค่าใช้จ่ายรายเดือน

| รายการ | 10k MAU | 100k MAU (10×) | วิธีคุมต้นทุน |
|---|---|---|---|
| Supabase | $0–25 (Pro) | ~$100–250 (Pro + compute upgrade) | index ให้ครบ, CDN cache รูป, realtime เฉพาะห้องแชทที่เปิดอยู่ |
| รูปภาพ (Storage+CDN) | รวมใน Pro (~100GB) | +$20–50 | บีบอัด client-side ≤300KB/รูป, WebP, ลบรูปประกาศเก่า >180 วัน |
| Expo EAS | $0 (free tier build พอ) | $19–99 (Production plan) | build เฉพาะ release, OTA แทน build |
| Sentry | $0 (dev tier) | ~$26–80 | sample rate perf 10% |
| PostHog | $0 (1M events ฟรี) | ~$50–150 | ส่งเฉพาะ event ใน plan, ไม่ autocapture |
| Push (Expo) | $0 | $0 | — |
| Resend (email) | $0 (3k/เดือน) | ~$20 | OTP หลักผ่าน SMS ของ Supabase Auth phone provider* |
| Domain + landing (Cloudflare) | ~$1 | ~$1 | — |
| Developer accounts | Apple $99/ปี + Google $25 ครั้งเดียว | เท่าเดิม | — |
| Opn Payments (P2) | ต่อธุรกรรม (PromptPay ~1.5–1.65%+VAT — ยืนยันเรทตอนสมัคร) | ต่อธุรกรรม | บวกเข้า fee model |
| **รวม (ไม่รวมค่าธุรกรรม)** | **~$30–40/เดือน** | **~$250–550/เดือน** | |

\* SMS OTP ไทยมีค่าส่งต่อข้อความ (~฿0.3–0.6) — ที่ 10k MAU คาด ~$30–60/เดือน ลดได้ด้วย session อายุยาว + refresh token rotation (login ซ้ำน้อย)

---

## 8. วิธีตรวจรับเฟส 1 + Next Steps

**ตรวจรับเฟสนี้:** review เอกสารนี้ → ยืนยัน A1–A5 (§0) → เลือก design direction (19a/b/c) → ตัดสินใจ conflict flag #2 (โมเดล escrow: ถือเงินเอง vs Account Chaining vs เลื่อน) → พิมพ์ approve

**แผน implementation เมื่อ approve (เรียงตามลำดับที่แนะนำ):**
1. `Scaffold + CI` — monorepo, Expo app 3 variants, Supabase local (`supabase start` ผ่าน docker), lint/test gates → *ทดสอบ: `pnpm i && pnpm dev` รันบน emulator ได้ใน 30 นาทีตาม .env.example*
2. `Auth + Profile + min-version gate` → *ทดสอบ: OTP login บน simulator, ปรับ min_version ใน DB แล้วแอปบังคับอัปเดต*
3. `Listings + หมวด/template` → *ทดสอบ: ลงประกาศ offline แล้ว sync เมื่อ online*
4. `Offers + push (เสนอ/รับ/ปฏิเสธ/หมดอายุ)` → *ทดสอบ: เสนอราคาจาก user B → push เด้งที่ user A ใน <10s, กดรับแล้ว offer อื่นถูก decline อัตโนมัติ*
5. `Chat realtime + Deal state machine (รวม inspection gate)` → *ทดสอบ: Maestro E2E flow เต็ม + pgTAP transition guards (inspection_failed ต้องไม่เก็บ fee)*
6. `i18n + a11y + empty/error states + consent` → *ทดสอบ: สลับ 3 ภาษา, TalkBack/VoiceOver ผ่าน flow หลัก*
7. `Store prep + staged release`
8. *(Phase 2)* `Escrow: Opn charge/webhook/transfer + dispute + QR ยืนยันรับของ`

สั่งเริ่มได้เลย เช่น **"เริ่มข้อ 1 Scaffold + CI"** — โค้ดจะส่งเต็มไฟล์พร้อม path ทุกครั้งตามกติกา


