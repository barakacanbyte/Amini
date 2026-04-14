# Contract Architecture Review

This document explains the current Amini on-chain funding model in reviewer-friendly terms.

It is intended for engineering review, including external reviewers such as Coinbase teams, security reviewers, and ecosystem partners.

## Overview

Amini currently uses **two deployed application contracts** on Base Sepolia:

- `CampaignRegistry`
- `MilestoneEscrow`

It also integrates with two external contracts/services:

- **USDC** ERC-20 on Base Sepolia
- **EAS** (Ethereum Attestation Service)

Only the first two are part of Amini's deployed contract system. EAS and USDC are external dependencies.

## Why two contracts

### `CampaignRegistry`

`CampaignRegistry` is the on-chain source of truth for campaign metadata required by the escrow:

- campaign owner
- campaign beneficiary
- target amount
- milestone count
- metadata URI

This contract does **not** hold funds.

### `MilestoneEscrow`

`MilestoneEscrow` is the on-chain funding and release engine:

- holds donor deposits
- tracks milestone-specific funding intent
- enforces which milestone can currently receive directed funding
- validates EAS attestations before release
- releases milestone funds to the beneficiary

This contract depends on `CampaignRegistry` to resolve the beneficiary and validate campaign configuration.

## Upgrade model

Both contracts use **UUPS proxies**.

- Proxy addresses remain stable
- Logic implementations can be upgraded
- Upgrade authority is controlled by `OwnableUpgradeable`

See `docs/CONTRACT_DEPLOYMENTS.md` for the current proxy and implementation addresses.

## Admin model

The on-chain "admin" is the **proxy owner**.

That owner is set during `initialize(...)` and currently has two important powers:

- authorize proxy upgrades
- call `MilestoneEscrow.releaseMilestone(...)`

This means the release operation is intentionally centralized behind the admin account, even though attestation validity is still verified on-chain.

If the admin must change, ownership should be rotated with `transferOwnership(newOwner)` on the proxy.

## High-level funding flow

The funding model is milestone-gated:

1. Donors can fund **milestone 1** immediately.
2. Organizations complete the milestone work.
3. Organizations upload proof off-chain.
4. Admin reviews the proof and verifies it with volunteers.
5. Admin issues an **EAS attestation** for that milestone.
6. Admin calls `releaseMilestone(...)`.
7. The milestone amount is transferred to the campaign beneficiary.
8. The next milestone becomes eligible for directed funding.

This repeats until campaign completion.

## Directed funding logic

Donors can deposit in two ways:

- **Directed milestone funding**
- **General donation with no milestone preference**

### Directed milestone funding

The donor calls:

`deposit(campaignId, milestoneIndex, amount)`

The contract enforces:

- the campaign escrow exists
- the milestone index is valid
- the milestone is currently open

Current gate:

- `milestoneIndex <= releasedCount`

That means:

- when `releasedCount = 0`, only milestone `0` can be funded directly
- after milestone `0` is released, `releasedCount = 1`, so milestone `1` becomes open

If a donor targets a later milestone too early, the contract reverts with `MilestoneLocked()`.

### General donation

If the donor passes `NO_MILESTONE_PREFERENCE`, the deposit is accepted without milestone gating.

This supports campaign-level contributions while still preserving milestone-targeted funding for donors who want that specificity.

## Release logic

Milestone release is sequential and admin-controlled.

The admin calls:

`releaseMilestone(campaignId, milestoneIndex, attestationUID)`

The contract verifies:

- the escrow is initialized
- the milestone being released is exactly the next unreleased milestone
- the attestation is valid in EAS
- the attestation schema matches `milestoneSchemaUID`
- the attestation has not been revoked
- the attestation payload decodes to the correct `(campaignId, milestoneIndex)`
- the escrow balance is sufficient

If all checks pass:

- the contract increments `releasedCount`
- transfers the configured milestone amount to the campaign beneficiary
- emits `MilestoneReleased`

## What is on-chain vs off-chain

### On-chain

The following are enforced or recorded on-chain:

- campaign registry entries
- escrow balances
- donor deposits
- donor milestone targeting
- milestone release order
- beneficiary payout amounts
- EAS attestation validation

### Off-chain

The following are currently handled off-chain:

- donor display preference (`visible` vs `anonymous`)
- donor messages
- milestone proof uploads
- proof review workflow
- admin dashboard review queue
- indexer mirrors of deposits/releases

This split is intentional:

- financial state and release conditions are on-chain
- UX, moderation, file uploads, and review workflow are off-chain

## Proof review and EAS workflow

The proof pipeline is:

1. Organization submits proof to `milestone_proofs`
2. Admin reviews the submission in the dashboard
3. Admin approval issues an EAS attestation from the connected admin wallet
4. The resulting attestation UID is stored on the proof record
5. The milestone UI displays an **EAS attested** badge with a view link
6. Admin can then release funds on-chain using that attestation UID

Important distinction:

- **Proof approval** is an off-chain review state
- **EAS attestation** is the on-chain cryptographic checkpoint
- **Milestone release** is the actual fund movement

## Trust assumptions

The current model assumes:

- the admin acts honestly when reviewing proofs and issuing attestations
- volunteer verification is handled operationally off-chain
- the configured EAS schema UID is correct
- the configured registry and escrow proxy addresses are correct
- the UI and indexer reflect on-chain events accurately after indexing delay

## Security properties

Current strong properties:

- milestone payouts are fixed at initialization
- organizations cannot arbitrarily change release amounts
- milestone releases are sequential
- invalid or revoked EAS attestations are rejected
- milestone funding can be gated by progress

Current centralized points:

- admin controls upgrades
- admin controls milestone release execution
- admin controls attestation issuance in the current product workflow
- proof review is off-chain

## Reviewer checklist

A reviewer evaluating the system should validate:

- proxy addresses and implementation addresses
- proxy ownership
- configured EAS schema UID
- escrow beneficiary resolution from registry
- `deposit()` milestone lock behavior
- `releaseMilestone()` attestation validation behavior
- event/indexer consistency for deposits and releases
- admin dashboard behavior when issuing attestations

## Current contract set

### Amini-deployed contracts

- `CampaignRegistry`
- `MilestoneEscrow`

### External contracts used

- Base Sepolia USDC
- Base EAS contract

There are no additional Amini application contracts required for the milestone funding model at this time.
