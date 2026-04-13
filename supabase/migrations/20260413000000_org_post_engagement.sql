-- Organization posts: media + likes + comments + shares

-- === Media (LinkedIn-style image attachments) ===
CREATE TABLE IF NOT EXISTS public.organization_post_media (
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

CREATE INDEX IF NOT EXISTS idx_org_post_media_post_sort
  ON public.organization_post_media (post_id, sort_order, created_at);

ALTER TABLE public.organization_post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org post media viewable for approved orgs"
  ON public.organization_post_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_posts p
      JOIN public.organizations o ON o.id = p.organization_id
      WHERE p.id = organization_post_media.post_id
        AND o.status = 'approved'
    )
  );

-- === Likes ===
CREATE TABLE IF NOT EXISTS public.organization_post_likes (
  post_id uuid NOT NULL REFERENCES public.organization_posts (id) ON DELETE CASCADE,
  wallet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, wallet)
);

CREATE INDEX IF NOT EXISTS idx_org_post_likes_post_created
  ON public.organization_post_likes (post_id, created_at DESC);

ALTER TABLE public.organization_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org post likes viewable for approved orgs"
  ON public.organization_post_likes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_posts p
      JOIN public.organizations o ON o.id = p.organization_id
      WHERE p.id = organization_post_likes.post_id
        AND o.status = 'approved'
    )
  );

-- === Comments (supports replies via parent_id) ===
CREATE TABLE IF NOT EXISTS public.organization_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.organization_posts (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.organization_post_comments (id) ON DELETE CASCADE,
  author_wallet text NOT NULL,
  body text NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_post_comments_post_created
  ON public.organization_post_comments (post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_org_post_comments_parent_created
  ON public.organization_post_comments (parent_id, created_at ASC);

ALTER TABLE public.organization_post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org post comments viewable for approved orgs"
  ON public.organization_post_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_posts p
      JOIN public.organizations o ON o.id = p.organization_id
      WHERE p.id = organization_post_comments.post_id
        AND o.status = 'approved'
    )
  );

-- === Shares (events; aggregate count in API) ===
CREATE TABLE IF NOT EXISTS public.organization_post_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.organization_posts (id) ON DELETE CASCADE,
  wallet text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_post_shares_post_created
  ON public.organization_post_shares (post_id, created_at DESC);

ALTER TABLE public.organization_post_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org post shares viewable for approved orgs"
  ON public.organization_post_shares
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_posts p
      JOIN public.organizations o ON o.id = p.organization_id
      WHERE p.id = organization_post_shares.post_id
        AND o.status = 'approved'
    )
  );

