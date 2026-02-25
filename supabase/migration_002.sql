-- ============================================================
-- Migration 002: Supabase Storage — chat-images bucket
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Create the chat-images bucket (private, 10 MB per file, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  false,             -- private — files require a signed URL to view
  10485760,          -- 10 MB max per file
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─── RLS Policies ───────────────────────────────────────────
-- Files are stored under the path:  {auth.uid()}/{hash}.{ext}
-- Policies enforce that only the owner of the first path segment can
-- upload, read, or delete their own images.

-- Allow users to upload their own images
create policy "Users upload own images"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to read (create signed URLs for) their own images
create policy "Users read own images"
  on storage.objects for select
  using (
    bucket_id = 'chat-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to overwrite (upsert) their own images
create policy "Users update own images"
  on storage.objects for update
  using (
    bucket_id = 'chat-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to delete their own images
create policy "Users delete own images"
  on storage.objects for delete
  using (
    bucket_id = 'chat-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
