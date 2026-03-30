-- Migration: Add Guest Role
-- Updates the user_role enum and defaults to include 'guest' role

-- Step 1: Add 'guest' to user_role enum if it doesn't exist
-- We must do this in its own transaction block to satisfy Postgres's enum rules
COMMIT;
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'guest' BEFORE 'donor';
-- Note: Supabase UI might still throw an error running these together, 
-- so if it fails, run the above ALTER TYPE command by itself first.

-- Step 2: Update default values for new profiles
ALTER TABLE public.profiles 
ALTER COLUMN roles SET DEFAULT ARRAY['guest'::text];

-- Note: We do not update existing 'donor' users to 'guest', 
-- as they were already created with the intention of being donors.
-- Only new users will default to 'guest' until they take an action.
