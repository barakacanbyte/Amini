import { getAddress, isAddress } from "viem";

export function normalizeProfileWallet(raw: string): string | null {
  try {
    if (!isAddress(raw)) return null;
    return getAddress(raw).toLowerCase();
  } catch {
    return null;
  }
}
