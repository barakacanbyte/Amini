# Amini EAS Schemas

This package contains schema definitions and runtime helpers for milestone attestations.

## Milestone Completion schema

- File: `schemas/milestone-completion.json`
- Name: `Milestone Completion`
- Purpose: third-party validator confirms that campaign milestone `N` is complete.

### Data encoding used by contracts

The on-chain escrow contract decodes attestation data as:

- `bytes32 campaignId`
- `uint256 milestoneIndex`

So runtime helpers encode payload with:

```ts
encodeMilestoneAttestationData(campaignId, milestoneIndex)
```

### Runtime helpers

- `createMilestoneAttestation(walletClient, publicClient, input)`  
  Creates an attestation and returns `{ txHash, uid }`.
- `getAttestation(publicClient, uid)`  
  Reads full attestation data from EAS.
- `isAttestationValid(publicClient, uid)`  
  Checks validity from EAS.

