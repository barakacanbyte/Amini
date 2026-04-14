-- Activity feed: scored ranking + cursor pagination
-- Drop existing if any to cleanly replace
DROP FUNCTION IF EXISTS public.get_activity_feed(text, int, int);
DROP FUNCTION IF EXISTS public.get_single_post(uuid, text);

-- Efficient activity feed with cursor-based pagination.
-- The score formula uses a time-decay model (half-life 48h) boosted by engagement.
-- Only posts from approved organizations are returned.
-- Engagement counts are computed with correlated sub-selects so the DB can use
-- the existing per-post indexes and avoid full-table aggregates.
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
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.organization_id,
    p.author_wallet,
    p.body,
    p.created_at,
    p.updated_at,
    o.name        AS org_name,
    o.logo_url    AS org_logo_url,
    o.wallet      AS org_wallet,

    (SELECT count(*) FROM public.organization_post_likes   lk WHERE lk.post_id = p.id) AS like_count,
    (SELECT count(*) FROM public.organization_post_comments cm WHERE cm.post_id = p.id) AS comment_count,
    (SELECT count(*) FROM public.organization_post_shares   sh WHERE sh.post_id = p.id) AS share_count,

    EXISTS (
      SELECT 1 FROM public.organization_post_likes vl
      WHERE vl.post_id = p.id AND vl.wallet = viewer_wallet
    ) AS liked_by_viewer,

    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id',           md.id,
          'cid',          md.cid,
          'url',          md.url,
          'content_type', md.content_type,
          'width',        md.width,
          'height',       md.height
        ) ORDER BY md.sort_order ASC
      ) FROM public.organization_post_media md WHERE md.post_id = p.id),
      '[]'::jsonb
    ) AS media,

    (
      (
        (SELECT count(*) FROM public.organization_post_likes   lk2 WHERE lk2.post_id = p.id) * 1.0
      + (SELECT count(*) FROM public.organization_post_comments cm2 WHERE cm2.post_id = p.id) * 2.0
      + (SELECT count(*) FROM public.organization_post_shares   sh2 WHERE sh2.post_id = p.id) * 3.0
      + 1.0
      )
      / POWER(2.0, EXTRACT(EPOCH FROM (now() - p.created_at)) / 172800.0)
    )::float AS score

  FROM public.organization_posts p
  JOIN public.organizations o ON o.id = p.organization_id AND o.status = 'approved'
  WHERE
    CASE
      WHEN cursor_score IS NOT NULL AND cursor_id IS NOT NULL THEN
        (
          (
            (
              (SELECT count(*) FROM public.organization_post_likes   lk3 WHERE lk3.post_id = p.id) * 1.0
            + (SELECT count(*) FROM public.organization_post_comments cm3 WHERE cm3.post_id = p.id) * 2.0
            + (SELECT count(*) FROM public.organization_post_shares   sh3 WHERE sh3.post_id = p.id) * 3.0
            + 1.0
            )
            / POWER(2.0, EXTRACT(EPOCH FROM (now() - p.created_at)) / 172800.0)
          )::float < cursor_score
        )
        OR (
          (
            (
              (SELECT count(*) FROM public.organization_post_likes   lk4 WHERE lk4.post_id = p.id) * 1.0
            + (SELECT count(*) FROM public.organization_post_comments cm4 WHERE cm4.post_id = p.id) * 2.0
            + (SELECT count(*) FROM public.organization_post_shares   sh4 WHERE sh4.post_id = p.id) * 3.0
            + 1.0
            )
            / POWER(2.0, EXTRACT(EPOCH FROM (now() - p.created_at)) / 172800.0)
          )::float = cursor_score
          AND p.id < cursor_id
        )
      ELSE TRUE
    END
  ORDER BY score DESC, p.id DESC
  LIMIT LEAST(limit_count, 50);
$$;


-- Fetch a single post by its ID (for permalink / share deep-link).
CREATE OR REPLACE FUNCTION public.get_single_post(
  target_post_id uuid,
  viewer_wallet  text DEFAULT NULL
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
  media            jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.organization_id,
    p.author_wallet,
    p.body,
    p.created_at,
    p.updated_at,
    o.name        AS org_name,
    o.logo_url    AS org_logo_url,
    o.wallet      AS org_wallet,

    (SELECT count(*) FROM public.organization_post_likes   lk WHERE lk.post_id = p.id) AS like_count,
    (SELECT count(*) FROM public.organization_post_comments cm WHERE cm.post_id = p.id) AS comment_count,
    (SELECT count(*) FROM public.organization_post_shares   sh WHERE sh.post_id = p.id) AS share_count,

    EXISTS (
      SELECT 1 FROM public.organization_post_likes vl
      WHERE vl.post_id = p.id AND vl.wallet = viewer_wallet
    ) AS liked_by_viewer,

    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id',           md.id,
          'cid',          md.cid,
          'url',          md.url,
          'content_type', md.content_type,
          'width',        md.width,
          'height',       md.height
        ) ORDER BY md.sort_order ASC
      ) FROM public.organization_post_media md WHERE md.post_id = p.id),
      '[]'::jsonb
    ) AS media

  FROM public.organization_posts p
  JOIN public.organizations o ON o.id = p.organization_id AND o.status = 'approved'
  WHERE p.id = target_post_id
  LIMIT 1;
$$;
