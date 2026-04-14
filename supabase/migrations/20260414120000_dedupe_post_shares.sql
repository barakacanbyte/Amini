-- Dedupe organization post shares per wallet.
-- Anonymous shares (wallet is NULL) remain event-like.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_post_shares_post_wallet
  ON public.organization_post_shares (post_id, wallet)
  WHERE wallet IS NOT NULL;
