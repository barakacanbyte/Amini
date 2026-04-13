-- Public discussion threads on campaign pages (wallet-verified via API).
CREATE TABLE public.campaign_comments (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  author_wallet text NOT NULL,
  body text NOT NULL CHECK (
    char_length(body) > 0
    AND char_length(body) <= 2000
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_comments_campaign ON public.campaign_comments (campaign_id);
CREATE INDEX idx_campaign_comments_created ON public.campaign_comments (campaign_id, created_at DESC);

COMMENT ON TABLE public.campaign_comments IS
  'Wallet-signed comments on campaign detail; inserted via Next API with service role.';
