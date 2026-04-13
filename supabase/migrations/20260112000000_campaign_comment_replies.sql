-- Threaded comments: one level of replies (parent must be a top-level comment).

ALTER TABLE public.campaign_comments
  ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES public.campaign_comments (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_campaign_comments_parent ON public.campaign_comments (parent_id)
  WHERE parent_id IS NOT NULL;
