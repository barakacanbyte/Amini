-- Migration: Support multiple roles per user
-- Changes role from single enum to text array to allow users to have multiple roles (e.g., admin + organization)

-- Step 1: Add new roles column as text array
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS roles text[] DEFAULT ARRAY['donor'::text];

-- Step 2: Migrate existing role data to roles array
UPDATE public.profiles 
SET roles = ARRAY[role::text]
WHERE roles = ARRAY['donor'::text];

-- Step 3: Create index on roles array for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_roles ON public.profiles USING GIN(roles);

-- Step 4: Drop old role column and index (commented out - uncomment after verifying migration works)
-- DROP INDEX IF EXISTS idx_profiles_role;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

-- Note: Keep the old 'role' column for now to allow rollback if needed.
-- After verifying the migration works in production:
-- 1. Uncomment the DROP statements above
-- 2. Run a new migration to clean up the old column
