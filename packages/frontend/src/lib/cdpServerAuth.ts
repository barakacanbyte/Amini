import { CdpClient } from "@coinbase/cdp-sdk";

let cachedClient: CdpClient | null | undefined;

export function isCdpServerVerificationConfigured(): boolean {
  return Boolean(
    process.env.CDP_API_KEY_ID?.trim() && process.env.CDP_API_KEY_SECRET?.trim(),
  );
}

function getCdpClient(): CdpClient | null {
  if (!isCdpServerVerificationConfigured()) return null;
  if (cachedClient === undefined) {
    cachedClient = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
    });
  }
  return cachedClient;
}

function endUserOwnsWallet(
  endUser: {
    evmAccounts?: string[];
    evmSmartAccounts?: string[];
    evmAccountObjects?: { address: string }[];
    evmSmartAccountObjects?: { address: string }[];
  },
  wallet: string,
): boolean {
  const w = wallet.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return false;

  if (endUser.evmAccountObjects?.some((a) => a.address.toLowerCase() === w)) {
    return true;
  }
  if (
    endUser.evmSmartAccountObjects?.some((a) => a.address.toLowerCase() === w)
  ) {
    return true;
  }
  if (endUser.evmAccounts?.some((a) => a.toLowerCase() === w)) {
    return true;
  }
  if (endUser.evmSmartAccounts?.some((a) => a.toLowerCase() === w)) {
    return true;
  }
  return false;
}

/**
 * Validates a CDP end-user access token and checks that `wallet` belongs to that user.
 * Requires `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` (Secret API Key from CDP Portal).
 */
export async function verifyWalletWithCdpAccessToken(
  accessToken: string,
  wallet: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = getCdpClient();
  if (!client) {
    return {
      ok: false,
      message: "CDP server verification is not configured.",
    };
  }
  const token = accessToken.trim();
  if (!token) {
    return { ok: false, message: "Missing CDP access token." };
  }
  try {
    const endUser = await client.endUser.validateAccessToken({
      accessToken: token,
    });
    if (!endUserOwnsWallet(endUser, wallet)) {
      return {
        ok: false,
        message: "CDP session does not include this wallet address.",
      };
    }
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Invalid or expired CDP access token.";
    console.warn("[AUTH] CDP validateAccessToken failed:", msg);
    return { ok: false, message: msg };
  }
}
