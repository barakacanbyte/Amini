/**
 * Amini indexer: polls chain for CampaignCreated, FundsDeposited, MilestoneReleased
 * and writes to Supabase. Run after deploying contracts and setting env vars.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INDEXER_RPC_URL,
 *      CAMPAIGN_REGISTRY_ADDRESS, ESCROW_ADDRESS, CHAIN_ID
 */
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { createClient } from "@supabase/supabase-js";
import { campaignRegistryAbi, milestoneEscrowAbi } from "@amini/shared";

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 8453);
const RPC = process.env.INDEXER_RPC_URL ?? (CHAIN_ID === 84532 ? "https://sepolia.base.org" : "https://mainnet.base.org");
const REGISTRY = (process.env.CAMPAIGN_REGISTRY_ADDRESS ?? "") as `0x${string}`;
const ESCROW = (process.env.ESCROW_ADDRESS ?? "") as `0x${string}`;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!REGISTRY || !ESCROW) {
  console.error("Set CAMPAIGN_REGISTRY_ADDRESS and ESCROW_ADDRESS");
  process.exit(1);
}

const chain = CHAIN_ID === 84532 ? baseSepolia : base;
const client = createPublicClient({ chain, transport: http(RPC) });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const fromBlock = BigInt(process.env.FROM_BLOCK ?? 0);
const pollIntervalMs = 12_000; // ~2 blocks on Base
const stateKey = `chain-${CHAIN_ID}`;

function calculateReputationScore(attestedCount: number, totalReleased: bigint, sybilVerified: boolean): number {
  if (!sybilVerified) return 0;
  // Weighted simple formula: each attested milestone + released volume bonus.
  return attestedCount * 10 + Number(totalReleased / 1_000_000n);
}

async function getCampaignBeneficiary(campaignId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("beneficiary")
    .eq("id", campaignId)
    .eq("chain_id", CHAIN_ID)
    .maybeSingle();
  if (error) {
    console.error("Failed to load campaign beneficiary", campaignId, error.message);
    return null;
  }
  return data?.beneficiary ? String(data.beneficiary).toLowerCase() : null;
}

async function recomputeWalletReputation(wallet: string) {
  const normalized = wallet.toLowerCase();
  const { data: sybilData, error: sybilError } = await supabase
    .from("sybil_verifications")
    .select("is_verified")
    .eq("wallet", normalized)
    .eq("provider", "worldcoin")
    .maybeSingle();

  if (sybilError) {
    console.error("Failed to load sybil verification", normalized, sybilError.message);
  }
  const sybilVerified = Boolean(sybilData?.is_verified);

  const { data: walletCampaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("beneficiary", normalized)
    .eq("chain_id", CHAIN_ID);

  if (campaignsError) {
    console.error("Failed to load beneficiary campaigns", normalized, campaignsError.message);
    return;
  }

  const campaignIds = (walletCampaigns ?? []).map((c) => Number(c.id)).filter((id) => Number.isFinite(id));
  let attestedCount = 0;
  let totalReleased = 0n;

  if (campaignIds.length > 0) {
    const { data: releases, error: releasesError } = await supabase
      .from("milestone_releases")
      .select("campaign_id,milestone_index,amount")
      .in("campaign_id", campaignIds);

    if (releasesError) {
      console.error("Failed to load milestone releases for reputation", normalized, releasesError.message);
      return;
    }

    const milestoneKeys = new Set<string>();
    for (const release of releases ?? []) {
      milestoneKeys.add(`${release.campaign_id}:${release.milestone_index}`);
      totalReleased += BigInt(release.amount ?? 0);
    }
    attestedCount = milestoneKeys.size;
  }

  const score = calculateReputationScore(attestedCount, totalReleased, sybilVerified);
  await supabase.from("reputation_scores").upsert(
    {
      wallet: normalized,
      score,
      attested_count: attestedCount,
      total_released: totalReleased.toString(),
      sybil_verified: sybilVerified,
      last_updated: new Date().toISOString(),
    },
    { onConflict: "wallet" }
  );
}

async function indexCampaignCreated(from: bigint, to: bigint) {
  const logs = await client.getContractEvents({
    address: REGISTRY,
    abi: campaignRegistryAbi,
    eventName: "CampaignCreated",
    fromBlock: from,
    toBlock: to,
  });
  for (const log of logs) {
    const { campaignId, owner, beneficiary, targetAmount, milestoneCount, metadataUri } = (log as unknown as {
      args: {
        campaignId: bigint;
        owner: `0x${string}`;
        beneficiary: `0x${string}`;
        targetAmount: bigint;
        milestoneCount: number;
        metadataUri: string;
      };
      transactionHash: `0x${string}`;
      blockNumber: bigint;
    }).args;
    await supabase.from("campaigns").upsert(
      {
        id: Number(campaignId),
        chain_id: CHAIN_ID,
        owner: owner.toLowerCase(),
        beneficiary: beneficiary.toLowerCase(),
        target_amount: targetAmount.toString(),
        milestone_count: Number(milestoneCount),
        metadata_uri: metadataUri,
        created_tx_hash: log.transactionHash,
        created_block: Number(log.blockNumber),
      },
      { onConflict: "id" }
    );
    console.log("Campaign created:", campaignId.toString());
  }
}

async function indexFundsDeposited(from: bigint, to: bigint) {
  const NO_MILESTONE = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  const logs = await client.getContractEvents({
    address: ESCROW,
    abi: milestoneEscrowAbi,
    eventName: "FundsDeposited",
    fromBlock: from,
    toBlock: to,
  });
  for (const log of logs) {
    const { campaignId, depositor, milestoneIndex, amount } = (log as unknown as {
      args: { campaignId: bigint; depositor: `0x${string}`; milestoneIndex: bigint; amount: bigint };
      transactionHash: `0x${string}`;
      blockNumber: bigint;
    }).args;
    const msIndex = milestoneIndex === NO_MILESTONE ? null : Number(milestoneIndex);
    await supabase.from("escrow_deposits").upsert(
      {
        campaign_id: Number(campaignId),
        depositor: depositor.toLowerCase(),
        amount: amount.toString(),
        milestone_index: msIndex,
        tx_hash: log.transactionHash,
        block_number: Number(log.blockNumber),
      },
      { onConflict: "tx_hash" }
    );
    console.log("Deposit:", campaignId.toString(), "milestone:", msIndex ?? "general", amount.toString());
  }
}

async function indexMilestoneReleased(from: bigint, to: bigint) {
  const logs = await client.getContractEvents({
    address: ESCROW,
    abi: milestoneEscrowAbi,
    eventName: "MilestoneReleased",
    fromBlock: from,
    toBlock: to,
  });
  const affectedBeneficiaries = new Set<string>();
  for (const log of logs) {
    const args = (log as unknown as {
      args: {
        campaignId: bigint;
        milestoneIndex: bigint;
        amount: bigint;
        attestationUID: `0x${string}`;
      };
      transactionHash: `0x${string}`;
      blockNumber: bigint;
    }).args;
    const { campaignId, milestoneIndex, amount, attestationUID } = args;
    await supabase.from("milestone_releases").upsert(
      {
        campaign_id: Number(campaignId),
        milestone_index: Number(milestoneIndex),
        amount: amount.toString(),
        attestation_uid: attestationUID,
        tx_hash: log.transactionHash,
        block_number: Number(log.blockNumber),
      },
      { onConflict: "tx_hash" }
    );
    const beneficiary = await getCampaignBeneficiary(Number(campaignId));
    if (beneficiary) affectedBeneficiaries.add(beneficiary);
    console.log("Release:", campaignId.toString(), milestoneIndex.toString());
  }
  for (const wallet of affectedBeneficiaries) {
    await recomputeWalletReputation(wallet);
    console.log("Reputation refreshed:", wallet);
  }
}

async function loadLastIndexedBlock(): Promise<bigint> {
  const { data } = await supabase
    .from("indexer_state")
    .select("last_indexed_block")
    .eq("id", stateKey)
    .maybeSingle();

  if (data?.last_indexed_block !== undefined && data?.last_indexed_block !== null) {
    return BigInt(data.last_indexed_block);
  }

  // Initialize cursor from env override or current chain head
  const initial = fromBlock > 0n ? fromBlock : await client.getBlockNumber();
  await supabase.from("indexer_state").upsert(
    { id: stateKey, last_indexed_block: initial.toString() },
    { onConflict: "id" }
  );
  return initial;
}

async function persistLastIndexedBlock(block: bigint) {
  await supabase.from("indexer_state").upsert(
    { id: stateKey, last_indexed_block: block.toString() },
    { onConflict: "id" }
  );
}

let lastBlock = await loadLastIndexedBlock();

async function run() {
  const toBlock = await client.getBlockNumber();
  if (toBlock <= lastBlock) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    return run();
  }
  const from = lastBlock + 1n;
  await indexCampaignCreated(from, toBlock);
  await indexFundsDeposited(from, toBlock);
  await indexMilestoneReleased(from, toBlock);
  lastBlock = toBlock;
  await persistLastIndexedBlock(lastBlock);
  await new Promise((r) => setTimeout(r, pollIntervalMs));
  return run();
}

console.log("Starting indexer from block", lastBlock.toString());
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
