-- ============================================================================
-- 0003 STORAGE — listing-images bucket (BLUEPRINT.md §1: Storage + CDN)
-- Public read (listings are public); writes only by the owner into their own
-- prefix. Path convention: <profile_id>/<listing_id>/<n>.jpg
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5 * 1024 * 1024,           -- 5 MiB per image (client compresses to ~1280px jpeg)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy ins_listing_images_storage on storage.objects for insert
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = public.current_profile_id()::text
  );

create policy del_listing_images_storage on storage.objects for delete
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = public.current_profile_id()::text
  );
