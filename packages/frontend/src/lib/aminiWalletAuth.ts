/**
 * Client-side auth payload for `verifyAminiIdentity` when CDP Secret API keys are not on the server.
 * Matches `verifyAminiSignature` in `@/lib/auth` (same message shape as campaign XMTP / comments).
 *
 * Organization **registration** uses `txHash` instead; other writes use token and/or this signature.
 */
export async function buildAminiVerificationAuth(
  action: string,
  walletAddress: string,
  deps: {
    signMessageAsync: (args: { message: string }) => Promise<string>;
    getCdpAccessToken: () => Promise<string | null>;
  },
): Promise<{
  signature: string;
  signatureTimestamp: string;
  cdpAccessToken?: string;
}> {
  const wallet = walletAddress.toLowerCase().trim();
  const signatureTimestamp = Math.floor(Date.now() / 1000).toString();
  const message = `Amini Verification\nAction: ${action}\nWallet: ${wallet}\nTimestamp: ${signatureTimestamp}`;

  let signature: string;
  try {
    signature = await deps.signMessageAsync({ message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not sign verification message.";
    throw new Error(
      `${msg} Approve the signature in your wallet to continue, or configure CDP Secret API keys on the server.`,
    );
  }

  const cdpAccessToken = (await deps.getCdpAccessToken()) ?? undefined;

  return {
    signature,
    signatureTimestamp,
    ...(cdpAccessToken ? { cdpAccessToken } : {}),
  };
}
