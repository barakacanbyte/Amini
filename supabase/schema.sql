-- Amini: reference snapshot of public schema (expected state after all migrations in supabase/migrations/).
-- Use for documentation and onboarding. Incremental changes belong in supabase/migrations/.
-- Regenerate optionally: ./scripts/dump-supabase-schema.sh (requires SUPABASE_DB_URL or DATABASE_URL).

-- === Types ===
CREATE TYPE user_role AS ENUM ('guest', 'donor', 'organization', 'admin');
CREATE TYPE org_status AS ENUM ('pending', 'approved', 'rejected');

-- === Profiles & organizations (dashboards) ===
CREATE TABLE public.profiles (
  wallet text PRIMARY KEY,
  roles text[] DEFAULT ARRAY['guest'::text],
  name text,
  email text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet text NOT NULL REFERENCES public.profiles(wallet),
  name text NOT NULL,
  description text,
  website_url text,
  country text,
  status org_status NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  official_email text,
  twitter_handle text,
  linkedin_url text,
  ens_name text,
  has_coinbase_verification boolean DEFAULT false,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- === Campaigns (indexer + optional org link + explorer metadata) ===
CREATE TABLE public.campaigns (
  id bigint PRIMARY KEY,
  chain_id int NOT NULL,
  owner text NOT NULL,
  beneficiary text NOT NULL,
  target_amount numeric NOT NULL,
  milestone_count smallint NOT NULL,
  metadata_uri text,
  created_at timestamptz DEFAULT now(),
  created_tx_hash text,
  created_block int,
  organization_id uuid REFERENCES public.organizations(id),
  title text,
  description text,
  image_url text,
  region text,
  cause text,
  -- Enriched metadata added by later migrations
  deadline timestamptz,
  contact_email text,
  beneficiary_description text,
  status text NOT NULL DEFAULT 'active',
  milestone_data jsonb,
  social_links jsonb,
  impact_metrics jsonb,
  tags text[],
  -- Draft / wizard support
  is_fully_created boolean NOT NULL DEFAULT true,
  draft_payload jsonb
);

CREATE INDEX idx_campaigns_owner ON public.campaigns(owner);
CREATE INDEX idx_campaigns_beneficiary ON public.campaigns(beneficiary);
CREATE INDEX idx_campaigns_region ON public.campaigns(region);
CREATE INDEX idx_campaigns_cause ON public.campaigns(cause);
CREATE INDEX idx_campaigns_is_fully_created ON public.campaigns(is_fully_created);
CREATE UNIQUE INDEX idx_campaigns_one_draft_per_owner ON public.campaigns (owner) WHERE is_fully_created = false;

COMMENT ON COLUMN public.campaigns.is_fully_created IS
  'false = wizard draft (synthetic negative id); true = published on-chain campaign.';
COMMENT ON COLUMN public.campaigns.draft_payload IS
  'JSON for fields not mapped to columns (e.g. wizard step, cover data URL).';

COMMENT ON COLUMN public.campaigns.impact_metrics IS
  'JSON array of expected outcomes: [{ name, target, timeframe? }] used for reporting UX.';

-- Negative bigint ids for draft-only rows (never collide with on-chain campaign ids).
CREATE SEQUENCE public.campaign_draft_local_id_seq
  AS bigint
  INCREMENT BY -1
  START WITH -1
  MINVALUE -9223372036854775808
  MAXVALUE -1;

CREATE OR REPLACE FUNCTION public.next_campaign_draft_local_id()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('public.campaign_draft_local_id_seq');
$$;

GRANT EXECUTE ON FUNCTION public.next_campaign_draft_local_id() TO anon, authenticated, service_role;

-- === Escrow & releases ===
CREATE TABLE public.escrow_deposits (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns(id),
  depositor text NOT NULL,
  amount numeric NOT NULL,
  tx_hash text NOT NULL UNIQUE,
  block_number int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.milestone_releases (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns(id),
  milestone_index int NOT NULL,
  amount numeric NOT NULL,
  attestation_uid text,
  tx_hash text NOT NULL UNIQUE,
  block_number int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.attestations (
  uid text PRIMARY KEY,
  campaign_id bigint NOT NULL,
  milestone_index int NOT NULL,
  attester text NOT NULL,
  evidence_hash text,
  created_at timestamptz DEFAULT now()
);

-- === Impact posts (IPFS / Filebase) ===
CREATE TABLE public.impact_posts (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns(id),
  milestone_index int,
  author_wallet text NOT NULL,
  body text NOT NULL,
  ipfs_cid text NOT NULL,
  ipfs_url text NOT NULL,
  attachment_cid text,
  attachment_url text,
  attachment_name text,
  attachment_content_type text,
  tx_hash_link text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_escrow_deposits_campaign ON public.escrow_deposits(campaign_id);
CREATE INDEX idx_milestone_releases_campaign ON public.milestone_releases(campaign_id);
CREATE INDEX idx_impact_posts_campaign ON public.impact_posts(campaign_id);

-- === Indexer ===
CREATE TABLE public.indexer_state (
  id text PRIMARY KEY,
  last_indexed_block bigint NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- === Sybil & reputation ===
CREATE TABLE public.sybil_verifications (
  wallet text NOT NULL,
  provider text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  proof_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (wallet, provider)
);

CREATE TABLE public.reputation_scores (
  wallet text PRIMARY KEY,
  score int NOT NULL DEFAULT 0,
  attested_count int NOT NULL DEFAULT 0,
  total_released numeric NOT NULL DEFAULT 0,
  sybil_verified boolean NOT NULL DEFAULT false,
  last_updated timestamptz DEFAULT now()
);

CREATE INDEX idx_profiles_roles ON public.profiles USING GIN(roles);
CREATE INDEX idx_organizations_wallet ON public.organizations(wallet);
CREATE INDEX idx_organizations_status ON public.organizations(status);
CREATE INDEX idx_sybil_wallet ON public.sybil_verifications(wallet);
CREATE INDEX idx_reputation_score ON public.reputation_scores(score DESC);

-- === RLS (from user_roles migration) ===
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Organizations are viewable by everyone" ON public.organizations FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid()::text = wallet);
