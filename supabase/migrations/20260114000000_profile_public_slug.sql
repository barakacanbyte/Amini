-- Optional public username for profile URLs: /profile/{profile_slug} (lowercase, unique).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_profile_slug_unique
  ON public.profiles (profile_slug)
  WHERE profile_slug IS NOT NULL AND btrim(profile_slug) <> '';
