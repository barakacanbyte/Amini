-- Migration: Document impact_metrics JSON shape for expected outcomes
-- Safe, metadata-only change. Aligns DB with new wizard UX (outcomes step).

COMMENT ON COLUMN public.campaigns.impact_metrics IS
  'JSON array of expected outcomes: [{ name, target, timeframe? }] used for reporting UX.';

