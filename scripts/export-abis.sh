#!/usr/bin/env bash
# Run after forge build. Copies ABIs to shared for frontend consumption.
set -e
CONTRACTS_OUT="packages/contracts/out"
SHARED_ABI="packages/shared/src/abi"
mkdir -p "$SHARED_ABI"
jq '.abi' "$CONTRACTS_OUT/CampaignRegistry.sol/CampaignRegistry.json" > "$SHARED_ABI/CampaignRegistry.json"
jq '.abi' "$CONTRACTS_OUT/MilestoneEscrow.sol/MilestoneEscrow.json" > "$SHARED_ABI/MilestoneEscrow.json"
echo "ABIs exported to $SHARED_ABI"
