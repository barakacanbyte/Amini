-- Amini: core indexer / explorer tables (fund flow, impact posts, reputation)
-- Impact posts use IPFS (Filebase) CIDs — not Arweave.

-- Campaigns (synced from chain)
CREATE TABLE IF NOT EXISTS public.campaigns (
  id bigint PRIMARY KEY,
  chain_id int NOT NULL,
  owner text NOT NULL,
  beneficiary text NOT NULL,
  target_amount numeric NOT NULL,
  milestone_count smallint NOT NULL,
  metadata_uri text,
  created_at timestamptz DEFAULT now(),
  created_tx_hash text,
  created_block int
);

-- Escrow deposits (FundsDeposited events)
CREATE TABLE IF NOT EXISTS public.escrow_deposits (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns(id),
  depositor text NOT NULL,
  amount numeric NOT NULL,
  tx_hash text NOT NULL UNIQUE,
  block_number int NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Milestone releases (MilestoneReleased events)
CREATE TABLE IF NOT EXISTS public.milestone_releases (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns(id),
  milestone_index int NOT NULL,
  amount numeric NOT NULL,
  attestation_uid text,
  tx_hash text NOT NULL UNIQUE,
  block_number int NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Optional: attestations (from EAS; can be filled by indexer or API)
CREATE TABLE IF NOT EXISTS public.attestations (
  uid text PRIMARY KEY,
  campaign_id bigint NOT NULL,
  milestone_index int NOT NULL,
  attester text NOT NULL,
  evidence_hash text,
  created_at timestamptz DEFAULT now()
);

-- Impact posts (IPFS / Filebase — pinned CIDs + gateway URLs)
CREATE TABLE IF NOT EXISTS public.impact_posts (
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

CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON public.campaigns(owner);
CREATE INDEX IF NOT EXISTS idx_campaigns_beneficiary ON public.campaigns(beneficiary);
CREATE INDEX IF NOT EXISTS idx_escrow_deposits_campaign ON public.escrow_deposits(campaign_id);
CREATE INDEX IF NOT EXISTS idx_milestone_releases_campaign ON public.milestone_releases(campaign_id);
CREATE INDEX IF NOT EXISTS idx_impact_posts_campaign ON public.impact_posts(campaign_id);

-- Indexer cursor/checkpoint
CREATE TABLE IF NOT EXISTS public.indexer_state (
  id text PRIMARY KEY,
  last_indexed_block bigint NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Sybil verification status (World ID / other providers)
CREATE TABLE IF NOT EXISTS public.sybil_verifications (
  wallet text NOT NULL,
  provider text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  proof_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (wallet, provider)
);

-- Reputation scores derived from EAS-attested releases
CREATE TABLE IF NOT EXISTS public.reputation_scores (
  wallet text PRIMARY KEY,
  score int NOT NULL DEFAULT 0,
  attested_count int NOT NULL DEFAULT 0,
  total_released numeric NOT NULL DEFAULT 0,
  sybil_verified boolean NOT NULL DEFAULT false,
  last_updated timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sybil_wallet ON public.sybil_verifications(wallet);
CREATE INDEX IF NOT EXISTS idx_reputation_score ON public.reputation_scores(score DESC);
