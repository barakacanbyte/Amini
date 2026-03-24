-- Migration: Add Logo URL to Organizations
-- Adds logo_url column for storing IPFS gateway links

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS logo_url text;
