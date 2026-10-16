-- ============================================================================
-- 0001 INIT — Yodkai offer-based marketplace (BLUEPRINT.md §3, rev.2 per A4)
-- Flow: listing -> offer -> accept -> meetup -> inspection gate -> completed
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists postgis;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  display_name  text not null default '',
  avatar_url    text,
  phone_verified boolean not null default false,
  role          text not null default 'user' check (role in ('user','admin')),
  locale        text not null default 'th' check (locale in ('th','en','zh')),
  trust_score   integer not null default 100,
  banned_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (auth_user_id, phone_verified)
  values (new.id, new.phone is not null);
  return new;
end $$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_profile_id()
returns uuid language sql stable as $$
  select id from public.profiles where auth_user_id = auth.uid()
$$;

-- ----------------------------------------------------------------------------
-- categories + per-category detail templates
-- ----------------------------------------------------------------------------

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name_i18n  jsonb not null,             -- {"th":"…","en":"…","zh":"…"}
  parent_id  uuid references public.categories(id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.category_fields (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  key         text not null,
  label_i18n  jsonb not null,
  type        text not null check (type in ('text','number','select')),
  options     jsonb,                     -- for type=select
  required    boolean not null default false,
  sort_order  integer not null default 0,
  unique (category_id, key)
);

-- ----------------------------------------------------------------------------
-- listings
-- ----------------------------------------------------------------------------

create table public.listings (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references public.profiles(id),
  category_id   uuid not null references public.categories(id),
  title         text not null check (char_length(title) between 3 and 120),
  description   text not null default '' check (char_length(description) <= 4000),
  attributes    jsonb not null default '{}'::jsonb,  -- values for category_fields
  condition     text not null check (condition in ('like_new','good','fair','poor')),
  asking_price  numeric(12,2) not null check (asking_price >= 0),
  currency      char(3) not null default 'THB',
  province_code text,
  geo           geography(point, 4326),
  status        text not null default 'active'
                check (status in ('draft','active','matched','sold','removed')),
  version       integer not null default 1,          -- optimistic lock
  -- 'simple' config: no built-in Thai stemmer; good-enough tokenization
  search_tsv    tsvector generated always as
                (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_listings_feed   on public.listings (status, created_at desc);
create index idx_listings_cat    on public.listings (category_id, status);
create index idx_listings_seller on public.listings (seller_id);
create index idx_listings_tsv    on public.listings using gin (search_tsv);
create index idx_listings_geo    on public.listings using gist (geo);

create trigger trg_listings_updated before update on public.listings
  for each row execute function public.set_updated_at();

create table public.listing_images (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  storage_path text not null,
  sort_order   integer not null default 0,
  width        integer,
  height       integer,
  blurhash     text,
  created_at   timestamptz not null default now()
);

create index idx_listing_images on public.listing_images (listing_id, sort_order);

-- ----------------------------------------------------------------------------
-- conversations + offers + messages  (A4 offer-based flow)
-- ----------------------------------------------------------------------------

create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  buyer_id   uuid not null references public.profiles(id),
  seller_id  uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);

create index idx_conversations_buyer  on public.conversations (buyer_id);
create index idx_conversations_seller on public.conversations (seller_id);

create table public.offers (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  listing_id      uuid not null references public.listings(id),
  buyer_id        uuid not null references public.profiles(id),
  amount          numeric(12,2) not null check (amount > 0),
  note            text check (char_length(note) <= 500),
  status          text not null default 'pending'
                  check (status in ('pending','accepted','declined','withdrawn','expired')),
  expires_at      timestamptz not null default now() + interval '48 hours',
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- one live offer per conversation at a time
create unique index uq_offers_one_pending
  on public.offers (conversation_id) where (status = 'pending');
create index idx_offers_listing on public.offers (listing_id, status);

create trigger trg_offers_updated before update on public.offers
  for each row execute function public.set_updated_at();

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  sender_id       uuid not null references public.profiles(id),
  body            text check (char_length(body) <= 2000),
  image_path      text,
  client_id       uuid not null unique,   -- idempotency key from offline outbox
  delivered_at    timestamptz,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  check (body is not null or image_path is not null)
);

create index idx_messages_conv on public.messages (conversation_id, created_at desc);

-- ----------------------------------------------------------------------------
-- deals + audit trail
-- ----------------------------------------------------------------------------

create table public.deals (
  id                  uuid primary key default gen_random_uuid(),
  offer_id            uuid not null unique references public.offers(id),
  agreed_price        numeric(12,2) not null check (agreed_price > 0),
  fee_rate            numeric(5,4) not null,
  fee_amount          numeric(12,2) not null,
  method              text not null default 'meetup'
                      check (method in ('meetup','ship','escrow')),
  status              text not null default 'accepted'
                      check (status in ('accepted','meetup_planned','inspection_passed',
                                        'inspection_failed','paid_held','completed',
                                        'disputed','cancelled')),
  idempotency_key     uuid not null unique,
  buyer_confirmed_at  timestamptz,
  seller_confirmed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger trg_deals_updated before update on public.deals
  for each row execute function public.set_updated_at();

create table public.deal_events (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id),
  actor_id    uuid references public.profiles(id),
  from_status text,
  to_status   text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index idx_deal_events on public.deal_events (deal_id, created_at);

-- ----------------------------------------------------------------------------
-- reviews, saved searches, notifications, reports, audit, app_config
-- ----------------------------------------------------------------------------

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id),
  reviewer_id uuid not null references public.profiles(id),
  reviewee_id uuid not null references public.profiles(id),
  rating      integer not null check (rating between 1 and 5),
  body        text check (char_length(body) <= 1000),
  created_at  timestamptz not null default now(),
  unique (deal_id, reviewer_id)
);

create table public.saved_searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  query      jsonb not null,
  notify     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  push_sent_at timestamptz,
  created_at   timestamptz not null default now()
);

create index idx_notifications_user on public.notifications (user_id, created_at desc);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('listing','profile','message')),
  target_id   uuid not null,
  reason      text not null,
  status      text not null default 'open' check (status in ('open','reviewed','actioned','dismissed')),
  created_at  timestamptz not null default now()
);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  action      text not null,
  target_type text,
  target_id   uuid,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value) values
  ('min_supported_version', '"1.0.0"'),
  ('fee_rate', '0.03'),
  ('kill_switches', '{}');

-- ----------------------------------------------------------------------------
-- Business functions (single source of truth for state transitions)
-- ----------------------------------------------------------------------------

-- Buyer creates an offer; conversation is created lazily.
create or replace function public.create_offer(
  p_listing_id uuid,
  p_amount     numeric,
  p_note       text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_buyer   uuid := public.current_profile_id();
  v_seller  uuid;
  v_conv    uuid;
  v_offer   uuid;
begin
  if v_buyer is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select seller_id into v_seller
  from listings where id = p_listing_id and status = 'active'
  for update;

  if v_seller is null then
    raise exception 'LISTING_NOT_AVAILABLE';
  end if;
  if v_seller = v_buyer then
    raise exception 'CANNOT_OFFER_OWN_LISTING';
  end if;

  insert into conversations (listing_id, buyer_id, seller_id)
  values (p_listing_id, v_buyer, v_seller)
  on conflict (listing_id, buyer_id) do update set listing_id = excluded.listing_id
  returning id into v_conv;

  -- uq_offers_one_pending guards double-pending; surface a clean error
  begin
    insert into offers (conversation_id, listing_id, buyer_id, amount, note)
    values (v_conv, p_listing_id, v_buyer, p_amount, p_note)
    returning id into v_offer;
  exception when unique_violation then
    raise exception 'OFFER_ALREADY_PENDING';
  end;

  insert into notifications (user_id, type, payload)
  values (v_seller, 'offer_received',
          jsonb_build_object('offer_id', v_offer, 'listing_id', p_listing_id,
                             'amount', p_amount));
  return v_offer;
end $$;

-- Seller accepts an offer -> creates the deal, declines competing offers.
create or replace function public.accept_offer(
  p_offer_id        uuid,
  p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_caller  uuid := public.current_profile_id();
  v_offer   offers%rowtype;
  v_seller  uuid;
  v_fee     numeric;
  v_deal    uuid;
begin
  -- idempotent replay: same key returns the same deal
  select id into v_deal from deals where idempotency_key = p_idempotency_key;
  if v_deal is not null then
    return v_deal;
  end if;

  select * into v_offer from offers where id = p_offer_id for update;
  if v_offer.id is null then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  select seller_id into v_seller from listings where id = v_offer.listing_id for update;
  if v_seller is distinct from v_caller then
    raise exception 'NOT_LISTING_OWNER' using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'OFFER_NOT_PENDING';
  end if;
  if v_offer.expires_at < now() then
    update offers set status = 'expired', responded_at = now() where id = p_offer_id;
    raise exception 'OFFER_EXPIRED';
  end if;

  update offers set status = 'accepted', responded_at = now() where id = p_offer_id;

  -- auto-decline all other pending offers on this listing
  update offers set status = 'declined', responded_at = now()
  where listing_id = v_offer.listing_id and status = 'pending' and id <> p_offer_id;

  update listings set status = 'matched' where id = v_offer.listing_id;

  select (value)::numeric into v_fee from app_config where key = 'fee_rate';

  insert into deals (offer_id, agreed_price, fee_rate, fee_amount, idempotency_key)
  values (p_offer_id, v_offer.amount, v_fee, round(v_offer.amount * v_fee, 2),
          p_idempotency_key)
  returning id into v_deal;

  insert into deal_events (deal_id, actor_id, from_status, to_status)
  values (v_deal, v_caller, null, 'accepted');

  insert into notifications (user_id, type, payload)
  values (v_offer.buyer_id, 'offer_accepted',
          jsonb_build_object('deal_id', v_deal, 'listing_id', v_offer.listing_id));
  return v_deal;
end $$;

-- Guarded deal state machine. Inspection gate: only the BUYER can pass/fail
-- inspection ("ของต้องตรงตามประกาศ"); failed inspection cancels with NO fee.
create or replace function public.transition_deal(
  p_deal_id   uuid,
  p_to_status text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller   uuid := public.current_profile_id();
  v_deal     deals%rowtype;
  v_offer    offers%rowtype;
  v_is_buyer boolean;
  v_is_seller boolean;
  v_allowed  boolean := false;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if v_deal.id is null then
    raise exception 'DEAL_NOT_FOUND';
  end if;

  select * into v_offer from offers where id = v_deal.offer_id;
  select v_caller = v_offer.buyer_id into v_is_buyer;
  select v_caller = (select seller_id from listings where id = v_offer.listing_id)
    into v_is_seller;

  if not (v_is_buyer or v_is_seller) then
    raise exception 'NOT_DEAL_PARTICIPANT' using errcode = '42501';
  end if;

  -- transition guard matrix
  v_allowed := case
    when v_deal.status = 'accepted'       and p_to_status = 'meetup_planned'     then true
    when v_deal.status = 'meetup_planned' and p_to_status = 'inspection_passed'  then v_is_buyer
    when v_deal.status = 'meetup_planned' and p_to_status = 'inspection_failed'  then v_is_buyer
    when v_deal.status = 'inspection_passed' and p_to_status = 'completed'       then true  -- MVP (no escrow)
    when v_deal.status in ('accepted','meetup_planned') and p_to_status = 'cancelled' then true
    when v_deal.status in ('inspection_passed','paid_held') and p_to_status = 'disputed' then true
    else false
  end;

  if not v_allowed then
    raise exception 'INVALID_TRANSITION: % -> %', v_deal.status, p_to_status;
  end if;

  update deals set status = p_to_status where id = p_deal_id;

  -- side effects
  if p_to_status = 'inspection_failed' then
    -- item did not match the listing: deal dies, NO fee, listing reopens,
    -- seller takes a trust-score strike
    update deals set status = 'cancelled', fee_amount = 0 where id = p_deal_id;
    update listings set status = 'active' where id = v_offer.listing_id;
    update profiles set trust_score = greatest(trust_score - 10, 0)
    where id = (select seller_id from listings where id = v_offer.listing_id);
  elsif p_to_status = 'completed' then
    update listings set status = 'sold' where id = v_offer.listing_id;
  elsif p_to_status = 'cancelled' then
    update listings set status = 'active' where id = v_offer.listing_id;
  end if;

  insert into deal_events (deal_id, actor_id, from_status, to_status)
  values (p_deal_id, v_caller, v_deal.status, p_to_status);

  insert into notifications (user_id, type, payload)
  select p.id, 'deal_' || p_to_status, jsonb_build_object('deal_id', p_deal_id)
  from profiles p
  where p.id in (v_offer.buyer_id,
                 (select seller_id from listings where id = v_offer.listing_id))
    and p.id <> v_caller;
end $$;

-- ----------------------------------------------------------------------------
-- Row Level Security (enforced at the database — clients only hide UI)
-- ----------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.category_fields enable row level security;
alter table public.listings        enable row level security;
alter table public.listing_images  enable row level security;
alter table public.conversations   enable row level security;
alter table public.offers          enable row level security;
alter table public.messages        enable row level security;
alter table public.deals           enable row level security;
alter table public.deal_events     enable row level security;
alter table public.reviews         enable row level security;
alter table public.saved_searches  enable row level security;
alter table public.notifications   enable row level security;
alter table public.reports         enable row level security;
alter table public.audit_log       enable row level security;
alter table public.app_config      enable row level security;

-- public reference data
create policy sel_categories on public.categories for select using (true);
create policy sel_category_fields on public.category_fields for select using (true);
create policy sel_app_config on public.app_config for select using (true);

-- profiles: everyone can view public profile info; owner updates own row
create policy sel_profiles on public.profiles for select using (true);
create policy upd_profiles on public.profiles for update
  using (auth_user_id = auth.uid());

-- listings: active listings are public; owners see & manage their own
create policy sel_listings on public.listings for select
  using (status in ('active','matched','sold') or seller_id = public.current_profile_id());
create policy ins_listings on public.listings for insert
  with check (seller_id = public.current_profile_id());
create policy upd_listings on public.listings for update
  using (seller_id = public.current_profile_id());

create policy sel_listing_images on public.listing_images for select using (true);
create policy ins_listing_images on public.listing_images for insert
  with check (exists (select 1 from public.listings l
              where l.id = listing_id and l.seller_id = public.current_profile_id()));
create policy del_listing_images on public.listing_images for delete
  using (exists (select 1 from public.listings l
         where l.id = listing_id and l.seller_id = public.current_profile_id()));

-- conversations/offers/messages/deals: participants only.
-- Writes go through the security-definer functions above; direct DML denied.
create policy sel_conversations on public.conversations for select
  using (buyer_id = public.current_profile_id() or seller_id = public.current_profile_id());

create policy sel_offers on public.offers for select
  using (buyer_id = public.current_profile_id()
         or exists (select 1 from public.conversations c
                    where c.id = conversation_id
                      and c.seller_id = public.current_profile_id()));
create policy upd_offers_withdraw on public.offers for update
  using (buyer_id = public.current_profile_id() and status = 'pending')
  with check (status = 'withdrawn');

create policy sel_messages on public.messages for select
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_id
                   and (c.buyer_id = public.current_profile_id()
                        or c.seller_id = public.current_profile_id())));
create policy ins_messages on public.messages for insert
  with check (sender_id = public.current_profile_id()
              and exists (select 1 from public.conversations c
                          where c.id = conversation_id
                            and (c.buyer_id = public.current_profile_id()
                                 or c.seller_id = public.current_profile_id())));

create policy sel_deals on public.deals for select
  using (exists (select 1 from public.offers o
                 join public.conversations c on c.id = o.conversation_id
                 where o.id = offer_id
                   and (c.buyer_id = public.current_profile_id()
                        or c.seller_id = public.current_profile_id())));

create policy sel_deal_events on public.deal_events for select
  using (exists (select 1 from public.deals d
                 join public.offers o on o.id = d.offer_id
                 join public.conversations c on c.id = o.conversation_id
                 where d.id = deal_id
                   and (c.buyer_id = public.current_profile_id()
                        or c.seller_id = public.current_profile_id())));

-- reviews: readable by all; only deal participants may write, after completion
create policy sel_reviews on public.reviews for select using (true);
create policy ins_reviews on public.reviews for insert
  with check (reviewer_id = public.current_profile_id()
              and exists (select 1 from public.deals d
                          join public.offers o on o.id = d.offer_id
                          join public.conversations c on c.id = o.conversation_id
                          where d.id = deal_id and d.status = 'completed'
                            and (c.buyer_id = public.current_profile_id()
                                 or c.seller_id = public.current_profile_id())));

-- personal rows
create policy all_saved_searches on public.saved_searches for all
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());
create policy sel_notifications on public.notifications for select
  using (user_id = public.current_profile_id());
create policy upd_notifications on public.notifications for update
  using (user_id = public.current_profile_id());
create policy ins_reports on public.reports for insert
  with check (reporter_id = public.current_profile_id());
create policy sel_reports_own on public.reports for select
  using (reporter_id = public.current_profile_id());

-- audit_log: service role only (no policies = deny for anon/authenticated)

-- expose the RPC functions to signed-in users
grant execute on function public.create_offer(uuid, numeric, text) to authenticated;
grant execute on function public.accept_offer(uuid, uuid) to authenticated;
grant execute on function public.transition_deal(uuid, text) to authenticated;
revoke execute on function public.create_offer(uuid, numeric, text) from anon;
revoke execute on function public.accept_offer(uuid, uuid) from anon;
revoke execute on function public.transition_deal(uuid, text) from anon;
