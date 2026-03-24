-- Migration: Add Verification Fields to Organizations
-- Adds official_email, twitter_handle, linkedin_url, ens_name, has_coinbase_verification

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS official_email text,
ADD COLUMN IF NOT EXISTS twitter_handle text,
ADD COLUMN IF NOT EXISTS linkedin_url text,
ADD COLUMN IF NOT EXISTS ens_name text,
ADD COLUMN IF NOT EXISTS has_coinbase_verification boolean DEFAULT false;
