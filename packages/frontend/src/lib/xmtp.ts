import { fromHex, type WalletClient } from "viem";
import type { Dm, Client, XmtpEnv } from "@xmtp/browser-sdk";

export type XmtpInitResult = {
  ok: boolean;
  message: string;
  inboxId?: string;
};

export type XmtpThreadMessage = {
  id: string;
  senderInboxId: string;
  text: string;
  sentAt: string;
};

/** When provided, the client may POST a row to `campaign_xmtp_thread_bindings` after the conversation id is first persisted locally. */
export type XmtpBindingAuthGetter = () => Promise<{
  viewerWallet: string;
  signature?: string;
  signatureTimestamp?: string;
  cdpAccessToken?: string;
} | null>;

type XmtpSession = {
  account: `0x${string}`;
  env: XmtpEnv;
  client: Client;
};

type XmtpModule = typeof import("@xmtp/browser-sdk");

let session: XmtpSession | null = null;
const threadCache = new Map<string, Dm>();

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function ensureWalletAccount(
  walletClient: WalletClient | undefined
): { walletClient: WalletClient; account: `0x${string}` } {
  if (!walletClient?.account?.address) {
    throw new Error("No wallet account connected.");
  }
  return {
    walletClient,
    account: normalizeAddress(walletClient.account.address),
  };
}

async function ensureSession(
  walletClient: WalletClient | undefined,
  env: XmtpEnv
): Promise<{ client: Client; account: `0x${string}`; mod: XmtpModule }> {
  const ensured = ensureWalletAccount(walletClient);

  if (
    session &&
    session.account === ensured.account &&
    session.env === env
  ) {
    const mod = await import("@xmtp/browser-sdk");
    return { client: session.client, account: ensured.account, mod };
  }

  if (session) {
    session.client.close();
    session = null;
    threadCache.clear();
  }

  const mod = await import("@xmtp/browser-sdk");
  const signer = {
    type: "EOA" as const,
    getIdentifier: () => ({
      identifier: ensured.account,
      identifierKind: mod.IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string) => {
      const signature = await ensured.walletClient.signMessage({
        account: ensured.walletClient.account!,
        message,
      });
      return fromHex(signature, "bytes");
    },
  };

  const client = await mod.Client.create(signer, { env });
  session = { account: ensured.account, env, client };
  return { client, account: ensured.account, mod };
}

function toThreadStorageKey(
  account: string,
  env: string,
  campaignId: number,
  peerAddress: string
) {
  return `amini:xmtp:thread:${env}:${account}:${campaignId}:${peerAddress}`;
}

function toDirectThreadStorageKey(account: string, env: string, peerAddress: string) {
  return `amini:xmtp:direct:${env}:${account}:${peerAddress}`;
}

/** Wallet-to-wallet DM (no campaign). Reuses the same XMTP DM as other flows for a given peer. */
async function resolveDirectDm(
  walletClient: WalletClient | undefined,
  env: XmtpEnv,
  peerAddress: `0x${string}`,
): Promise<{ dm: Dm; client: Client }> {
  const { client, account, mod } = await ensureSession(walletClient, env);
  const threadKey = `${account}:${env}:direct:${peerAddress}`;
  const cached = threadCache.get(threadKey);
  if (cached) return { dm: cached, client };

  const storageKey = toDirectThreadStorageKey(account, env, peerAddress);
  const storedId =
    typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;

  if (storedId) {
    const maybeConversation = await client.conversations.getConversationById(storedId);
    if (maybeConversation) {
      const dm = maybeConversation as Dm;
      threadCache.set(threadKey, dm);
      return { dm, client };
    }
  }

  const peerIdentifier = {
    identifier: peerAddress,
    identifierKind: mod.IdentifierKind.Ethereum,
  };
  const existingDm = await client.conversations.fetchDmByIdentifier(peerIdentifier);
  const dm = existingDm ?? (await client.conversations.createDmWithIdentifier(peerIdentifier));

  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, dm.id);
  }
  threadCache.set(threadKey, dm);

  return { dm, client };
}

async function persistCampaignXmtpBinding(
  campaignId: number,
  auth: {
    viewerWallet: string;
    signature?: string;
    signatureTimestamp?: string;
    cdpAccessToken?: string;
  },
  peerWallet: `0x${string}`,
  env: XmtpEnv,
  conversationId: string
): Promise<void> {
  try {
    await fetch(`/api/campaigns/${campaignId}/xmtp-thread`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        viewerWallet: auth.viewerWallet,
        peerWallet,
        xmtpEnv: env,
        conversationId,
        signature: auth.signature,
        signatureTimestamp: auth.signatureTimestamp,
        cdpAccessToken: auth.cdpAccessToken,
      }),
    });
  } catch {
    /* non-fatal: localStorage still holds the thread id */
  }
}

async function resolveCampaignDm(
  walletClient: WalletClient | undefined,
  env: XmtpEnv,
  campaignId: number,
  peerAddress: `0x${string}`,
  getBindingAuth?: XmtpBindingAuthGetter
): Promise<{ dm: Dm; client: Client }> {
  const { client, account, mod } = await ensureSession(walletClient, env);
  const threadKey = `${account}:${env}:${campaignId}:${peerAddress}`;
  const cached = threadCache.get(threadKey);
  if (cached) return { dm: cached, client };

  const storageKey = toThreadStorageKey(account, env, campaignId, peerAddress);
  const storedId =
    typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;

  if (storedId) {
    const maybeConversation = await client.conversations.getConversationById(storedId);
    if (maybeConversation) {
      const dm = maybeConversation as Dm;
      threadCache.set(threadKey, dm);
      return { dm, client };
    }
  }

  const peerIdentifier = {
    identifier: peerAddress,
    identifierKind: mod.IdentifierKind.Ethereum,
  };
  const existingDm = await client.conversations.fetchDmByIdentifier(peerIdentifier);
  const dm = existingDm ?? (await client.conversations.createDmWithIdentifier(peerIdentifier));

  const previous =
    typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, dm.id);
  }
  threadCache.set(threadKey, dm);

  if (getBindingAuth && previous !== dm.id) {
    try {
      const auth = await getBindingAuth();
      if (auth?.viewerWallet) {
        void persistCampaignXmtpBinding(
          campaignId,
          auth,
          normalizeAddress(peerAddress),
          env,
          dm.id
        );
      }
    } catch {
      /* ignore */
    }
  }

  return { dm, client };
}

function toThreadMessages(messages: Awaited<ReturnType<Dm["messages"]>>): XmtpThreadMessage[] {
  return messages
    .map((m) => ({
      id: m.id,
      senderInboxId: m.senderInboxId,
      text: typeof m.content === "string" ? m.content : (m.fallback ?? "[non-text message]"),
      sentAt: m.sentAt.toISOString(),
    }))
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
}

export async function initXmtpClient(
  walletClient: WalletClient | undefined,
  env: XmtpEnv = "dev"
): Promise<XmtpInitResult> {
  try {
    const { client } = await ensureSession(walletClient, env);
    return {
      ok: true,
      message: "XMTP client ready.",
      inboxId: client.inboxId,
    };
  } catch (error) {
    return {
      ok: false,
      message: `XMTP init failed: ${(error as Error).message}`,
    };
  }
}

export async function loadCampaignThreadMessages(
  walletClient: WalletClient | undefined,
  env: XmtpEnv,
  campaignId: number,
  peerAddress: `0x${string}`,
  getBindingAuth?: XmtpBindingAuthGetter
): Promise<XmtpThreadMessage[]> {
  const { dm } = await resolveCampaignDm(
    walletClient,
    env,
    campaignId,
    normalizeAddress(peerAddress),
    getBindingAuth
  );
  await dm.sync();
  const messages = await dm.messages({ limit: BigInt(100) });
  return toThreadMessages(messages);
}

export async function sendCampaignThreadMessage(
  walletClient: WalletClient | undefined,
  env: XmtpEnv,
  campaignId: number,
  peerAddress: `0x${string}`,
  text: string,
  getBindingAuth?: XmtpBindingAuthGetter
): Promise<XmtpThreadMessage[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const { dm } = await resolveCampaignDm(
    walletClient,
    env,
    campaignId,
    normalizeAddress(peerAddress),
    getBindingAuth
  );
  await dm.sendText(trimmed);
  const messages = await dm.messages({ limit: BigInt(100) });
  return toThreadMessages(messages);
}

export async function loadDirectDmMessages(
  walletClient: WalletClient | undefined,
  env: XmtpEnv,
  peerAddress: `0x${string}`,
): Promise<XmtpThreadMessage[]> {
  const { dm } = await resolveDirectDm(walletClient, env, normalizeAddress(peerAddress));
  await dm.sync();
  const messages = await dm.messages({ limit: BigInt(100) });
  return toThreadMessages(messages);
}

export async function sendDirectDmMessage(
  walletClient: WalletClient | undefined,
  env: XmtpEnv,
  peerAddress: `0x${string}`,
  text: string,
): Promise<XmtpThreadMessage[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const { dm } = await resolveDirectDm(walletClient, env, normalizeAddress(peerAddress));
  await dm.sendText(trimmed);
  const messages = await dm.messages({ limit: BigInt(100) });
  return toThreadMessages(messages);
}

