-- Milestone proofs: organizations submit evidence for milestone completion.
-- Admin reviews and approves/rejects before issuing EAS attestation.

CREATE TYPE proof_status AS ENUM ('submitted', 'under_review', 'approved', 'rejected');

CREATE TABLE public.milestone_proofs (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  milestone_index smallint NOT NULL,
  submitter_wallet text NOT NULL,
  title text NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
  description text NOT NULL CHECK (char_length(description) > 0 AND char_length(description) <= 4000),
  evidence_urls text[] NOT NULL DEFAULT '{}',
  ipfs_cid text,
  ipfs_url text,
  status proof_status NOT NULL DEFAULT 'submitted',
  reviewer_wallet text,
  reviewer_notes text CHECK (reviewer_notes IS NULL OR char_length(reviewer_notes) <= 2000),
  reviewed_at timestamptz,
  attestation_uid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_milestone_proofs_campaign ON public.milestone_proofs (campaign_id, milestone_index);
CREATE INDEX idx_milestone_proofs_status ON public.milestone_proofs (status, created_at DESC);
CREATE INDEX idx_milestone_proofs_submitter ON public.milestone_proofs (submitter_wallet);

ALTER TABLE public.milestone_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Milestone proofs are viewable by everyone"
  ON public.milestone_proofs FOR SELECT USING (true);
