-- Store in-progress campaign wizard state in `campaigns` (no extra table).
-- Draft rows: is_fully_created = false, negative synthetic id via sequence.

DROP TABLE IF EXISTS public.campaign_creation_drafts;

-- Negative bigint ids for draft-only rows (never collide with on-chain campaign ids).
CREATE SEQUENCE IF NOT EXISTS public.campaign_draft_local_id_seq
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

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS is_fully_created boolean NOT NULL DEFAULT true;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS draft_payload jsonb;

-- Existing rows are on-chain / complete
UPDATE public.campaigns
SET is_fully_created = true
WHERE is_fully_created IS DISTINCT FROM true;

-- At most one incomplete campaign draft per owner wallet
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_one_draft_per_owner
  ON public.campaigns (owner)
  WHERE is_fully_created = false;

CREATE INDEX IF NOT EXISTS idx_campaigns_is_fully_created
  ON public.campaigns (is_fully_created);

COMMENT ON COLUMN public.campaigns.is_fully_created IS
  'false = wizard draft (synthetic negative id); true = published on-chain campaign.';
COMMENT ON COLUMN public.campaigns.draft_payload IS
  'JSON for fields not mapped to columns (e.g. wizard step, cover data URL).';
