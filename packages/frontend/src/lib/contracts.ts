import {
  campaignRegistryAbi as registryAbi,
  milestoneEscrowAbi as escrowAbi,
  USDC_BASE_SEPOLIA,
  BASE_SEPOLIA_CHAIN_ID,
} from "@amini/shared";
import type { Address } from "viem";

/** App targets Base Sepolia only (see `providers.tsx` + `auth.ts`). */
const chainId = BASE_SEPOLIA_CHAIN_ID;

export const config = {
  chainId,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS as Address) || USDC_BASE_SEPOLIA,
  campaignRegistry: process.env.NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS as Address | undefined,
  escrow: process.env.NEXT_PUBLIC_ESCROW_ADDRESS as Address | undefined,
} as const;

export const campaignRegistryAbi = registryAbi;
export const milestoneEscrowAbi = escrowAbi;

/** USDC has 6 decimals on Base */
export const USDC_DECIMALS = 6;
export function parseUsdc(amount: string): bigint {
  // Normalize common user input formats:
  // - trim whitespace
  // - allow thousands separators (commas)
  // - strip a leading $ / trailing USDC or USD (paste noise)
  // - allow empty string (treated as 0)
  let normalized = amount
    .trim()
    // allow separators like "50,000" and "50 000" and "50_000"
    .replace(/[,\\s_]/g, "");
  if (normalized.startsWith("$")) normalized = normalized.slice(1).trim();
  normalized = normalized.replace(/\s*(usdc|usd)\s*$/i, "").trim();
  if (!normalized) return BigInt(0);

  // Accept partial/edge inputs like:
  // - "" (handled above)
  // - "." / "0." => treated as 0
  // - "123." => fractional becomes zeros
  const parts = normalized.split(".");
  const wholeRaw = parts[0] ?? "0";
  const fracRaw = parts.slice(1).join(""); // tolerate accidental extra dots

  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const frac = fracRaw ?? "";

  // Let callers decide error behavior by keeping `BigInt(...)` strict.
  // (We only sanitize formatting above.)
  const padded = frac.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  return BigInt(whole + padded);
}

/** Like `parseUsdc`, but returns null if the string cannot be parsed as a fixed USDC amount. */
export function tryParseUsdc(amount: string): bigint | null {
  try {
    return parseUsdc(amount);
  } catch {
    // Paste noise e.g. "Goal: US$12,500.00" — first number-like token, then normal parse rules.
    try {
      const m = amount.match(/-?\d[\d,_\s]*(?:\.\d*)?/);
      if (!m) return null;
      return parseUsdc(m[0]);
    } catch {
      return null;
    }
  }
}

export function formatUsdc(raw: bigint): string {
  const s = raw.toString().padStart(USDC_DECIMALS + 1, "0");
  const int = s.slice(0, -USDC_DECIMALS) || "0";
  const dec = s.slice(-USDC_DECIMALS).replace(/0+$/, "") || "0";
  return dec === "0" ? int : `${int}.${dec}`;
}
