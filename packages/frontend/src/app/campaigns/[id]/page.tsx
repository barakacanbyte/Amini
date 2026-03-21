"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWalletClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { Tag } from "@coinbase/cds-web/tag/Tag";
import { Spinner } from "@coinbase/cds-web/loaders/Spinner";
import {
  config,
  campaignRegistryAbi,
  milestoneEscrowAbi,
  formatUsdc,
  parseUsdc,
} from "@/lib/contracts";
import {
  initXmtpClient,
  loadCampaignThreadMessages,
  sendCampaignThreadMessage,
} from "@/lib/xmtp";
import {
  IDKitRequestWidget,
  orbLegacy,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";

const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export default function CampaignPage() {
  const params = useParams();
  const id = params.id as string;
  const campaignId = BigInt(id);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const registryAddress = config.campaignRegistry;
  const escrowAddress = config.escrow;

  const { data: campaign, isLoading: loadingCampaign } = useReadContract({
    address: registryAddress,
    abi: campaignRegistryAbi,
    functionName: "getCampaign",
    args: [campaignId],
    chainId: config.chainId,
  });

  const { data: escrowState } = useReadContract({
    address: escrowAddress,
    abi: milestoneEscrowAbi,
    functionName: "getEscrowState",
    args: [campaignId],
    chainId: config.chainId,
  });

  const [fundAmount, setFundAmount] = useState("");
  const [releaseMilestoneIndex, setReleaseMilestoneIndex] = useState("");
  const [attestationUid, setAttestationUid] = useState("");
  const [deposits, setDeposits] = useState<
    Array<{ tx_hash: string; depositor: string; amount: string; block_number: number; created_at: string }>
  >([]);
  const [releases, setReleases] = useState<
    Array<{ tx_hash: string; milestone_index: number; amount: string; attestation_uid: string | null; block_number: number; created_at: string }>
  >([]);
  const [impactPosts, setImpactPosts] = useState<
    Array<{
      id: number;
      milestone_index: number | null;
      author_wallet: string;
      body: string;
      arweave_tx_id: string;
      arweave_url: string;
      attachment_tx_id: string | null;
      attachment_url: string | null;
      attachment_name: string | null;
      attachment_content_type: string | null;
      tx_hash_link: string | null;
      created_at: string;
    }>
  >([]);
  const [flowLoaded, setFlowLoaded] = useState(false);
  const [impactBody, setImpactBody] = useState("");
  const [impactMilestone, setImpactMilestone] = useState("");
  const [impactTxHash, setImpactTxHash] = useState("");
  const [impactFile, setImpactFile] = useState<File | null>(null);
  const [impactSubmitting, setImpactSubmitting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [campaignShareUrl, setCampaignShareUrl] = useState("");
  const [beneficiaryReputation, setBeneficiaryReputation] = useState<{
    score: number;
    attested_count: number;
    sybil_verified: boolean;
    last_updated: string;
  } | null>(null);
  const [reputationLoaded, setReputationLoaded] = useState(false);
  const [worldIdOpen, setWorldIdOpen] = useState(false);
  const [worldIdBusy, setWorldIdBusy] = useState(false);
  const [worldIdStatus, setWorldIdStatus] = useState<string>("");
  const [worldIdRpContext, setWorldIdRpContext] = useState<RpContext | null>(null);
  const [worldIdConfigReady, setWorldIdConfigReady] = useState<boolean | null>(null);
  const [worldIdMissingConfig, setWorldIdMissingConfig] = useState<string[]>([]);
  const [reputationRefreshNonce, setReputationRefreshNonce] = useState(0);
  const [xmtpStatus, setXmtpStatus] = useState<string>("Not initialized");
  const [xmtpReady, setXmtpReady] = useState(false);
  const [xmtpDraft, setXmtpDraft] = useState("");
  const [xmtpInboxId, setXmtpInboxId] = useState<string | null>(null);
  const [xmtpBusy, setXmtpBusy] = useState(false);
  const [xmtpMessages, setXmtpMessages] = useState<
    Array<{ id: string; senderInboxId: string; text: string; sentAt: string }>
  >([]);

  const { writeContract: writeApprove, data: txApprove, isPending: isPendingApprove } = useWriteContract();
  const { isLoading: isConfirmingApprove } = useWaitForTransactionReceipt({ hash: txApprove });
  const { writeContract: writeDeposit, data: txDeposit, isPending: isPendingDeposit } = useWriteContract();
  const { isLoading: isConfirmingDeposit } = useWaitForTransactionReceipt({ hash: txDeposit });
  const { writeContract: writeRelease, data: txRelease, isPending: isPendingRelease } = useWriteContract();
  const { isLoading: isConfirmingRelease } = useWaitForTransactionReceipt({ hash: txRelease });

  type CampaignTuple = readonly [owner: `0x${string}`, beneficiary: `0x${string}`, targetAmount: bigint, milestoneCount: number, metadataUri: string, exists: boolean];
  const c = campaign as CampaignTuple | undefined;
  const isOwner = address && c && c[0].toLowerCase() === address.toLowerCase();
  const isBeneficiary = address && c && c[1].toLowerCase() === address.toLowerCase();
  const approveConfirmed = txApprove && !isConfirmingApprove;

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anon || !id) return;
    const headers: HeadersInit = {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    };

    async function loadFlow() {
      try {
        const depRes = await fetch(
          `${supabaseUrl}/rest/v1/escrow_deposits?select=tx_hash,depositor,amount,block_number,created_at&campaign_id=eq.${id}&order=id.desc&limit=100`,
          { headers, cache: "no-store" }
        );
        const relRes = await fetch(
          `${supabaseUrl}/rest/v1/milestone_releases?select=tx_hash,milestone_index,amount,attestation_uid,block_number,created_at&campaign_id=eq.${id}&order=id.desc&limit=100`,
          { headers, cache: "no-store" }
        );
        const impactRes = await fetch(
          `${supabaseUrl}/rest/v1/impact_posts?select=id,milestone_index,author_wallet,body,arweave_tx_id,arweave_url,attachment_tx_id,attachment_url,attachment_name,attachment_content_type,tx_hash_link,created_at&campaign_id=eq.${id}&order=id.desc&limit=100`,
          { headers, cache: "no-store" }
        );
        if (depRes.ok) {
          const dep = (await depRes.json()) as Array<{ tx_hash: string; depositor: string; amount: string; block_number: number; created_at: string }>;
          setDeposits(dep);
        }
        if (relRes.ok) {
          const rel = (await relRes.json()) as Array<{ tx_hash: string; milestone_index: number; amount: string; attestation_uid: string | null; block_number: number; created_at: string }>;
          setReleases(rel);
        }
        if (impactRes.ok) {
          const impact = (await impactRes.json()) as Array<{
            id: number;
            milestone_index: number | null;
            author_wallet: string;
            body: string;
            arweave_tx_id: string;
            arweave_url: string;
            attachment_tx_id: string | null;
            attachment_url: string | null;
            attachment_name: string | null;
            attachment_content_type: string | null;
            tx_hash_link: string | null;
            created_at: string;
          }>;
          setImpactPosts(impact);
        }
      } finally {
        setFlowLoaded(true);
      }
    }

    loadFlow();
  }, [id]);

  const handleApprove = async () => {
    if (!escrowAddress || !config.usdc || !fundAmount) return;
    const amountWei = parseUsdc(fundAmount);
    if (amountWei <= BigInt(0)) return;
    try {
      writeApprove({
        address: config.usdc,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [escrowAddress, amountWei],
        chainId: config.chainId,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeposit = () => {
    if (!escrowAddress || !fundAmount) return;
    const amountWei = parseUsdc(fundAmount);
    if (amountWei <= BigInt(0)) return;
    writeDeposit({
      address: escrowAddress,
      abi: milestoneEscrowAbi,
      functionName: "deposit",
      args: [campaignId, amountWei],
      chainId: config.chainId,
    });
  };

  const handleRelease = () => {
    if (!escrowAddress || releaseMilestoneIndex === "" || !attestationUid) return;
    const index = parseInt(releaseMilestoneIndex, 10);
    if (isNaN(index) || index < 0) return;
    const uid = attestationUid.startsWith("0x") ? attestationUid : `0x${attestationUid}`;
    if (uid.length !== 66) {
      alert("Attestation UID must be 32 bytes (0x + 64 hex chars).");
      return;
    }
    writeRelease({
      address: escrowAddress,
      abi: milestoneEscrowAbi,
      functionName: "releaseMilestone",
      args: [campaignId, BigInt(index), uid as `0x${string}`],
      chainId: config.chainId,
    });
  };

  const handlePostImpact = async () => {
    if (!address) {
      alert("Connect wallet first.");
      return;
    }
    if (!impactBody.trim()) {
      alert("Impact post body is required.");
      return;
    }

    setImpactSubmitting(true);
    try {
      const form = new FormData();
      form.append("campaignId", String(Number(id)));
      if (impactMilestone.trim() !== "") {
        form.append("milestoneIndex", impactMilestone.trim());
      }
      if (impactTxHash.trim() !== "") {
        form.append("txHashLink", impactTxHash.trim());
      }
      form.append("authorWallet", address);
      form.append("body", impactBody.trim());
      if (impactFile) {
        form.append("file", impactFile);
      }
      const res = await fetch("/api/impact", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        arweaveTxId?: string;
        arweaveUrl?: string;
        attachmentTxId?: string | null;
        attachmentUrl?: string | null;
        attachmentName?: string | null;
        attachmentContentType?: string | null;
      };
      if (!res.ok || !json.ok || !json.arweaveTxId || !json.arweaveUrl) {
        throw new Error(json.message ?? "Failed to publish impact post.");
      }
      const arweaveTxId = json.arweaveTxId;
      const arweaveUrl = json.arweaveUrl;

      setImpactPosts((prev) => [
        {
          id: Date.now(),
          milestone_index:
            impactMilestone.trim() === "" ? null : Number(impactMilestone.trim()),
          author_wallet: address.toLowerCase(),
          body: impactBody.trim(),
          arweave_tx_id: arweaveTxId,
          arweave_url: arweaveUrl,
          attachment_tx_id: json.attachmentTxId ?? null,
          attachment_url: json.attachmentUrl ?? null,
          attachment_name: json.attachmentName ?? null,
          attachment_content_type: json.attachmentContentType ?? null,
          tx_hash_link: impactTxHash.trim() || null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setImpactBody("");
      setImpactMilestone("");
      setImpactTxHash("");
      setImpactFile(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setImpactSubmitting(false);
    }
  };

  const handleInitXmtp = async () => {
    const env = (process.env.NEXT_PUBLIC_XMTP_ENV ?? "dev") as "dev" | "production";
    setXmtpBusy(true);
    const result = await initXmtpClient(walletClient, env);
    setXmtpStatus(result.message);
    setXmtpReady(result.ok);
    setXmtpInboxId(result.inboxId ?? null);
    setXmtpBusy(false);
  };

  const handleSendXmtpDraft = async () => {
    if (!walletClient || !xmtpReady || !xmtpDraft.trim() || !c) return;
    const env = (process.env.NEXT_PUBLIC_XMTP_ENV ?? "dev") as "dev" | "production";
    const [owner, beneficiaryAddr] = c;
    const peerAddress =
      address && address.toLowerCase() === beneficiaryAddr.toLowerCase()
        ? owner
        : beneficiaryAddr;

    setXmtpBusy(true);
    try {
      const messages = await sendCampaignThreadMessage(
        walletClient,
        env,
        Number(id),
        peerAddress,
        xmtpDraft
      );
      setXmtpMessages(messages);
      setXmtpDraft("");
      setXmtpStatus("Message sent.");
    } catch (error) {
      setXmtpStatus(`XMTP send failed: ${(error as Error).message}`);
    } finally {
      setXmtpBusy(false);
    }
  };

  const handleStartWorldId = async () => {
    if (!address || !c) return;
    const beneficiary = c[1].toLowerCase();
    if (address.toLowerCase() !== beneficiary) {
      setWorldIdStatus("Only the beneficiary wallet can verify for this campaign.");
      return;
    }

    const action = process.env.NEXT_PUBLIC_WORLDCOIN_ACTION ?? "";
    if (!action) {
      setWorldIdStatus("Missing NEXT_PUBLIC_WORLDCOIN_ACTION in env.");
      return;
    }

    setWorldIdBusy(true);
    try {
      const res = await fetch("/api/world-id/rp-signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        rp_context?: RpContext;
      };
      if (!res.ok || !json.ok || !json.rp_context) {
        throw new Error(json.message ?? "Failed to prepare World ID verification.");
      }
      setWorldIdRpContext(json.rp_context);
      setWorldIdOpen(true);
      setWorldIdStatus("Scan with World App to verify.");
    } catch (error) {
      setWorldIdStatus((error as Error).message);
    } finally {
      setWorldIdBusy(false);
    }
  };

  const handleVerifyWorldId = async (result: IDKitResult) => {
    if (!address || !worldIdRpContext) {
      throw new Error("Missing wallet or RP context.");
    }
    const res = await fetch("/api/world-id/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rp_id: worldIdRpContext.rp_id,
        wallet: address.toLowerCase(),
        idkitResponse: result,
      }),
    });
    const json = (await res.json()) as { ok: boolean; message?: string };
    if (!res.ok || !json.ok) {
      throw new Error(json.message ?? "World ID verification failed.");
    }
  };

  const handleWorldIdSuccess = async () => {
    setWorldIdStatus("World ID verified.");
    setWorldIdOpen(false);
    setReputationRefreshNonce((v) => v + 1);
  };

  if (loadingCampaign || (c && !c[5])) {
    return (
      <main className="app-page px-4 py-8 md:px-8">
        <div className="app-surface mx-auto max-w-2xl rounded-2xl p-6 md:p-8">
          {loadingCampaign ? (
            <div className="flex items-center gap-3">
              <Spinner size={3} accessibilityLabel="Loading campaign" />
              <TextBody as="p" className="app-muted">Loading campaign...</TextBody>
            </div>
          ) : (
            <Tag colorScheme="yellow" emphasis="high">Campaign not found.</Tag>
          )}
          <Button as={Link} href="/campaigns" variant="secondary" compact transparent className="mt-4">
            ← Campaigns
          </Button>
        </div>
      </main>
    );
  }

  const [owner, beneficiaryAddr, targetAmount, milestoneCount, metadataUri] = c!;
  type EscrowTuple = readonly [token: `0x${string}`, milestoneAmounts: readonly bigint[], totalDeposited: bigint, releasedCount: bigint, initialized: boolean];
  const escrow = escrowState as EscrowTuple | undefined;
  const token = escrow?.[0];
  const milestoneAmounts = escrow?.[1];
  const totalDeposited = escrow?.[2];
  const releasedCount = escrow?.[3];
  const initialized = escrow?.[4];
  const indexedDeposited = useMemo(
    () => deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0)),
    [deposits]
  );
  const indexedReleased = useMemo(
    () => releases.reduce((sum, r) => sum + BigInt(r.amount), BigInt(0)),
    [releases]
  );

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const beneficiary = c?.[1]?.toLowerCase();
    if (!supabaseUrl || !anon || !beneficiary) return;
    const headers: HeadersInit = {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    };

    async function loadReputation() {
      setReputationLoaded(false);
      try {
        const repRes = await fetch(
          `${supabaseUrl}/rest/v1/reputation_scores?select=score,attested_count,sybil_verified,last_updated&wallet=eq.${beneficiary}&limit=1`,
          { headers, cache: "no-store" }
        );
        if (!repRes.ok) return;
        const rows = (await repRes.json()) as Array<{
          score: number;
          attested_count: number;
          sybil_verified: boolean;
          last_updated: string;
        }>;
        setBeneficiaryReputation(rows[0] ?? null);
      } finally {
        setReputationLoaded(true);
      }
    }

    void loadReputation();
  }, [c, reputationRefreshNonce]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCampaignShareUrl(`${window.location.origin}/campaigns/${id}`);
  }, [id]);

  useEffect(() => {
    async function loadWorldIdHealth() {
      try {
        const res = await fetch("/api/world-id/health", { cache: "no-store" });
        if (!res.ok) {
          setWorldIdConfigReady(false);
          return;
        }
        const json = (await res.json()) as { ok: boolean; missing?: string[] };
        setWorldIdConfigReady(Boolean(json.ok));
        setWorldIdMissingConfig(json.missing ?? []);
      } catch {
        setWorldIdConfigReady(false);
      }
    }
    void loadWorldIdHealth();
  }, []);
  const xmtpPeerAddress = useMemo(() => {
    if (!address) return beneficiaryAddr;
    return address.toLowerCase() === beneficiaryAddr.toLowerCase()
      ? owner
      : beneficiaryAddr;
  }, [address, beneficiaryAddr, owner]);

  useEffect(() => {
    if (!xmtpReady || !walletClient) return;
    const env = (process.env.NEXT_PUBLIC_XMTP_ENV ?? "dev") as "dev" | "production";
    let cancelled = false;

    async function refreshThread() {
      try {
        const messages = await loadCampaignThreadMessages(
          walletClient,
          env,
          Number(id),
          xmtpPeerAddress
        );
        if (!cancelled) {
          setXmtpMessages(messages);
        }
      } catch (error) {
        if (!cancelled) {
          setXmtpStatus(`XMTP refresh failed: ${(error as Error).message}`);
        }
      }
    }

    void refreshThread();
    const interval = window.setInterval(() => {
      void refreshThread();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [xmtpReady, walletClient, xmtpPeerAddress, id]);

  const panelClass = "app-surface-elev mb-6 rounded-xl p-4";
  const headingClass = "app-text mb-2 font-medium";
  const mutedClass = "app-muted text-sm";
  const labelClass = "app-text block text-sm font-medium";

  return (
    <main className="app-page px-4 py-8 md:px-8">
      <div className="app-surface mx-auto max-w-2xl rounded-2xl p-6 md:p-8">
        <Button as={Link} href="/campaigns" variant="secondary" compact transparent className="mb-4">
          ← Campaigns
        </Button>
        <TextTitle2 as="h1" className="brand-brown mb-2">Campaign #{id}</TextTitle2>
        <TextBody as="p" className="app-muted mb-6">
          Owner: {owner.slice(0, 10)}... · Beneficiary: {beneficiaryAddr.slice(0, 10)}...
        </TextBody>

        <div className={`${panelClass} mb-6`}>
          <p className={mutedClass}>Target</p>
          <p className="text-xl font-medium app-text">{formatUsdc(targetAmount)} USDC</p>
          <p className={`${mutedClass} mt-2`}>Deposited</p>
          <p className="text-lg app-text">{totalDeposited !== undefined ? formatUsdc(totalDeposited) : "—"} USDC</p>
          {metadataUri && (
            <p className={`${mutedClass} mt-2 truncate`}>Metadata: {metadataUri}</p>
          )}
        </div>

        <div className={panelClass}>
          <h2 className={headingClass}>Donation Link & QR</h2>
          <p className={`${mutedClass} mb-3`}>Share this campaign URL to direct donors to the funding flow.</p>
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-[220px] flex-1 break-all border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2 text-xs app-muted">
              {campaignShareUrl || `https://your-domain/campaigns/${id}`}
            </div>
            <Button
              variant="secondary"
              compact
              onClick={async () => {
                if (!campaignShareUrl) return;
                await navigator.clipboard.writeText(campaignShareUrl);
                setShareCopied(true);
                window.setTimeout(() => setShareCopied(false), 1200);
              }}
            >
              {shareCopied ? "Copied" : "Copy link"}
            </Button>
          </div>
          {campaignShareUrl && (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                campaignShareUrl
              )}`}
              alt="Campaign donation QR code"
              className="mt-3 h-[180px] w-[180px] border border-[var(--ui-border)] bg-[var(--ui-bg)] p-1"
            />
          )}
        </div>

        {initialized && milestoneAmounts && (
          <div className="mb-6">
            <h2 className={`${headingClass} mb-2`}>Milestones</h2>
            <ul className="space-y-2">
              {milestoneAmounts.map((amt, i) => (
                <li key={i} className="flex items-center gap-2 app-muted">
                  <span className={Number(releasedCount) > i ? "brand-green" : ""}>
                    {i + 1}. {formatUsdc(amt)} USDC
                    {Number(releasedCount) > i ? " ✓ Released" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!initialized && (
          <div className="callout-amber mb-4">
            <p style={{ color: "var(--ui-brand-amber)" }}>
              Escrow not initialized yet. Campaign owner must initialize on the create page.
            </p>
          </div>
        )}

        <div className={panelClass}>
          <h2 className={headingClass}>Fund Flow (Indexed)</h2>
          {!flowLoaded ? (
            <div className="flex items-center gap-2"><Spinner size={2} accessibilityLabel="Loading flow" /><span className={mutedClass}>Loading indexed flow...</span></div>
          ) : (
            <>
              <p className={mutedClass}>
                Deposited: {formatUsdc(indexedDeposited)} USDC · Released: {formatUsdc(indexedReleased)} USDC
              </p>
              {(deposits.length > 0 || releases.length > 0) ? (
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
                  {deposits.map((d) => (
                    <a
                      key={`dep-${d.tx_hash}`}
                      href={`https://basescan.org/tx/${d.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flow-deposit"
                    >
                      <p className="font-medium app-text">Deposit</p>
                      <p className="app-muted">
                        +{formatUsdc(BigInt(d.amount))} USDC from {d.depositor.slice(0, 10)}...
                      </p>
                    </a>
                  ))}
                  {releases.map((r) => (
                    <a
                      key={`rel-${r.tx_hash}`}
                      href={`https://basescan.org/tx/${r.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flow-release"
                    >
                      <p className="font-medium brand-brown">Milestone Release #{r.milestone_index}</p>
                      <p className="app-muted">
                        -{formatUsdc(BigInt(r.amount))} USDC
                        {r.attestation_uid ? ` · attestation ${r.attestation_uid.slice(0, 10)}...` : ""}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className={`mt-2 ${mutedClass}`}>No indexed events yet. Run the indexer and refresh this page.</p>
              )}
            </>
          )}
        </div>

        <div className={panelClass}>
          <h2 className={headingClass}>Reputation (Sybil-gated)</h2>
          {!reputationLoaded ? (
            <div className="flex items-center gap-2"><Spinner size={2} accessibilityLabel="Loading reputation" /><span className={mutedClass}>Loading reputation...</span></div>
          ) : !beneficiaryReputation ? (
            <div>
              <p className={mutedClass}>No reputation record yet for this beneficiary.</p>
              {isBeneficiary && (
                <Button
                  variant="primary"
                  compact
                  className="mt-3"
                  onClick={handleStartWorldId}
                  disabled={worldIdBusy || worldIdConfigReady === false}
                >
                  {worldIdBusy ? "Preparing..." : "Verify with World ID"}
                </Button>
              )}
            </div>
          ) : beneficiaryReputation.sybil_verified ? (
                <div className="text-sm">
                  <p className="brand-green">Verified by World ID</p>
                  <p className="mt-1 app-text">
                    Reputation: <span className="font-semibold">{beneficiaryReputation.score}</span>{" "}
                    ({beneficiaryReputation.attested_count} attested milestones)
                  </p>
                  <p className={`mt-1 text-xs ${mutedClass}`}>
                    Updated: {new Date(beneficiaryReputation.last_updated).toLocaleString()}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm brand-brown">
                    Beneficiary is not Sybil-verified yet. Reputation is hidden until verification.
                  </p>
                  {isBeneficiary && (
                    <Button
                      variant="primary"
                      compact
                      className="mt-3"
                      onClick={handleStartWorldId}
                      disabled={worldIdBusy || worldIdConfigReady === false}
                    >
                      {worldIdBusy ? "Preparing..." : "Verify with World ID"}
                    </Button>
                  )}
                </div>
              )}
              {worldIdStatus && <p className={`mt-2 text-xs ${mutedClass}`}>{worldIdStatus}</p>}
              {worldIdConfigReady === false && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="callout-amber inline-flex items-center px-2 py-1 text-xs">
                    World ID config incomplete
                  </span>
                  <Link href="/debug/world-id" className="text-xs brand-brown hover:underline">
                    Check config →
                  </Link>
                </div>
              )}
          {worldIdRpContext && process.env.NEXT_PUBLIC_WORLDCOIN_APP_ID && process.env.NEXT_PUBLIC_WORLDCOIN_ACTION && (
            <IDKitRequestWidget
              open={worldIdOpen}
              onOpenChange={setWorldIdOpen}
              app_id={process.env.NEXT_PUBLIC_WORLDCOIN_APP_ID as `app_${string}`}
              action={process.env.NEXT_PUBLIC_WORLDCOIN_ACTION}
              rp_context={worldIdRpContext}
              allow_legacy_proofs={true}
              preset={orbLegacy({ signal: (address ?? "").toLowerCase() })}
              handleVerify={handleVerifyWorldId}
              onSuccess={handleWorldIdSuccess}
              onError={(errorCode) => setWorldIdStatus(`World ID error: ${errorCode}`)}
            />
          )}
        </div>

        <div className={panelClass}>
          <h2 className={headingClass}>Impact Feed (Arweave)</h2>
          <p className={`${mutedClass} mb-3`}>
            Post proof/updates for this campaign. Entries are uploaded to Arweave and
            indexed in Supabase.
          </p>
          {isConnected && (
            <div className="mb-4 space-y-2">
              <textarea
                value={impactBody}
                onChange={(e) => setImpactBody(e.target.value)}
                rows={3}
                placeholder="What progress happened? What evidence did you gather?"
                className="w-full border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-brown)] focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <input
                  type="number"
                  min="0"
                  value={impactMilestone}
                  onChange={(e) => setImpactMilestone(e.target.value)}
                  placeholder="Milestone index (optional)"
                  className="w-64 border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-brown)] focus:outline-none"
                />
                <input
                  type="text"
                  value={impactTxHash}
                  onChange={(e) => setImpactTxHash(e.target.value)}
                  placeholder="Linked tx hash (optional 0x...)"
                  className="min-w-[280px] flex-1 border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-brown)] focus:outline-none"
                />
                <input
                  type="file"
                  onChange={(e) => setImpactFile(e.target.files?.[0] ?? null)}
                  className="input-field max-w-xs text-sm file:mr-3 file:border-0 file:bg-[var(--ui-brand-brown)] file:px-3 file:py-1 file:font-medium file:text-[var(--ui-brand-brown-soft)]"
                />
                <Button
                  variant="primary"
                  compact
                  onClick={handlePostImpact}
                  disabled={impactSubmitting}
                  loading={impactSubmitting}
                >
                  {impactSubmitting ? "Publishing..." : "Publish impact post"}
                </Button>
              </div>
            </div>
          )}

          {impactPosts.length === 0 ? (
            <p className={`text-sm ${mutedClass}`}>No impact posts yet.</p>
          ) : (
            <div className="space-y-2">
              {impactPosts.map((p) => (
                <div key={p.id} className="border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
                  <p className="text-sm text-[var(--ui-text)]">{p.body}</p>
                  <p className={`mt-1 text-xs ${mutedClass}`}>
                    {new Date(p.created_at).toLocaleString()} · by{" "}
                    <span className="font-mono">{p.author_wallet.slice(0, 10)}...</span>
                    {p.milestone_index !== null ? ` · milestone #${p.milestone_index}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    <a
                      href={p.arweave_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="brand-brown hover:underline"
                    >
                      Arweave: {p.arweave_tx_id.slice(0, 10)}...
                    </a>
                    {p.attachment_url && (
                      <a
                        href={p.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="app-text hover:underline"
                      >
                        Attachment
                        {p.attachment_name ? `: ${p.attachment_name}` : ""}
                      </a>
                    )}
                    {p.tx_hash_link && (
                      <a
                        href={`https://basescan.org/tx/${p.tx_hash_link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="brand-brown hover:underline"
                      >
                        Linked tx
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={panelClass}>
          <h2 className={headingClass}>Messages (XMTP)</h2>
          <p className={`${mutedClass} mb-3`}>
            Wallet-to-wallet campaign messaging. In-app polling only (no push).
          </p>
          <p className={`mb-3 text-xs ${mutedClass}`}>
            Thread peer: {xmtpPeerAddress.slice(0, 10)}...
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              compact
              onClick={handleInitXmtp}
              disabled={!isConnected || xmtpBusy}
              loading={xmtpBusy}
            >
              {xmtpBusy ? "Working..." : "Initialize XMTP"}
            </Button>
            <p className={`text-sm ${xmtpReady ? "brand-green" : mutedClass}`}>
              {xmtpStatus}
            </p>
          </div>

          <div className="space-y-2">
            <textarea
              value={xmtpDraft}
              onChange={(e) => setXmtpDraft(e.target.value)}
              rows={2}
              placeholder="Write a campaign message..."
              className="w-full border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-brown)] focus:outline-none"
            />
            <Button
              variant="secondary"
              compact
              onClick={handleSendXmtpDraft}
              disabled={!xmtpReady || !xmtpDraft.trim() || xmtpBusy}
            >
              Send message
            </Button>
          </div>

          {xmtpMessages.length > 0 ? (
            <div className="mt-3 space-y-2">
              {xmtpMessages.map((m) => (
                <div key={m.id} className="border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2">
                  <p className="text-sm text-[var(--ui-text)]">{m.text}</p>
                  <p className={`mt-1 text-xs ${mutedClass}`}>
                    {new Date(m.sentAt).toLocaleString()} ·{" "}
                    {xmtpInboxId && m.senderInboxId === xmtpInboxId
                      ? "you"
                      : `${m.senderInboxId.slice(0, 10)}...`}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className={`mt-3 text-sm ${mutedClass}`}>No messages yet in this campaign thread.</p>
          )}
        </div>

        {isConnected && initialized && (
          <div className="space-y-6">
            <div>
              <label className={`${labelClass} mb-1`}>Fund (USDC)</label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="min-w-[120px] flex-1 border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-brown)] focus:outline-none"
                  placeholder="Amount"
                />
                {!approveConfirmed ? (
                  <Button
                    variant="primary"
                    compact
                    onClick={handleApprove}
                    disabled={!fundAmount || isPendingApprove || isConfirmingApprove}
                    loading={isPendingApprove || isConfirmingApprove}
                  >
                    {isPendingApprove || isConfirmingApprove ? "Approve..." : "Approve USDC"}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    compact
                    onClick={handleDeposit}
                    disabled={!fundAmount || isPendingDeposit || isConfirmingDeposit}
                    loading={isPendingDeposit || isConfirmingDeposit}
                  >
                    {isPendingDeposit || isConfirmingDeposit ? "Deposit..." : "Deposit"}
                  </Button>
                )}
              </div>
            </div>

            {(isOwner || isBeneficiary) &&
              milestoneAmounts &&
              Number(releasedCount) < milestoneAmounts.length && (
                <div className="callout-amber">
                  <h3 className="mb-2 font-medium app-text">Release milestone (requires EAS attestation)</h3>
                  <input
                    type="text"
                    value={releaseMilestoneIndex}
                    onChange={(e) => setReleaseMilestoneIndex(e.target.value)}
                    className="mb-2 w-full border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-brown)] focus:outline-none"
                    placeholder="Milestone index (0-based)"
                  />
                  <input
                    type="text"
                    value={attestationUid}
                    onChange={(e) => setAttestationUid(e.target.value)}
                    className="mb-2 w-full border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 font-mono text-sm app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-brown)] focus:outline-none"
                    placeholder="Attestation UID (0x...)"
                  />
                  <Button
                    variant="primary"
                    compact
                    onClick={handleRelease}
                    disabled={
                      releaseMilestoneIndex === "" ||
                      !attestationUid ||
                      isPendingRelease ||
                      isConfirmingRelease
                    }
                    loading={isPendingRelease || isConfirmingRelease}
                  >
                    {isPendingRelease || isConfirmingRelease ? "Releasing..." : "Release milestone"}
                  </Button>
                </div>
              )}
          </div>
        )}

        {txDeposit && (
          <p className={`mt-4 text-sm ${mutedClass}`}>
            Deposit tx:{" "}
            <a
              href={`https://basescan.org/tx/${txDeposit}`}
              target="_blank"
              rel="noopener noreferrer"
              className="brand-brown hover:underline"
            >
              View on BaseScan
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
