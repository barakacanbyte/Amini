-- Migration: Clean up old single role column
-- Drops the old singular 'role' column from the profiles table now that we've migrated to the 'roles' array.

-- Drop the old index
DROP INDEX IF EXISTS idx_profiles_role;

-- Drop the old column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
