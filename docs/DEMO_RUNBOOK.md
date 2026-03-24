# Amini Demo Runbook

This runbook follows the intended hackathon demo flow from campaign setup through attested release and transparency proof.

## Prerequisites

- Deployed contracts on Base (or Base Sepolia) and env vars configured.
- Supabase schema applied (see [`supabase/migrations/`](../supabase/migrations/) and [`supabase/README.md`](../supabase/README.md)).
- Indexer running (`bun --filter indexer dev`).
- Frontend running (`bun dev`).

## Demo flow

1. Connect wallet in the app and open `Campaigns`.
2. Create a campaign with milestone amounts and initialize escrow.
3. Open the campaign detail page and copy/share the donation link or QR.
4. Fund the campaign using USDC (`Approve` then `Deposit`).
5. Publish an impact post with evidence (optional file + linked tx).
6. Create an EAS milestone attestation and release milestone funds.
7. Show indexed transparency:
   - fund flow timeline (deposits/releases),
   - impact feed with IPFS (Filebase) permalink,
   - explorer search results.
8. Initialize XMTP and send campaign-scoped messages.
9. Show reputation panel (visible only when Sybil verification exists).

## Talking points

- Milestone releases are gated by EAS attestations.
- Fund flow is publicly auditable via Base tx links and explorer queries.
- Evidence is pinned on IPFS (Filebase).
- Reputation is intentionally Sybil-gated.
