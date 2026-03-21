/**
 * Contract address keys used by the app (values come from env).
 * Base Mainnet / Sepolia USDC and EAS are in chain.ts.
 */
export const CONTRACT_KEYS = {
  CAMPAIGN_REGISTRY: "NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS",
  ESCROW: "NEXT_PUBLIC_ESCROW_ADDRESS",
  USDC: "NEXT_PUBLIC_USDC_ADDRESS",
} as const;
