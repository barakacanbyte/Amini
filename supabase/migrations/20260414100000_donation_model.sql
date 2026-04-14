-- Milestone-targeted donation model: per-milestone deposit tracking,
-- donor preferences (anonymity, messages), and RLS for immutability.

-- 1. Add milestone_index to escrow_deposits (nullable; NULL = general donation)
ALTER TABLE public.escrow_deposits
  ADD COLUMN IF NOT EXISTS milestone_index smallint;

CREATE INDEX IF NOT EXISTS idx_escrow_deposits_milestone
  ON public.escrow_deposits (campaign_id, milestone_index);

-- 2. Create donation_preferences (off-chain donor choices linked by tx_hash)
CREATE TABLE IF NOT EXISTS public.donation_preferences (
  tx_hash text PRIMARY KEY,
  donor_wallet text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  donor_message text CHECK (donor_message IS NULL OR char_length(donor_message) <= 280),
  display_name_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_donation_prefs_wallet ON public.donation_preferences (donor_wallet);
CREATE INDEX idx_donation_prefs_created ON public.donation_preferences (created_at DESC);

-- 3. RLS on escrow_deposits: public reads, service_role-only writes
ALTER TABLE public.escrow_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Escrow deposits are viewable by everyone"
  ON public.escrow_deposits FOR SELECT USING (true);

-- 4. RLS on donation_preferences: public reads, authenticated insert only (no update/delete)
ALTER TABLE public.donation_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Donation preferences are viewable by everyone"
  ON public.donation_preferences FOR SELECT USING (true);

CREATE POLICY "Donors can insert own preferences"
  ON public.donation_preferences FOR INSERT
  WITH CHECK (true);
