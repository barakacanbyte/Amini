-- Amini indexer: run this in Supabase SQL editor to create tables for fund flow and explorer.

-- Campaigns (synced from chain)
create table if not exists public.campaigns (
  id bigint primary key,
  chain_id int not null,
  owner text not null,
  beneficiary text not null,
  target_amount numeric not null,
  milestone_count smallint not null,
  metadata_uri text,
  created_at timestamptz default now(),
  created_tx_hash text,
  created_block int
);

-- Escrow deposits (FundsDeposited events)
create table if not exists public.escrow_deposits (
  id bigserial primary key,
  campaign_id bigint not null references public.campaigns(id),
  depositor text not null,
  amount numeric not null,
  tx_hash text not null unique,
  block_number int not null,
  created_at timestamptz default now()
);

-- Milestone releases (MilestoneReleased events)
create table if not exists public.milestone_releases (
  id bigserial primary key,
  campaign_id bigint not null references public.campaigns(id),
  milestone_index int not null,
  amount numeric not null,
  attestation_uid text,
  tx_hash text not null unique,
  block_number int not null,
  created_at timestamptz default now()
);

-- Optional: attestations (from EAS; can be filled by indexer or API)
create table if not exists public.attestations (
  uid text primary key,
  campaign_id bigint not null,
  milestone_index int not null,
  attester text not null,
  evidence_hash text,
  created_at timestamptz default now()
);

-- Impact posts (Arweave-backed)
create table if not exists public.impact_posts (
  id bigserial primary key,
  campaign_id bigint not null references public.campaigns(id),
  milestone_index int,
  author_wallet text not null,
  body text not null,
  arweave_tx_id text not null,
  arweave_url text not null,
  attachment_tx_id text,
  attachment_url text,
  attachment_name text,
  attachment_content_type text,
  tx_hash_link text,
  created_at timestamptz default now()
);

create index if not exists idx_campaigns_owner on public.campaigns(owner);
create index if not exists idx_campaigns_beneficiary on public.campaigns(beneficiary);
create index if not exists idx_escrow_deposits_campaign on public.escrow_deposits(campaign_id);
create index if not exists idx_milestone_releases_campaign on public.milestone_releases(campaign_id);
create index if not exists idx_impact_posts_campaign on public.impact_posts(campaign_id);

-- Indexer cursor/checkpoint
create table if not exists public.indexer_state (
  id text primary key,
  last_indexed_block bigint not null default 0,
  updated_at timestamptz default now()
);

-- Sybil verification status (World ID / other providers)
create table if not exists public.sybil_verifications (
  wallet text not null,
  provider text not null, -- e.g. "worldcoin"
  is_verified boolean not null default false,
  verified_at timestamptz,
  proof_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (wallet, provider)
);

-- Reputation scores derived from EAS-attested releases
create table if not exists public.reputation_scores (
  wallet text primary key,
  score int not null default 0,
  attested_count int not null default 0,
  total_released numeric not null default 0,
  sybil_verified boolean not null default false,
  last_updated timestamptz default now()
);

-- RLS (optional): enable if you want row-level security
-- alter table public.campaigns enable row level security;
-- alter table public.escrow_deposits enable row level security;
-- alter table public.milestone_releases enable row level security;

create index if not exists idx_sybil_wallet on public.sybil_verifications(wallet);
create index if not exists idx_reputation_score on public.reputation_scores(score desc);
