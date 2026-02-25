-- Migration: add config_json column to user_config
-- Run this in Supabase SQL Editor after the main schema
alter table public.user_config
  add column if not exists config_json jsonb default '{}';
