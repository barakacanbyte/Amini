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
  headline text,
  bio text,
  location text,
  profile_slug text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_profiles_profile_slug_unique ON public.profiles (profile_slug)
  WHERE profile_slug IS NOT NULL AND btrim(profile_slug) <> '';

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
  cover_image_url text,
  tagline text,
  prior_projects jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.organizations.prior_projects IS
  'Org-submitted track record off Amini: JSON array of { title, summary?, year?, link_url? }.';

CREATE TABLE public.organization_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  author_wallet text NOT NULL,
  body text NOT NULL CHECK (
    char_length(body) > 0
    AND char_length(body) <= 8000
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_organization_posts_org_created ON public.organization_posts (organization_id, created_at DESC);

CREATE TABLE public.organization_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.organization_posts (id) ON DELETE CASCADE,
  cid text,
  url text,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  byte_size int NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  width int,
  height int,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cid IS NOT NULL OR url IS NOT NULL)
);

CREATE INDEX idx_org_post_media_post_sort
  ON public.organization_post_media (post_id, sort_order, created_at);

CREATE TABLE public.organization_post_likes (
  post_id uuid NOT NULL REFERENCES public.organization_posts (id) ON DELETE CASCADE,
  wallet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, wallet)
);

CREATE INDEX idx_org_post_likes_post_created
  ON public.organization_post_likes (post_id, created_at DESC);

CREATE TABLE public.organization_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.organization_posts (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.organization_post_comments (id) ON DELETE CASCADE,
  author_wallet text NOT NULL,
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_post_comments_post_created
  ON public.organization_post_comments (post_id, created_at ASC);
CREATE INDEX idx_org_post_comments_parent_created
  ON public.organization_post_comments (parent_id, created_at ASC);

CREATE TABLE public.organization_post_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.organization_posts (id) ON DELETE CASCADE,
  wallet text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_post_shares_post_created
  ON public.organization_post_shares (post_id, created_at DESC);

CREATE UNIQUE INDEX uniq_org_post_shares_post_wallet
  ON public.organization_post_shares (post_id, wallet)
  WHERE wallet IS NOT NULL;

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
  milestone_index smallint,
  tx_hash text NOT NULL UNIQUE,
  block_number int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.donation_preferences (
  tx_hash text PRIMARY KEY,
  donor_wallet text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  donor_message text CHECK (donor_message IS NULL OR char_length(donor_message) <= 280),
  display_name_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
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

-- === Milestone proofs (org submits evidence, admin reviews) ===
CREATE TYPE proof_status AS ENUM ('submitted', 'under_review', 'approved', 'rejected');

CREATE TABLE public.milestone_proofs (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  milestone_index smallint NOT NULL,
  submitter_wallet text NOT NULL,
  title text NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
  description text NOT NULL CHECK (char_length(description) > 0 AND char_length(description) <= 4000),
  evidence_urls text[] NOT NULL DEFAULT '{}',
  ipfs_cid text,
  ipfs_url text,
  status proof_status NOT NULL DEFAULT 'submitted',
  reviewer_wallet text,
  reviewer_notes text CHECK (reviewer_notes IS NULL OR char_length(reviewer_notes) <= 2000),
  reviewed_at timestamptz,
  attestation_uid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_milestone_proofs_campaign ON public.milestone_proofs (campaign_id, milestone_index);
CREATE INDEX idx_milestone_proofs_status ON public.milestone_proofs (status, created_at DESC);
CREATE INDEX idx_milestone_proofs_submitter ON public.milestone_proofs (submitter_wallet);

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
CREATE INDEX idx_escrow_deposits_milestone ON public.escrow_deposits(campaign_id, milestone_index);
CREATE INDEX idx_donation_prefs_wallet ON public.donation_preferences(donor_wallet);
CREATE INDEX idx_donation_prefs_created ON public.donation_preferences(created_at DESC);
CREATE INDEX idx_milestone_releases_campaign ON public.milestone_releases(campaign_id);
CREATE INDEX idx_impact_posts_campaign ON public.impact_posts(campaign_id);

CREATE TABLE public.campaign_comments (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  parent_id bigint REFERENCES public.campaign_comments (id) ON DELETE CASCADE,
  author_wallet text NOT NULL,
  body text NOT NULL CHECK (
    char_length(body) > 0
    AND char_length(body) <= 2000
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_comments_campaign ON public.campaign_comments (campaign_id);
CREATE INDEX idx_campaign_comments_created ON public.campaign_comments (campaign_id, created_at DESC);
CREATE INDEX idx_campaign_comments_parent ON public.campaign_comments (parent_id);

CREATE TABLE public.campaign_xmtp_thread_bindings (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  viewer_wallet text NOT NULL,
  peer_wallet text NOT NULL,
  xmtp_env text NOT NULL CHECK (xmtp_env IN ('dev', 'production')),
  xmtp_conversation_id text NOT NULL CHECK (
    char_length(xmtp_conversation_id) > 0
    AND char_length(xmtp_conversation_id) <= 512
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_xmtp_thread_bindings_unique_quad UNIQUE (campaign_id, viewer_wallet, peer_wallet, xmtp_env)
);

CREATE INDEX idx_xmtp_bindings_campaign ON public.campaign_xmtp_thread_bindings (campaign_id);
CREATE INDEX idx_xmtp_bindings_viewer ON public.campaign_xmtp_thread_bindings (viewer_wallet);

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
ALTER TABLE public.organization_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_post_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestone_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Organizations are viewable by everyone" ON public.organizations FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid()::text = wallet);

CREATE POLICY "Org posts viewable for approved orgs" ON public.organization_posts FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = organization_posts.organization_id
      AND o.status = 'approved'
  )
);

CREATE POLICY "Org post media viewable for approved orgs" ON public.organization_post_media FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.organization_posts p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = organization_post_media.post_id
      AND o.status = 'approved'
  )
);

CREATE POLICY "Org post likes viewable for approved orgs" ON public.organization_post_likes FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.organization_posts p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = organization_post_likes.post_id
      AND o.status = 'approved'
  )
);

CREATE POLICY "Org post comments viewable for approved orgs" ON public.organization_post_comments FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.organization_posts p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = organization_post_comments.post_id
      AND o.status = 'approved'
  )
);

CREATE POLICY "Org post shares viewable for approved orgs" ON public.organization_post_shares FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.organization_posts p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = organization_post_shares.post_id
      AND o.status = 'approved'
  )
);

CREATE POLICY "Escrow deposits are viewable by everyone" ON public.escrow_deposits FOR SELECT USING (true);
CREATE POLICY "Milestone proofs are viewable by everyone" ON public.milestone_proofs FOR SELECT USING (true);
CREATE POLICY "Donation preferences are viewable by everyone" ON public.donation_preferences FOR SELECT USING (true);
CREATE POLICY "Donors can insert own preferences" ON public.donation_preferences FOR INSERT WITH CHECK (true);
-- Activity feed: scored ranking + cursor pagination
-- Uses correlated sub-selects so PG leverages per-post indexes.
CREATE OR REPLACE FUNCTION public.get_activity_feed(
  viewer_wallet text DEFAULT NULL,
  limit_count  int  DEFAULT 20,
  cursor_score float DEFAULT NULL,
  cursor_id    uuid  DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  organization_id  uuid,
  author_wallet    text,
  body             text,
  created_at       timestamptz,
  updated_at       timestamptz,
  org_name         text,
  org_logo_url     text,
  org_wallet       text,
  like_count       bigint,
  comment_count    bigint,
  share_count      bigint,
  liked_by_viewer  boolean,
  media            jsonb,
  score            float
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id, p.organization_id, p.author_wallet, p.body,
    p.created_at, p.updated_at,
    o.name AS org_name, o.logo_url AS org_logo_url, o.wallet AS org_wallet,
    (SELECT count(*) FROM public.organization_post_likes   lk WHERE lk.post_id = p.id) AS like_count,
    (SELECT count(*) FROM public.organization_post_comments cm WHERE cm.post_id = p.id) AS comment_count,
    (SELECT count(*) FROM public.organization_post_shares   sh WHERE sh.post_id = p.id) AS share_count,
    EXISTS (SELECT 1 FROM public.organization_post_likes vl WHERE vl.post_id = p.id AND vl.wallet = viewer_wallet) AS liked_by_viewer,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',md.id,'cid',md.cid,'url',md.url,'content_type',md.content_type,'width',md.width,'height',md.height) ORDER BY md.sort_order) FROM public.organization_post_media md WHERE md.post_id = p.id), '[]'::jsonb) AS media,
    ((
      (SELECT count(*) FROM public.organization_post_likes   lk2 WHERE lk2.post_id = p.id)*1.0
    + (SELECT count(*) FROM public.organization_post_comments cm2 WHERE cm2.post_id = p.id)*2.0
    + (SELECT count(*) FROM public.organization_post_shares   sh2 WHERE sh2.post_id = p.id)*3.0
    + 1.0
    ) / POWER(2.0, EXTRACT(EPOCH FROM (now()-p.created_at))/172800.0))::float AS score
  FROM public.organization_posts p
  JOIN public.organizations o ON o.id = p.organization_id AND o.status = 'approved'
  WHERE CASE
    WHEN cursor_score IS NOT NULL AND cursor_id IS NOT NULL THEN
      ((( (SELECT count(*) FROM public.organization_post_likes lk3 WHERE lk3.post_id=p.id)*1.0
        + (SELECT count(*) FROM public.organization_post_comments cm3 WHERE cm3.post_id=p.id)*2.0
        + (SELECT count(*) FROM public.organization_post_shares sh3 WHERE sh3.post_id=p.id)*3.0
        + 1.0) / POWER(2.0,EXTRACT(EPOCH FROM (now()-p.created_at))/172800.0))::float < cursor_score)
      OR (((
        (SELECT count(*) FROM public.organization_post_likes lk4 WHERE lk4.post_id=p.id)*1.0
        + (SELECT count(*) FROM public.organization_post_comments cm4 WHERE cm4.post_id=p.id)*2.0
        + (SELECT count(*) FROM public.organization_post_shares sh4 WHERE sh4.post_id=p.id)*3.0
        + 1.0) / POWER(2.0,EXTRACT(EPOCH FROM (now()-p.created_at))/172800.0))::float = cursor_score AND p.id < cursor_id)
    ELSE TRUE
  END
  ORDER BY score DESC, p.id DESC
  LIMIT LEAST(limit_count, 50);
$$;

-- Fetch a single post by ID (permalink / share deep-link).
CREATE OR REPLACE FUNCTION public.get_single_post(
  target_post_id uuid,
  viewer_wallet  text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, organization_id uuid, author_wallet text, body text,
  created_at timestamptz, updated_at timestamptz,
  org_name text, org_logo_url text, org_wallet text,
  like_count bigint, comment_count bigint, share_count bigint,
  liked_by_viewer boolean, media jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id, p.organization_id, p.author_wallet, p.body,
    p.created_at, p.updated_at,
    o.name AS org_name, o.logo_url AS org_logo_url, o.wallet AS org_wallet,
    (SELECT count(*) FROM public.organization_post_likes   lk WHERE lk.post_id = p.id) AS like_count,
    (SELECT count(*) FROM public.organization_post_comments cm WHERE cm.post_id = p.id) AS comment_count,
    (SELECT count(*) FROM public.organization_post_shares   sh WHERE sh.post_id = p.id) AS share_count,
    EXISTS (SELECT 1 FROM public.organization_post_likes vl WHERE vl.post_id = p.id AND vl.wallet = viewer_wallet) AS liked_by_viewer,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',md.id,'cid',md.cid,'url',md.url,'content_type',md.content_type,'width',md.width,'height',md.height) ORDER BY md.sort_order) FROM public.organization_post_media md WHERE md.post_id = p.id), '[]'::jsonb) AS media
  FROM public.organization_posts p
  JOIN public.organizations o ON o.id = p.organization_id AND o.status = 'approved'
  WHERE p.id = target_post_id
  LIMIT 1;
$$;
