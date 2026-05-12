import { BASE_MAINNET_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID } from "@amini/shared";

/** CDP `network` argument for `sendUserOperation` / `useWaitForUserOperation` (see CDP `KnownEvmNetworks`). */
export type CdpEvmNetwork = "base-sepolia" | "base";

export function cdpEvmNetworkFromChainId(chainId: number): CdpEvmNetwork {
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return "base-sepolia";
  if (chainId === BASE_MAINNET_CHAIN_ID) return "base";
  throw new Error(`Unsupported chain ${chainId} for CDP user operations`);
}

type CdpUserOpLike = {
  transactionHash?: string | null;
  receipts?: Array<{ transactionHash?: string | null }> | null;
} | null | undefined;

/**
 * Canonical L2 tx hash from a completed CDP user operation (top-level or first receipt with a hash).
 */
export function canonicalTxHashFromCdpUserOperation(op: CdpUserOpLike): `0x${string}` | undefined {
  const top = typeof op?.transactionHash === "string" ? op.transactionHash.trim() : "";
  const fromReceipt = op?.receipts
    ?.map((r) => (typeof r?.transactionHash === "string" ? r.transactionHash.trim() : ""))
    .find((h) => /^0x[a-fA-F0-9]{64}$/i.test(h));
  const raw = top && /^0x[a-fA-F0-9]{64}$/i.test(top) ? top : fromReceipt;
  if (!raw || !/^0x[a-fA-F0-9]{64}$/i.test(raw)) return undefined;
  return raw.toLowerCase() as `0x${string}`;
}
