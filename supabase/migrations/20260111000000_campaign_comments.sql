-- Public comments on published campaigns (wallet-verified via API; bodies stored in Supabase).

CREATE TABLE IF NOT EXISTS public.campaign_comments (
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

CREATE INDEX IF NOT EXISTS idx_campaign_comments_campaign ON public.campaign_comments (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_comments_created ON public.campaign_comments (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_comments_parent ON public.campaign_comments (parent_id)
  WHERE parent_id IS NOT NULL;
