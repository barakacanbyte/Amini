-- Profile fields, org page chrome, and organization LinkedIn-style posts

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS location text;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS tagline text;

CREATE TABLE IF NOT EXISTS public.organization_posts (
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

CREATE INDEX IF NOT EXISTS idx_organization_posts_org_created
  ON public.organization_posts (organization_id, created_at DESC);

ALTER TABLE public.organization_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org posts viewable for approved orgs"
  ON public.organization_posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = organization_posts.organization_id
        AND o.status = 'approved'
    )
  );
