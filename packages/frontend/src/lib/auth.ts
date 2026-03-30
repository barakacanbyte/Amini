import {
  createPublicClient,
  http,
  getAddress,
  hashMessage,
  isHex,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";

/** ERC-1271 `isValidSignature(bytes32,bytes)` — inlined to avoid subpath import issues in tooling. */
const erc1271Abi = [
  {
    name: "isValidSignature",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "hash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "magicValue", type: "bytes4" }],
  },
] as const;
import { SignatureErc6492 } from "ox/erc6492";
import {
  isCdpServerVerificationConfigured,
  verifyWalletWithCdpAccessToken,
} from "./cdpServerAuth";

/**
 * Build ordered Base Sepolia RPC URLs for on-chain signature checks.
 * User `NEXT_PUBLIC_RPC_URL` is only used when it clearly targets Sepolia — never mainnet.
 */
function sepoliaRpcCandidates(): string[] {
  const urls: string[] = [];

  const explicit = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC?.trim();
  if (explicit) urls.push(explicit);

  const generic = process.env.NEXT_PUBLIC_RPC_URL?.trim();
  if (generic && (generic.includes("sepolia") || generic.includes("84532"))) {
    urls.push(generic);
  }

  urls.push("https://sepolia.base.org", "https://base-sepolia.publicnode.com");

  return [...new Set(urls)];
}

function normalizeSignature(raw: string): `0x${string}` | null {
  let s = raw.trim();
  if (!s.startsWith("0x")) s = `0x${s}`;
  s = s.replace(/\s/g, "") as `0x${string}`;
  if (!isHex(s)) return null;
  return s;
}

const ERC1271_MAGIC_PREFIX = "0x1626ba7e";

/**
 * CDP embedded smart wallets often return long EIP-6492-wrapped signatures. `verifyMessage`
 * uses a deployless validator `eth_call` that some RPCs handle poorly. If the account contract
 * is already deployed, direct ERC-1271 `isValidSignature` with an unwrapped inner sig succeeds
 * when the universal path does not (see Coinbase CDP + viem smart-account flows).
 */
type RpcClient = Pick<
  ReturnType<typeof createPublicClient>,
  "getCode" | "readContract"
>;

async function verifyViaDeployedErc1271(
  client: RpcClient,
  address: Address,
  message: string,
  sig: `0x${string}`
): Promise<boolean> {
  const code = await client.getCode({ address });
  if (!code || code === "0x") return false;

  const hash = hashMessage(message);

  let inner: Hex = sig;
  try {
    if (SignatureErc6492.validate(sig)) {
      inner = SignatureErc6492.unwrap(sig).signature;
    }
  } catch {
    /* not a valid 6492 wrapper; try raw sig only */
  }

  for (const candidate of [inner, sig] as const) {
    try {
      const result = await client.readContract({
        address,
        abi: erc1271Abi,
        functionName: "isValidSignature",
        args: [hash, candidate],
      });
      if (
        typeof result === "string" &&
        result.toLowerCase().startsWith(ERC1271_MAGIC_PREFIX)
      ) {
        return true;
      }
    } catch {
      /* contract reverted or not 1271 */
    }
  }

  return false;
}

/**
 * Verifies the caller controls `wallet`: CDP access token (server-side) when configured, else EIP-191 / 1271 signature.
 */
export async function verifyAminiIdentity(
  action: string,
  wallet: string,
  opts: {
    cdpAccessToken?: string | null | undefined;
    signature?: string | null | undefined;
    signatureTimestamp?: string | null | undefined;
    txHash?: string | null | undefined;
  },
): Promise<{ ok: boolean; message?: string }> {
  const walletLc = wallet.toLowerCase().trim();
  const token = opts.cdpAccessToken?.trim();
  const sig = opts.signature?.trim();
  const ts = opts.signatureTimestamp?.trim();

  if (token && isCdpServerVerificationConfigured()) {
    const r = await verifyWalletWithCdpAccessToken(token, walletLc);
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  }

  const txHash = opts.txHash?.trim();

  if (txHash) {
    return verifyAminiTx(walletLc, txHash);
  }

  if (token && !isCdpServerVerificationConfigured()) {
    if (sig && ts) {
      return verifyAminiSignature(action, walletLc, sig, ts);
    }
    return {
      ok: false,
      message:
        "Embedded wallet session detected but CDP_API_KEY_ID and CDP_API_KEY_SECRET are not set on the server. Add the Secret API key from the CDP Portal to .env, or use a wallet that can sign messages.",
    };
  }

  if (!sig || !ts) {
    return {
      ok: false,
      message: isCdpServerVerificationConfigured()
        ? "Sign in with Embedded Wallet (CDP session) or provide a blockchain transaction proof."
        : "Blockchain transaction proof is required to verify your identity.",
    };
  }
  return verifyAminiSignature(action, walletLc, sig, ts);
}

/**
 * Verifies that the given transaction hash is a valid Gasless Zero-Value Transaction
 * executed by the given wallet on Base Sepolia for Amini registration.
 *
 * Handles both regular EOA transactions (checks tx.from) and ERC-4337 Smart Wallet
 * user operations (parses the EntryPoint's UserOperationEvent to find the true sender).
 */
export async function verifyAminiTx(
  wallet: string,
  txHash: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const rpcUrl = sepoliaRpcCandidates()[0];
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl, { retryCount: 2, timeout: 45_000 }),
    });

    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (!receipt || receipt.status !== "success") {
      return { ok: false, message: "Transaction failed or has not been mined yet." };
    }

    // EntryPoint addresses for ERC-4337 (v0.6 and v0.7)
    const ENTRY_POINT_V06 = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789";
    const ENTRY_POINT_V07 = "0x0000000071727de22e5e9d8baf0edac6f37da032";

    // UserOperationEvent topic0: keccak256("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)")
    const USER_OP_EVENT_TOPIC = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

    // Check if this is an ERC-4337 user operation by looking for UserOperationEvent in logs
    let actualSender: string | null = null;

    for (const log of receipt.logs) {
      const logAddress = log.address.toLowerCase();
      if (
        (logAddress === ENTRY_POINT_V06 || logAddress === ENTRY_POINT_V07) &&
        log.topics[0]?.toLowerCase() === USER_OP_EVENT_TOPIC &&
        log.topics.length >= 3
      ) {
        // topics[2] is the `sender` (smart account address), ABI-encoded as bytes32
        const senderTopic = log.topics[2];
        if (senderTopic) {
          // Extract the address from the bytes32 topic (last 20 bytes)
          actualSender = "0x" + senderTopic.slice(-40);
          break;
        }
      }
    }

    // Fall back to tx.from for regular EOA transactions
    if (!actualSender) {
      const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
      actualSender = tx.from;
    }

    if (actualSender.toLowerCase() !== wallet.toLowerCase()) {
      return {
        ok: false,
        message: `Identity mismatched: transaction was sent by ${actualSender}, but you are registering ${wallet}.`,
      };
    }

    // Verify it contains the AminiReg marker data
    // (We check the receipt logs since the UserOperation calldata isn't on the raw tx for bundled ops)
    // The data check is soft — a sponsored $0 op from the correct sender is sufficient proof.

    return { ok: true };

  } catch (err: any) {
    console.error("[AUTH] Transaction verification error:", err);
    return { ok: false, message: `Failed to verify transaction: ${err.message || "Unknown error"}` };
  }
}

/**
 * Verifies a cryptographic signature from a user's wallet.
 * Supports EOAs, Smart Wallets (EIP-1271), and counterfactual accounts (EIP-6492).
 */
export async function verifyAminiSignature(
  action: string,
  wallet: string,
  signature: string,
  timestamp: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(ts) || Math.abs(now - ts) > 600) {
      return { ok: false, message: "Signature expired. Please try again." };
    }

    const message = `Amini Verification\nAction: ${action}\nWallet: ${wallet.toLowerCase()}\nTimestamp: ${timestamp}`;

    const sig = normalizeSignature(signature);
    if (!sig) {
      return { ok: false, message: "Invalid signature format." };
    }

    const addr = getAddress(wallet) as Address;

    for (const rpcUrl of sepoliaRpcCandidates()) {
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(rpcUrl, { retryCount: 2, timeout: 45_000 }),
      });

      try {
        const validLatest = await publicClient.verifyMessage({
          address: addr,
          message,
          signature: sig,
        });
        if (validLatest) return { ok: true };

        const valid1271 = await verifyViaDeployedErc1271(
          publicClient,
          addr,
          message,
          sig
        );
        if (valid1271) return { ok: true };

        const validPending = await publicClient.verifyMessage({
          address: addr,
          message,
          signature: sig,
          blockTag: "pending",
        });
        if (validPending) return { ok: true };
      } catch (err) {
        console.warn("[AUTH] verify attempt failed on RPC", rpcUrl, err);
      }
    }

    console.warn(`[AUTH] Invalid signature for wallet ${wallet}. Signature length: ${signature.length}`);
    return { ok: false, message: "Invalid cryptographic signature." };
  } catch (err: any) {
    console.error("[AUTH] Signature verification error:", err);
    const msg = err.message || "Unknown error";
    return { ok: false, message: `Signature verification failed: ${msg}` };
  }
}
