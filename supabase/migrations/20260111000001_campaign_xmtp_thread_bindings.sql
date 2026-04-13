-- Optional: maps (campaign, viewer, peer, XMTP env) → XMTP conversation id for cross-device restore / audit.
-- Message payloads stay on XMTP; this table only stores identifiers the client already knows.

CREATE TABLE IF NOT EXISTS public.campaign_xmtp_thread_bindings (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  viewer_wallet text NOT NULL,
  peer_wallet text NOT NULL,
  xmtp_env text NOT NULL CHECK (xmtp_env IN ('dev', 'production')),
  xmtp_conversation_id text NOT NULL CHECK (char_length(xmtp_conversation_id) > 0 AND char_length(xmtp_conversation_id) <= 512),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_xmtp_thread_bindings_unique_quad UNIQUE (campaign_id, viewer_wallet, peer_wallet, xmtp_env)
);

CREATE INDEX IF NOT EXISTS idx_xmtp_bindings_campaign ON public.campaign_xmtp_thread_bindings (campaign_id);
CREATE INDEX IF NOT EXISTS idx_xmtp_bindings_viewer ON public.campaign_xmtp_thread_bindings (viewer_wallet);
