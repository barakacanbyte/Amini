import {
  campaignRegistryAbi as registryAbi,
  milestoneEscrowAbi as escrowAbi,
  USDC_BASE_MAINNET,
  USDC_BASE_SEPOLIA,
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
} from "@amini/shared";
import type { Address } from "viem";

const stage = process.env.NEXT_PUBLIC_STAGE ?? "testnet";
const isTestnet = stage === "testnet";
const chainId = isTestnet ? BASE_SEPOLIA_CHAIN_ID : BASE_MAINNET_CHAIN_ID;

export const config = {
  chainId,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS as Address) || (isTestnet ? USDC_BASE_SEPOLIA : USDC_BASE_MAINNET),
  campaignRegistry: process.env.NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS as Address | undefined,
  escrow: process.env.NEXT_PUBLIC_ESCROW_ADDRESS as Address | undefined,
} as const;

export const campaignRegistryAbi = registryAbi;
export const milestoneEscrowAbi = escrowAbi;

/** USDC has 6 decimals on Base */
export const USDC_DECIMALS = 6;
export function parseUsdc(amount: string): bigint {
  const [whole = "0", frac = ""] = amount.split(".");
  const padded = frac.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  return BigInt(whole + padded);
}

export function formatUsdc(raw: bigint): string {
  const s = raw.toString().padStart(USDC_DECIMALS + 1, "0");
  const int = s.slice(0, -USDC_DECIMALS) || "0";
  const dec = s.slice(-USDC_DECIMALS).replace(/0+$/, "") || "0";
  return dec === "0" ? int : `${int}.${dec}`;
}
