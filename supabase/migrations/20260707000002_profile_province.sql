-- ============================================================================
-- 0002 PROFILE PROVINCE — Profile setup screen (BLUEPRINT.md §5.2 screen 7)
-- stores the user's home province as ISO 3166-2:TH (e.g. 'TH-10' = Bangkok).
-- Used as the default area filter and pre-fills listing location later.
-- ============================================================================

alter table public.profiles
  add column province_code text check (province_code ~ '^TH-\d{2}$');
