-- Past / off-platform projects on org profile (self-reported track record for trust).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS prior_projects jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.organizations.prior_projects IS
  'Org-submitted track record off Amini: JSON array of { title, summary?, year?, link_url? }.';
