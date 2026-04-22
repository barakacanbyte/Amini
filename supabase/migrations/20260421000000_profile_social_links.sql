-- Add social link columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS x_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.x_url IS 'X (Twitter) profile URL';
COMMENT ON COLUMN public.profiles.linkedin_url IS 'LinkedIn profile URL';
COMMENT ON COLUMN public.profiles.instagram_url IS 'Instagram profile URL';
