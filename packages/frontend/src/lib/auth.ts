import { verifyMessage } from "viem";

/**
 * Verifies a cryptographic signature from a user's wallet.
 * 
 * @param action - A string describing the action (e.g., "Register Organization")
 * @param wallet - The expected signer address
 * @param signature - The hex signature string
 * @param timestamp - The timestamp included in the message (prevent replay)
 */
export async function verifyAminiSignature(
  action: string,
  wallet: string,
  signature: string,
  timestamp: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    // 1. Check timestamp freshness (max 10 minutes)
    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(ts) || Math.abs(now - ts) > 600) {
      return { ok: false, message: "Signature expired. Please try again." };
    }

    // 2. Reconstruct the message
    const message = `Amini Verification\nAction: ${action}\nWallet: ${wallet.toLowerCase()}\nTimestamp: ${timestamp}`;

    // 3. Verify
    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return { ok: false, message: "Invalid cryptographic signature." };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, message: "Signature verification failed: " + (err as Error).message };
  }
}
