-- Migration: User Roles and Organizations
-- Adds tables to support Donor, Organization, and Admin dashboards

-- Enum for user roles
CREATE TYPE user_role AS ENUM ('donor', 'organization', 'admin');

-- Profiles table (extends wallet addresses with user info)
CREATE TABLE IF NOT EXISTS public.profiles (
  wallet text PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'donor',
  name text,
  email text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enum for organization verification status
CREATE TYPE org_status AS ENUM ('pending', 'approved', 'rejected');

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL REFERENCES public.profiles(wallet),
  name text NOT NULL,
  description text,
  website_url text,
  country text,
  status org_status NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Link campaigns to organizations (optional, if an org creates multiple campaigns)
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_organizations_wallet ON public.organizations(wallet);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(status);

-- RLS Policies (Optional but recommended)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone for profiles and orgs
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Organizations are viewable by everyone" ON public.organizations FOR SELECT USING (true);

-- Allow users to update their own profiles
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid()::text = wallet);
