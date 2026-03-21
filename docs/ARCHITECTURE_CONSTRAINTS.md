# Architecture Constraints

This document makes explicit the current trade-offs in the Amini implementation.

## Current constraints

- **Supabase is centralized infra**: index/state queries depend on Supabase availability.
- **XMTP is in-app only**: no push notification service is included.
- **Sybil verification source**: reputation visibility depends on a World ID verification record in `sybil_verifications`.
- **Arweave uploads are server-mediated**: uploads go through frontend API routes with configured wallet credentials.
- **Indexer eventual consistency**: explorer/feed updates are near-real-time, not instant.

## Security and trust assumptions

- Contract addresses and schema UID are correctly configured in env.
- Only EAS-valid attestations are accepted for release in escrow contract logic.
- Service role credentials are stored securely and never exposed client-side.

## Future hardening candidates

- Add robust World ID verification endpoint and proof validation pipeline.
- Add idempotency + retry queues for indexer writes.
- Add monitoring/alerts for indexer lag and API upload failures.
- Add stronger content moderation controls for impact posts.
