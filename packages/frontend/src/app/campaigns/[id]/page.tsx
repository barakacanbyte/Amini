"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  useReadContract,
  useWalletClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useAminiSigning } from "@/context/AminiSigningContext";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { TextHeadline } from "@coinbase/cds-web/typography/TextHeadline";
import { Tag } from "@coinbase/cds-web/tag/Tag";
import { Spinner } from "@coinbase/cds-web/loaders/Spinner";
import {
  config,
  campaignRegistryAbi,
  milestoneEscrowAbi,
  formatUsdc,
  parseUsdc,
} from "@/lib/contracts";
import { BASE_SEPOLIA_CHAIN_ID } from "@amini/shared";
import type { DonorListItem } from "@/lib/organizationTypes";
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
import { CampaignMessagesBubble } from "@/components/CampaignMessagesBubble";

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

const TX_EXPLORER_BASE =
  config.chainId === BASE_SEPOLIA_CHAIN_ID
    ? "https://sepolia.basescan.org/tx/"
    : "https://basescan.org/tx/";
const EAS_SCAN_BASE =
  config.chainId === BASE_SEPOLIA_CHAIN_ID
    ? "https://base-sepolia.easscan.org/attestation/view/"
    : "https://base.easscan.org/attestation/view/";

type CampaignFromApi = {
  id: number;
  /** On-chain campaign id matches this row’s `id` (indexer). */
  chain_id?: number | null;
  owner?: string | null;
  beneficiary?: string | null;
  /** USDC 6-decimal raw amount as string (matches indexer). */
  target_amount?: string | number | null;
  milestone_count?: number | null;
  metadata_uri?: string | null;
  title?: string | null;
  description?: string | null;
  image_url?: string | null;
  region?: string | null;
  cause?: string | null;
  deadline?: string | null;
  contact_email?: string | null;
  beneficiary_description?: string | null;
  tags?: string[] | null;
  milestone_data?: unknown;
  social_links?: unknown;
  impact_metrics?: unknown;
  status?: string | null;
  organization_id?: string | null;
};

type OrganizationFromApi = {
  id: string;
  name: string;
  description?: string | null;
  website_url?: string | null;
  country?: string | null;
  status?: string;
  logo_url?: string | null;
  verified_at?: string | null;
  official_email?: string | null;
  twitter_handle?: string | null;
  linkedin_url?: string | null;
};

type ImpactMetricRow = { name?: string; target?: string; timeframe?: string };

function parseSocialLinks(raw: unknown): Array<{ label: string; url: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; url: string }> = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "url" in item) {
      const url = String((item as { url?: string }).url ?? "").trim();
      const label = String((item as { label?: string }).label ?? "").trim() || "Link";
      if (url) out.push({ label, url });
    }
  }
  return out;
}

function parseTargetAmountFromDb(raw: string | number | null | undefined): bigint {
  if (raw == null) return BigInt(0);
  const s = String(raw).replace(/,/g, "").trim();
  if (!s) return BigInt(0);
  const whole = s.split(".")[0] ?? "0";
  if (!/^-?\d+$/.test(whole)) return BigInt(0);
  return BigInt(whole);
}

function isHexAddress(v: string | null | undefined): v is `0x${string}` {
  return typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function hintForMessagingInitFailure(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("user rejected")
  ) {
    return "Signature cancelled. Approve the request in your wallet to enable chat.";
  }
  if (lower.includes("no wallet") || lower.includes("account")) {
    return "Connect your wallet and try again.";
  }
  return "Could not start chat. Try again in a moment.";
}

function hintForMessagingSendFailure(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("user rejected")
  ) {
    return "Signature cancelled.";
  }
  return "Could not send your message. Try again.";
}

type CampaignCommentRow = {
  id: number;
  parent_id: number | null;
  author_wallet: string;
  body: string;
  created_at: string;
};

function buildCommentThreads(comments: CampaignCommentRow[]) {
  const byParent = new Map<number | null, CampaignCommentRow[]>();
  for (const row of comments) {
    const p = row.parent_id ?? null;
    const list = byParent.get(p) ?? [];
    list.push(row);
    byParent.set(p, list);
  }
  const roots = byParent.get(null) ?? [];
  roots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return roots.map((root) => {
    const replies = (byParent.get(root.id) ?? []).slice();
    replies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return { root, replies };
  });
}

function parseMilestoneData(raw: unknown): Array<{ title?: string; description?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => {
    if (!m || typeof m !== "object") return {};
    const o = m as Record<string, unknown>;
    return {
      title: typeof o.title === "string" ? o.title : undefined,
      description: typeof o.description === "string" ? o.description : undefined,
    };
  });
}

function parseImpactMetrics(raw: unknown): ImpactMetricRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const o = m as Record<string, unknown>;
      return {
        name: typeof o.name === "string" ? o.name : undefined,
        target: typeof o.target === "string" ? o.target : undefined,
        timeframe: typeof o.timeframe === "string" ? o.timeframe : undefined,
      };
    })
    .filter(Boolean) as ImpactMetricRow[];
}

export default function CampaignPage() {
  const params = useParams();
  const id = params.id as string;
  const campaignId = BigInt(id);
  const { address, isConnected, signMessageAsync, getCdpAccessToken } =
    useAminiSigning();
  const { data: walletClient } = useWalletClient();

  const registryAddress = config.campaignRegistry;
  const escrowAddress = config.escrow;
  const contractsConfigured = Boolean(
    registryAddress &&
      escrowAddress &&
      registryAddress.startsWith("0x") &&
      escrowAddress.startsWith("0x"),
  );

  const { data: campaign, isLoading: loadingCampaign } = useReadContract({
    address: registryAddress ?? "0x0000000000000000000000000000000000000000",
    abi: campaignRegistryAbi,
    functionName: "getCampaign",
    args: [campaignId],
    chainId: config.chainId,
    query: { enabled: contractsConfigured },
  });

  const { data: escrowState } = useReadContract({
    address: escrowAddress ?? "0x0000000000000000000000000000000000000000",
    abi: milestoneEscrowAbi,
    functionName: "getEscrowState",
    args: [campaignId],
    chainId: config.chainId,
    query: { enabled: contractsConfigured },
  });

  const [fundAmount, setFundAmount] = useState("");
  const [fundMilestoneIndex, setFundMilestoneIndex] = useState<string>("general");
  const [fundAnonymous, setFundAnonymous] = useState(false);
  const [fundMessage, setFundMessage] = useState("");
  const [donorProfileName, setDonorProfileName] = useState<string | null>(null);
  const [donorProfileAvatar, setDonorProfileAvatar] = useState<string | null>(null);
  const [depositSuccessBanner, setDepositSuccessBanner] = useState(false);
  const [proofMilestoneIndex, setProofMilestoneIndex] = useState<number | null>(null);
  const [proofTitle, setProofTitle] = useState("");
  const [proofDescription, setProofDescription] = useState("");
  const [proofFiles, setProofFiles] = useState<FileList | null>(null);
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofSuccessBanner, setProofSuccessBanner] = useState(false);
  const [milestoneProofs, setMilestoneProofs] = useState<
    Array<{
      id: number;
      milestone_index: number;
      title: string;
      description: string;
      evidence_urls: string[];
      ipfs_url?: string | null;
      status: string;
      reviewer_notes?: string;
      attestation_uid?: string | null;
      created_at: string;
    }>
  >([]);
  const [releaseMilestoneIndex, setReleaseMilestoneIndex] = useState("");
  const [attestationUid, setAttestationUid] = useState("");
  const [deposits, setDeposits] = useState<
    Array<{ tx_hash: string; depositor: string; amount: string; milestone_index: number | null; block_number: number; created_at: string }>
  >([]);
  const [donors, setDonors] = useState<DonorListItem[]>([]);
  const [releases, setReleases] = useState<
    Array<{ tx_hash: string; milestone_index: number; amount: string; attestation_uid: string | null; block_number: number; created_at: string }>
  >([]);
  const [impactPosts, setImpactPosts] = useState<
    Array<{
      id: number;
      milestone_index: number | null;
      author_wallet: string;
      body: string;
      ipfs_cid: string;
      ipfs_url: string;
      attachment_cid: string | null;
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
  const [xmtpStatus, setXmtpStatus] = useState<string>("");
  const [xmtpReady, setXmtpReady] = useState(false);
  const [xmtpDraft, setXmtpDraft] = useState("");
  const [xmtpInboxId, setXmtpInboxId] = useState<string | null>(null);
  const [xmtpBusy, setXmtpBusy] = useState(false);
  const [xmtpMessages, setXmtpMessages] = useState<
    Array<{ id: string; senderInboxId: string; text: string; sentAt: string }>
  >([]);
  const [xmtpPanelOpen, setXmtpPanelOpen] = useState(false);
  const [comments, setComments] = useState<CampaignCommentRow[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [dbCampaign, setDbCampaign] = useState<CampaignFromApi | null>(null);
  const [dbOrganization, setDbOrganization] = useState<OrganizationFromApi | null>(null);
  const { writeContract: writeApprove, data: txApprove, isPending: isPendingApprove } = useWriteContract();
  const { isLoading: isConfirmingApprove } = useWaitForTransactionReceipt({ hash: txApprove });
  const { writeContract: writeDeposit, data: txDeposit, isPending: isPendingDeposit } = useWriteContract();
  const { isLoading: isConfirmingDeposit, isSuccess: depositConfirmed } = useWaitForTransactionReceipt({ hash: txDeposit });
  const { writeContract: writeRelease, data: txRelease, isPending: isPendingRelease } = useWriteContract();
  const { isLoading: isConfirmingRelease } = useWaitForTransactionReceipt({ hash: txRelease });

  type CampaignTuple = readonly [owner: `0x${string}`, beneficiary: `0x${string}`, targetAmount: bigint, milestoneCount: number, metadataUri: string, exists: boolean];
  const c = campaign as CampaignTuple | undefined;
  const ownerAddr = c?.[0];
  const beneficiaryAddrOnChain = c?.[1];
  const dbOwner = dbCampaign?.owner;
  const dbBeneficiary = dbCampaign?.beneficiary;
  const isOwner = Boolean(
    address &&
      ((ownerAddr && ownerAddr.toLowerCase() === address.toLowerCase()) ||
        (isHexAddress(dbOwner) && dbOwner.toLowerCase() === address.toLowerCase())),
  );
  const isBeneficiary = Boolean(
    address &&
      ((beneficiaryAddrOnChain &&
        beneficiaryAddrOnChain.toLowerCase() === address.toLowerCase()) ||
        (isHexAddress(dbBeneficiary) && dbBeneficiary.toLowerCase() === address.toLowerCase())),
  );
  const approveConfirmed = txApprove && !isConfirmingApprove;

  const xmtpPeerAddress = useMemo(() => {
    if (c && c[5] && c[0] && c[1]) {
      const [oa, ba] = c;
      if (!address) return ba;
      return address.toLowerCase() === ba.toLowerCase() ? oa : ba;
    }
    const o = dbCampaign?.owner;
    const b = dbCampaign?.beneficiary;
    if (isHexAddress(o) && isHexAddress(b)) {
      if (!address) return b;
      return address.toLowerCase() === b.toLowerCase() ? o : b;
    }
    return ZERO_ADDRESS;
  }, [address, c, dbCampaign?.owner, dbCampaign?.beneficiary]);

  const messagingInitPromiseRef = useRef<Promise<boolean> | null>(null);

  const ensureMessagingClient = useCallback(async (): Promise<boolean> => {
    if (xmtpReady) return true;
    if (!walletClient?.account?.address) return false;
    if (messagingInitPromiseRef.current) {
      return messagingInitPromiseRef.current;
    }
    const wc = walletClient;
    const env = (process.env.NEXT_PUBLIC_XMTP_ENV ?? "dev") as "dev" | "production";
    const p = (async () => {
      const result = await initXmtpClient(wc, env);
      setXmtpReady(result.ok);
      setXmtpInboxId(result.inboxId ?? null);
      if (!result.ok) {
        setXmtpStatus(hintForMessagingInitFailure(result.message));
      } else {
        setXmtpStatus("");
      }
      return result.ok;
    })().finally(() => {
      messagingInitPromiseRef.current = null;
    });
    messagingInitPromiseRef.current = p;
    return p;
  }, [walletClient, xmtpReady]);

  const getXmtpBindingAuth = useCallback(async () => {
    if (!address) return null;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `Amini Verification\nAction: Register XMTP Thread Binding\nWallet: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;
    const cdpToken = await getCdpAccessToken();
    let signature = "";
    if (!cdpToken) {
      try {
        signature = await signMessageAsync({ message });
      } catch {
        return null;
      }
    } else {
      try {
        signature = await signMessageAsync({ message });
      } catch {
        /* CDP may still verify via token */
      }
    }
    return {
      viewerWallet: address,
      signature: signature || undefined,
      signatureTimestamp: timestamp,
      cdpAccessToken: cdpToken ?? undefined,
    };
  }, [address, getCdpAccessToken, signMessageAsync]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadIndexedAndMeta() {
      try {
        const res = await fetch(`/api/campaigns/${id}`, { cache: "no-store" });
        const json = (await res.json()) as {
          ok: boolean;
          campaign?: CampaignFromApi | null;
          organization?: OrganizationFromApi | null;
          deposits?: Array<{
            tx_hash: string;
            depositor: string;
            amount: string;
            milestone_index: number | null;
            block_number: number;
            created_at: string;
          }>;
          releases?: Array<{
            tx_hash: string;
            milestone_index: number;
            amount: string;
            attestation_uid: string | null;
            block_number: number;
            created_at: string;
          }>;
          donors?: DonorListItem[];
          impactPosts?: Array<{
            id: number;
            milestone_index: number | null;
            author_wallet: string;
            body: string;
            ipfs_cid: string;
            ipfs_url: string;
            attachment_cid: string | null;
            attachment_url: string | null;
            attachment_name: string | null;
            attachment_content_type: string | null;
            tx_hash_link: string | null;
            created_at: string;
          }>;
          comments?: Array<{
            id: number;
            parent_id?: number | null;
            author_wallet: string;
            body: string;
            created_at: string;
          }>;
        };
        if (cancelled) return;
        if (json.ok) {
          setDbCampaign(json.campaign ?? null);
          setDbOrganization(json.organization ?? null);
          if (Array.isArray(json.deposits)) setDeposits(json.deposits);
          if (Array.isArray(json.releases)) setReleases(json.releases);
          if (Array.isArray(json.donors)) setDonors(json.donors);
          if (Array.isArray(json.impactPosts)) setImpactPosts(json.impactPosts);
          if (Array.isArray(json.comments)) {
            setComments(
              json.comments.map((c) => ({
                id: c.id,
                parent_id: c.parent_id ?? null,
                author_wallet: c.author_wallet,
                body: c.body,
                created_at: c.created_at,
              })),
            );
          }
        }
      } finally {
        if (!cancelled) setFlowLoaded(true);
      }
    }

    void loadIndexedAndMeta();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${id}/milestone-proofs`, { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; proofs?: typeof milestoneProofs };
        if (!cancelled && json.ok && Array.isArray(json.proofs)) {
          setMilestoneProofs(json.proofs);
        }
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleSubmitProof = async (milestoneIdx: number) => {
    if (!address) { alert("Connect wallet first."); return; }
    if (!proofTitle.trim()) { alert("Title is required."); return; }
    if (!proofDescription.trim()) { alert("Description is required."); return; }

    setProofSubmitting(true);
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const message = `Amini Verification\nAction: Submit Milestone Proof\nWallet: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;
      const cdpToken = await getCdpAccessToken();
      let signature = "";
      if (!cdpToken) {
        try { signature = await signMessageAsync({ message }); } catch {
          alert("Signature rejected.");
          setProofSubmitting(false);
          return;
        }
      } else {
        try { signature = await signMessageAsync({ message }); } catch { /* CDP may verify via token */ }
      }

      const form = new FormData();
      form.append("submitterWallet", address);
      form.append("milestoneIndex", String(milestoneIdx));
      form.append("title", proofTitle.trim());
      form.append("description", proofDescription.trim());
      if (signature) { form.append("signature", signature); form.append("signatureTimestamp", timestamp); }
      if (cdpToken) form.append("cdpAccessToken", cdpToken);
      if (proofFiles) {
        for (let i = 0; i < proofFiles.length; i++) {
          form.append("file", proofFiles[i]);
        }
      }

      const res = await fetch(`/api/campaigns/${id}/milestone-proofs`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { ok: boolean; message?: string; proof?: (typeof milestoneProofs)[0] };
      if (!res.ok || !json.ok) throw new Error(json.message ?? "Failed to submit proof.");

      if (json.proof) {
        setMilestoneProofs((prev) => [...prev, json.proof!]);
      }
      setProofTitle("");
      setProofDescription("");
      setProofFiles(null);
      setProofMilestoneIndex(null);
      setProofSuccessBanner(true);
      setTimeout(() => setProofSuccessBanner(false), 6000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setProofSubmitting(false);
    }
  };

  const commentThreads = useMemo(() => buildCommentThreads(comments), [comments]);
  const replyTarget =
    replyToId != null ? comments.find((c) => c.id === replyToId) ?? null : null;

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

  const NO_MILESTONE_PREFERENCE = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

  const handleDeposit = () => {
    if (!escrowAddress || !fundAmount) return;
    const amountWei = parseUsdc(fundAmount);
    if (amountWei <= BigInt(0)) return;
    const milestoneArg = fundMilestoneIndex === "general"
      ? NO_MILESTONE_PREFERENCE
      : BigInt(fundMilestoneIndex);
    writeDeposit({
      address: escrowAddress,
      abi: milestoneEscrowAbi,
      functionName: "deposit",
      args: [campaignId, milestoneArg, amountWei],
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
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const message = `Amini Verification\nAction: Post Impact Update\nWallet: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;

      const cdpToken = await getCdpAccessToken();
      let signature = "";
      if (!cdpToken) {
        try {
          signature = await signMessageAsync({ message });
        } catch {
          alert("Signature rejected. You must sign to post an update.");
          setImpactSubmitting(false);
          return;
        }
      } else {
        try {
          signature = await signMessageAsync({ message });
        } catch {
          /* optional fallback when server uses CDP token only */
        }
      }

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
      if (cdpToken) {
        form.append("cdpAccessToken", cdpToken);
      }
      if (signature) {
        form.append("signature", signature);
        form.append("signatureTimestamp", timestamp);
      }
      
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
        ipfsCid?: string;
        ipfsUrl?: string;
        attachmentCid?: string | null;
        attachmentUrl?: string | null;
        attachmentName?: string | null;
        attachmentContentType?: string | null;
      };
      if (!res.ok || !json.ok || !json.ipfsCid || !json.ipfsUrl) {
        throw new Error(json.message ?? "Failed to publish impact post.");
      }
      const ipfsCid = json.ipfsCid;
      const ipfsUrl = json.ipfsUrl;

      setImpactPosts((prev) => [
        {
          id: Date.now(),
          milestone_index:
            impactMilestone.trim() === "" ? null : Number(impactMilestone.trim()),
          author_wallet: address.toLowerCase(),
          body: impactBody.trim(),
          ipfs_cid: ipfsCid,
          ipfs_url: ipfsUrl,
          attachment_cid: json.attachmentCid ?? null,
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

  const handlePostComment = async () => {
    if (!address) {
      alert("Connect wallet first.");
      return;
    }
    const text = commentBody.trim();
    if (!text) {
      alert("Write a comment.");
      return;
    }

    setCommentSubmitting(true);
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const message = `Amini Verification\nAction: Post Campaign Comment\nWallet: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;

      const cdpToken = await getCdpAccessToken();
      let signature = "";
      if (!cdpToken) {
        try {
          signature = await signMessageAsync({ message });
        } catch {
          alert("Signature rejected.");
          setCommentSubmitting(false);
          return;
        }
      } else {
        try {
          signature = await signMessageAsync({ message });
        } catch {
          /* CDP may still verify via token */
        }
      }

      const res = await fetch(`/api/campaigns/${id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          authorWallet: address,
          body: text,
          parentId: replyToId ?? undefined,
          signature: signature || undefined,
          signatureTimestamp: timestamp,
          cdpAccessToken: cdpToken ?? undefined,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        comment?: CampaignCommentRow;
      };
      if (!res.ok || !json.ok || !json.comment) {
        throw new Error(json.message ?? "Failed to post comment.");
      }
      const posted = json.comment;
      setComments((prev) =>
        posted.parent_id != null ? [...prev, posted] : [posted, ...prev],
      );
      setCommentBody("");
      setReplyToId(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleSendXmtpDraft = async () => {
    if (!walletClient || !xmtpDraft.trim()) return;
    if (xmtpPeerAddress === ZERO_ADDRESS) return;
    const env = (process.env.NEXT_PUBLIC_XMTP_ENV ?? "dev") as "dev" | "production";

    setXmtpBusy(true);
    setXmtpStatus("");
    try {
      const ok = await ensureMessagingClient();
      if (!ok) return;

      const messages = await sendCampaignThreadMessage(
        walletClient,
        env,
        Number(id),
        xmtpPeerAddress,
        xmtpDraft,
        getXmtpBindingAuth
      );
      setXmtpMessages(messages);
      setXmtpDraft("");
      setXmtpStatus("");
    } catch (error) {
      setXmtpStatus(hintForMessagingSendFailure((error as Error).message));
    } finally {
      setXmtpBusy(false);
    }
  };

  const handleStartWorldId = async () => {
    if (!address || !c?.[1]) return;
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

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/profiles/${address}`, { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; profile?: { name?: string | null; avatar_url?: string | null } | null };
        if (!cancelled && json.ok && json.profile) {
          setDonorProfileName(json.profile.name?.trim() || null);
          setDonorProfileAvatar(json.profile.avatar_url?.trim() || null);
        }
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, [address]);

  const depositPrefSavedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!depositConfirmed || !txDeposit || !address) return;
    if (depositPrefSavedRef.current === txDeposit) return;
    depositPrefSavedRef.current = txDeposit;

    (async () => {
      try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const message = `Amini Verification\nAction: Save Donation Preference\nWallet: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;
        const cdpToken = await getCdpAccessToken();
        let signature = "";
        if (!cdpToken) {
          try { signature = await signMessageAsync({ message }); } catch { return; }
        } else {
          try { signature = await signMessageAsync({ message }); } catch { /* CDP may verify via token */ }
        }
        await fetch("/api/donations/preferences", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            txHash: txDeposit,
            donorWallet: address,
            isAnonymous: fundAnonymous,
            donorMessage: fundMessage.trim() || undefined,
            signature: signature || undefined,
            signatureTimestamp: timestamp,
            cdpAccessToken: cdpToken ?? undefined,
          }),
        });
        setDepositSuccessBanner(true);
        setTimeout(() => setDepositSuccessBanner(false), 8000);
      } catch {
        setDepositSuccessBanner(true);
        setTimeout(() => setDepositSuccessBanner(false), 8000);
      }
    })();
  }, [depositConfirmed, txDeposit, address, fundAnonymous, fundMessage, getCdpAccessToken, signMessageAsync]);

  const indexedDeposited = useMemo(
    () => deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0)),
    [deposits],
  );
  const indexedReleased = useMemo(
    () => releases.reduce((sum, r) => sum + BigInt(r.amount), BigInt(0)),
    [releases],
  );

  const beneficiaryForReputation =
    (typeof c?.[1] === "string" && isHexAddress(c[1]) ? c[1] : null) ??
    (isHexAddress(dbBeneficiary ?? undefined) ? dbBeneficiary! : null);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const beneficiary = beneficiaryForReputation?.toLowerCase();
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
          { headers, cache: "no-store" },
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
  }, [beneficiaryForReputation, reputationRefreshNonce]);

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
          xmtpPeerAddress,
          getXmtpBindingAuth,
        );
        if (!cancelled) {
          setXmtpMessages(messages);
        }
      } catch {
        /* refresh is best-effort; avoid noisy status while polling */
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
  }, [xmtpReady, walletClient, xmtpPeerAddress, id, getXmtpBindingAuth]);

  const waitingOnChain = contractsConfigured && loadingCampaign;
  const waitingOnMeta = !flowLoaded;
  if (waitingOnChain || waitingOnMeta) {
    return (
      <main className="app-page px-3 py-6 sm:px-4 sm:py-8 md:px-8">
        <div className="app-surface mx-auto max-w-2xl rounded-2xl p-5 sm:p-6 md:p-8">
          <div className="flex items-center gap-3">
            <Spinner size={3} accessibilityLabel="Loading campaign" />
            <TextBody as="p" className="app-muted">Loading campaign...</TextBody>
          </div>
          <Button as={Link} href="/campaigns" variant="secondary" compact transparent className="mt-4">
            Back to campaigns
          </Button>
        </div>
      </main>
    );
  }

  const onChainOk = contractsConfigured && Boolean(c && c[5]);
  if (!dbCampaign && !onChainOk) {
    return (
      <main className="app-page px-3 py-6 sm:px-4 sm:py-8 md:px-8">
        <div className="app-surface mx-auto max-w-2xl rounded-2xl p-5 sm:p-6 md:p-8">
          {!contractsConfigured ? (
            <>
              <Tag colorScheme="yellow" emphasis="high">Chain contracts not configured</Tag>
              <TextBody as="p" className="app-muted mt-3 text-sm">
                Set <code className="text-xs">NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS</code> and{" "}
                <code className="text-xs">NEXT_PUBLIC_ESCROW_ADDRESS</code> in your environment, or ensure the
                campaign exists in the index (Supabase) to view indexed metadata only.
              </TextBody>
            </>
          ) : (
            <>
              <Tag colorScheme="yellow" emphasis="high">Campaign not found</Tag>
              <TextBody as="p" className="app-muted mt-3 text-sm">
                No indexed row for this id and the registry does not report it on the configured chain. Check{" "}
                <code className="text-xs">NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS</code>, RPC, and that the campaign id
                matches on-chain <code className="text-xs">campaigns.id</code> in Supabase.
              </TextBody>
            </>
          )}
          <Button as={Link} href="/campaigns" variant="secondary" compact transparent className="mt-4">
            Back to campaigns
          </Button>
        </div>
      </main>
    );
  }

  type EscrowTuple = readonly [token: `0x${string}`, milestoneAmounts: readonly bigint[], totalDeposited: bigint, releasedCount: bigint, initialized: boolean];
  const escrow = escrowState as EscrowTuple | undefined;
  const milestoneAmounts = onChainOk ? escrow?.[1] : undefined;
  const totalDeposited = onChainOk ? escrow?.[2] : undefined;
  const releasedCount = onChainOk ? escrow?.[3] : undefined;
  const initialized = onChainOk ? Boolean(escrow?.[4]) : false;

  const chainTuple = onChainOk ? (c as CampaignTuple) : null;
  const displayOwner =
    chainTuple?.[0] ??
    (isHexAddress(dbCampaign?.owner ?? undefined) ? (dbCampaign!.owner as `0x${string}`) : null);
  const displayBeneficiary =
    chainTuple?.[1] ??
    (isHexAddress(dbCampaign?.beneficiary ?? undefined)
      ? (dbCampaign!.beneficiary as `0x${string}`)
      : null);
  const targetAmount = chainTuple?.[2] ?? parseTargetAmountFromDb(dbCampaign?.target_amount);
  const metadataUri =
    (chainTuple?.[4] as string | undefined) ?? dbCampaign?.metadata_uri?.trim() ?? "";
  const dbChainId = dbCampaign?.chain_id;
  const chainMismatch =
    dbChainId != null && Number(dbChainId) !== Number(config.chainId);

  const fundedForProgress =
    onChainOk && totalDeposited !== undefined ? totalDeposited : indexedDeposited;
  const fundingProgressPercent =
    targetAmount > 0n
      ? Math.min(100, Math.round((Number(fundedForProgress) / Number(targetAmount)) * 100))
      : 0;

  const sectionCard =
    "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5 shadow-[var(--ui-shadow-md)] md:p-6";
  const sectionEyebrow =
    "mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ui-brand-green-strong)]";
  const mutedClass = "app-muted text-sm";
  const labelClass = "app-text block text-sm font-medium";

  const displayTitle = dbCampaign?.title?.trim() || `Campaign #${id}`;
  const heroImageUrl = dbCampaign?.image_url?.trim() ?? "";
  const socials = parseSocialLinks(dbCampaign?.social_links);
  const impactMetricRows = parseImpactMetrics(dbCampaign?.impact_metrics);

  return (
    <main className="app-page px-3 pb-12 pt-4 sm:px-4 sm:pb-16 sm:pt-6 md:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <Button as={Link} href="/campaigns" variant="secondary" compact transparent>
            ← Campaigns
          </Button>
          <span className="text-[var(--ui-muted)]" aria-hidden>
            /
          </span>
          <span className="min-w-0 max-w-[min(100%,20rem)] truncate font-medium text-[var(--ui-text)]">
            {displayTitle}
          </span>
        </header>

        <div className="mb-6 space-y-3">
          {!onChainOk && dbCampaign ? (
            <div
              className="rounded-xl border border-amber-500/40 bg-[color-mix(in_oklab,var(--ui-brand-amber)_14%,var(--ui-surface-elev))] px-4 py-3 text-sm text-[var(--ui-text)]"
              role="status"
            >
              <p className="font-semibold text-[var(--ui-text)]">On-chain data unavailable</p>
              <p className={`${mutedClass} mt-1 leading-relaxed`}>
                Showing the Supabase-indexed campaign. The registry did not return this id (check{" "}
                <code className="rounded bg-[var(--ui-surface)] px-1 text-xs">NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS</code>
                , RPC, or chain). Approve, deposit, and release stay disabled until contracts match this network.
              </p>
            </div>
          ) : null}

          {chainMismatch ? (
            <div
              className="rounded-xl border border-amber-500/40 bg-[color-mix(in_oklab,var(--ui-brand-amber)_14%,var(--ui-surface-elev))] px-4 py-3 text-sm text-[var(--ui-text)]"
              role="status"
            >
              <p className="font-semibold text-[var(--ui-text)]">Chain mismatch</p>
              <p className={`${mutedClass} mt-1`}>
                Indexer recorded chain id <strong>{dbChainId}</strong>; this app uses{" "}
                <strong>{config.chainId}</strong> (Base Sepolia = {BASE_SEPOLIA_CHAIN_ID}).
              </p>
            </div>
          ) : null}
        </div>

        <section
          className="relative mb-8 overflow-hidden rounded-[1.75rem] border border-[var(--ui-border)] shadow-[var(--ui-shadow-md)]"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--ui-brand-green) 11%, var(--ui-surface-elev)) 0%, var(--ui-surface-elev) 50%, color-mix(in oklab, var(--ui-brand-brown) 10%, var(--ui-surface-elev)) 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl"
            style={{ background: "color-mix(in oklab, var(--ui-brand-green) 55%, transparent)" }}
            aria-hidden
          />
          <div className="relative grid gap-6 p-6 md:gap-8 md:p-8 lg:grid-cols-5 lg:p-10">
            {heroImageUrl ? (
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-md)] lg:col-span-2 lg:aspect-auto lg:min-h-[260px]">
                <Image
                  src={heroImageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 360px"
                  unoptimized
                />
              </div>
            ) : null}
            <div
              className={
                heroImageUrl
                  ? "flex flex-col justify-center lg:col-span-3"
                  : "flex flex-col justify-center lg:col-span-5"
              }
            >
              <TextCaption
                as="p"
                className="font-bold uppercase tracking-[0.22em] text-[var(--ui-brand-green-strong)]"
              >
                Campaign · Chain {config.chainId}
              </TextCaption>
              <TextTitle2
                as="h1"
                className="brand-brown mt-2 text-3xl font-bold leading-tight tracking-tight md:text-4xl"
              >
                {displayTitle}
              </TextTitle2>
              <div className="mt-4 flex flex-wrap gap-2">
                <Tag colorScheme={onChainOk ? "green" : "yellow"} emphasis="low">
                  {onChainOk ? "Live on-chain" : "Indexed metadata"}
                </Tag>
                <Tag colorScheme="gray" emphasis="low">
                  ID #{id}
                </Tag>
              </div>
              {dbCampaign?.description?.trim() ? (
                <TextBody as="p" className="app-text mt-4 max-w-3xl text-base leading-relaxed">
                  {dbCampaign.description.trim()}
                </TextBody>
              ) : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {displayOwner ? (
                  <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Owner</p>
                    <p className="mt-1 truncate font-mono text-sm text-[var(--ui-text)]">{displayOwner}</p>
                  </div>
                ) : null}
                {displayBeneficiary ? (
                  <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                      Beneficiary
                    </p>
                    <p className="mt-1 truncate font-mono text-sm text-[var(--ui-text)]">{displayBeneficiary}</p>
                  </div>
                ) : null}
              </div>
              {!displayOwner && !displayBeneficiary ? (
                <TextBody as="p" className={`${mutedClass} mt-3`}>
                  Owner / beneficiary addresses are not available from the index yet.
                </TextBody>
              ) : null}
            </div>
          </div>
        </section>

        {targetAmount > 0n ? (
          <div className={`${sectionCard} mb-10`}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className={sectionEyebrow}>Funding progress</p>
                <p className="text-2xl font-bold tabular-nums text-[var(--ui-text)]">
                  {formatUsdc(fundedForProgress)}{" "}
                  <span className="text-lg font-semibold text-[var(--ui-muted)]">
                    / {formatUsdc(targetAmount)} USDC
                  </span>
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums brand-green">{fundingProgressPercent}%</p>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ui-border)_75%,var(--ui-bg))]">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${fundingProgressPercent}%`,
                  background: "linear-gradient(90deg, var(--ui-brand-green), var(--ui-brand-green-strong))",
                }}
              />
            </div>
            <p className={`${mutedClass} mt-2 text-xs`}>
              {onChainOk
                ? "Uses live escrow when available; otherwise indexed deposits from Supabase."
                : "From indexed deposits; wire registry + RPC for live escrow totals."}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="space-y-8 lg:col-span-7">
        {dbOrganization ? (
          <div className={`${sectionCard} border-emerald-500/25`}>
            <TextHeadline as="h2" className="mb-4 text-[var(--ui-text)]">
              Organization
            </TextHeadline>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {dbOrganization.logo_url?.trim() ? (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)]">
                  <Image
                    src={dbOrganization.logo_url.trim()}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="64px"
                    unoptimized
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold text-[var(--ui-text)]">{dbOrganization.name}</p>
                  {dbOrganization.status === "approved" ? (
                    <Tag colorScheme="green" emphasis="high">Verified org</Tag>
                  ) : null}
                </div>
                {dbOrganization.country ? (
                  <p className={`${mutedClass} mt-1`}>{dbOrganization.country}</p>
                ) : null}
                {dbOrganization.description?.trim() ? (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ui-text)]">
                    {dbOrganization.description.trim()}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
                  {dbOrganization.website_url?.trim() ? (
                    <a
                      href={dbOrganization.website_url.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--ui-brand-green)] hover:underline"
                    >
                      Website
                    </a>
                  ) : null}
                  {dbOrganization.official_email?.trim() ? (
                    <a
                      href={`mailto:${dbOrganization.official_email.trim()}`}
                      className="text-[var(--ui-brand-green)] hover:underline"
                    >
                      Email
                    </a>
                  ) : null}
                  {dbOrganization.twitter_handle?.trim() ? (
                    <a
                      href={`https://twitter.com/${dbOrganization.twitter_handle.replace(/^@/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--ui-brand-green)] hover:underline"
                    >
                      Twitter
                    </a>
                  ) : null}
                  {dbOrganization.linkedin_url?.trim() ? (
                    <a
                      href={dbOrganization.linkedin_url.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--ui-brand-green)] hover:underline"
                    >
                      LinkedIn
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {dbCampaign &&
        (dbCampaign.beneficiary_description?.trim() ||
          (dbCampaign.tags && dbCampaign.tags.length > 0) ||
          dbCampaign.region ||
          dbCampaign.cause ||
          dbCampaign.deadline ||
          dbCampaign.contact_email?.trim() ||
          socials.length > 0 ||
          impactMetricRows.length > 0) ? (
          <div className={sectionCard}>
            <TextHeadline as="h2" className="mb-4 text-[var(--ui-text)]">
              Campaign details
            </TextHeadline>
            {dbCampaign.beneficiary_description?.trim() ? (
              <p className="mb-3 text-sm leading-relaxed text-[var(--ui-text)]">
                <span className="font-semibold text-[var(--ui-muted)]">Who benefits: </span>
                {dbCampaign.beneficiary_description.trim()}
              </p>
            ) : null}
            <div className={`flex flex-wrap gap-2 ${mutedClass}`}>
              {dbCampaign.region ? (
                <Tag colorScheme="gray" emphasis="low">Region: {dbCampaign.region}</Tag>
              ) : null}
              {dbCampaign.cause ? (
                <Tag colorScheme="gray" emphasis="low">Cause: {dbCampaign.cause}</Tag>
              ) : null}
              {dbCampaign.deadline ? (
                <Tag colorScheme="gray" emphasis="low">
                  Deadline:{" "}
                  {new Date(dbCampaign.deadline).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </Tag>
              ) : null}
              {dbCampaign.status ? (
                <Tag colorScheme="gray" emphasis="low">Status: {dbCampaign.status}</Tag>
              ) : null}
            </div>
            {dbCampaign.tags && dbCampaign.tags.length > 0 ? (
              <p className={`mt-3 text-sm ${mutedClass}`}>
                <span className="font-medium text-[var(--ui-text)]">Tags: </span>
                {dbCampaign.tags.join(", ")}
              </p>
            ) : null}
            {dbCampaign.contact_email?.trim() ? (
              <p className={`mt-2 text-sm ${mutedClass}`}>
                Contact:{" "}
                <a
                  href={`mailto:${dbCampaign.contact_email.trim()}`}
                  className="text-[var(--ui-brand-green)] hover:underline"
                >
                  {dbCampaign.contact_email.trim()}
                </a>
              </p>
            ) : null}
            {socials.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {socials.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--ui-brand-green)] hover:underline"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {impactMetricRows.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--ui-muted)]">
                  Expected outcomes
                </p>
                <ul className="space-y-2 text-sm text-[var(--ui-text)]">
                  {impactMetricRows.map((m, i) => (
                    <li key={i}>
                      <span className="font-medium">{m.name || "Metric"}</span>
                      {m.target ? <span className="text-[var(--ui-muted)]"> — target: {m.target}</span> : null}
                      {m.timeframe ? (
                        <span className="text-[var(--ui-muted)]"> ({m.timeframe})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {onChainOk && initialized && milestoneAmounts && milestoneAmounts.length > 0 ? (
          <div className={sectionCard}>
            <TextHeadline as="h2" className="mb-1 text-[var(--ui-text)]">
              Milestones
            </TextHeadline>
            <p className={`${mutedClass} mb-4 text-xs`}>
              Milestone 1 is open for funding immediately. Each subsequent milestone unlocks only after the previous one is completed, verified by volunteers, and attested on-chain (EAS).
            </p>
            <ul className="space-y-4">
              {milestoneAmounts.map((amt, i) => {
                const msData = parseMilestoneData(dbCampaign?.milestone_data);
                const msTitle = msData[i]?.title?.trim();
                const msDesc = msData[i]?.description?.trim();
                const msDonors = donors.filter((d) => d.milestone_index === i);
                const msProofs = milestoneProofs.filter((p) => p.milestone_index === i);
                const approvedProof = msProofs.find(
                  (p) => p.status === "approved" && p.attestation_uid,
                );
                const msFunded = msDonors.reduce((s, d) => s + BigInt(d.amount), BigInt(0));
                const msPercent = amt > 0n ? Math.min(100, Math.round((Number(msFunded) / Number(amt)) * 100)) : 0;
                const isReleased = Number(releasedCount) > i;
                const isActive = Number(releasedCount) === i;
                const isLocked = i > Number(releasedCount);
                return (
                  <li
                    key={i}
                    className={`rounded-xl border p-4 ${
                      isReleased
                        ? "border-emerald-500/30 bg-[color-mix(in_oklab,var(--ui-brand-green)_6%,var(--ui-surface))]"
                        : isActive
                        ? "border-[color-mix(in_oklab,var(--ui-brand-green)_30%,var(--ui-border))] bg-[var(--ui-surface)]"
                        : "border-[var(--ui-border)] bg-[var(--ui-surface)] opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              isReleased
                                ? "bg-[var(--ui-brand-green)] text-white"
                                : isLocked
                                ? "bg-[var(--ui-surface-elev)] text-[var(--ui-muted)] ring-1 ring-[var(--ui-border)]"
                                : "bg-[var(--ui-border)] text-[var(--ui-muted)]"
                            }`}
                          >
                            {isReleased ? "\u2713" : isLocked ? "\u{1F512}" : i + 1}
                          </span>
                          <span className={`font-medium ${isReleased ? "brand-green" : isLocked ? "text-[var(--ui-muted)]" : "app-text"}`}>
                            {msTitle || `Milestone ${i + 1}`}
                          </span>
                          {isActive && !isReleased && (
                            <span className="rounded-full bg-[var(--ui-brand-green)] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                              Open
                            </span>
                          )}
                          {isLocked && (
                            <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--ui-muted)]">
                              Locked
                            </span>
                          )}
                          {approvedProof?.attestation_uid ? (
                            <a
                              href={`${EAS_SCAN_BASE}${approvedProof.attestation_uid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600 hover:bg-emerald-500/15"
                              title={approvedProof.attestation_uid}
                            >
                              EAS attested
                            </a>
                          ) : null}
                        </div>
                        {msDesc && (
                          <p className={`mt-1 pl-8 text-xs leading-relaxed ${mutedClass}`}>{msDesc}</p>
                        )}
                        {isLocked && (
                          <p className="mt-1.5 pl-8 text-xs text-amber-500/90">
                            Requires milestone {i} to be completed, verified by volunteers, and attested (EAS) before funding opens.
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--ui-text)]">
                        {formatUsdc(amt)} <span className="text-xs font-normal text-[var(--ui-muted)]">USDC</span>
                      </span>
                    </div>
                    {!isLocked && (
                      <div className="mt-3 pl-8">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ui-border)_75%,var(--ui-bg))]">
                          <div
                            className="h-full rounded-full transition-[width] duration-500 ease-out"
                            style={{
                              width: `${msPercent}%`,
                              background: isReleased
                                ? "var(--ui-brand-green)"
                                : "linear-gradient(90deg, var(--ui-brand-green), var(--ui-brand-green-strong))",
                            }}
                          />
                        </div>
                        <p className={`mt-1 text-xs ${mutedClass}`}>
                          {formatUsdc(msFunded)} / {formatUsdc(amt)} USDC
                          {msDonors.length > 0 && <> · {msDonors.length} donor{msDonors.length !== 1 ? "s" : ""}</>}
                          {isReleased && " · Attested & Released"}
                        </p>
                      </div>
                    )}
                    {msDonors.length > 0 && !isLocked && (
                      <div className="mt-3 flex flex-wrap gap-1.5 pl-8">
                        {msDonors.slice(0, 8).map((d) => (
                          <span
                            key={d.tx_hash}
                            title={`${d.is_anonymous ? "Anonymous" : (d.display_name || "Donor")} · +${formatUsdc(BigInt(d.amount))} USDC`}
                            className="flex items-center gap-1.5 rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg)] px-2 py-0.5 text-xs"
                          >
                            {!d.is_anonymous && d.avatar_url ? (
                              <img src={d.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                            ) : (
                              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--ui-border)] text-[8px] font-bold text-[var(--ui-muted)]">
                                {d.is_anonymous ? "?" : (d.display_name?.[0]?.toUpperCase() ?? "D")}
                              </span>
                            )}
                            <span className="max-w-[6rem] truncate font-medium text-[var(--ui-text)]">
                              {d.is_anonymous ? "Anonymous" : (d.display_name || "Donor")}
                            </span>
                          </span>
                        ))}
                        {msDonors.length > 8 && (
                          <span className={`self-center text-xs ${mutedClass}`}>+{msDonors.length - 8} more</span>
                        )}
                      </div>
                    )}

                    {/* Existing proof submissions for this milestone */}
                    {(() => {
                      if (msProofs.length === 0) return null;
                      return (
                        <div className="mt-3 space-y-2 pl-8">
                          {msProofs.map((p) => (
                            <div
                              key={p.id}
                              className={`rounded-lg border px-3 py-2 text-xs ${
                                p.status === "approved"
                                  ? "border-emerald-500/30 bg-[color-mix(in_oklab,var(--ui-brand-green)_6%,var(--ui-surface))]"
                                  : p.status === "rejected"
                                  ? "border-red-400/30 bg-red-50/5"
                                  : "border-amber-400/30 bg-amber-50/5"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold ${
                                  p.status === "approved" ? "text-emerald-600" : p.status === "rejected" ? "text-red-500" : "text-amber-600"
                                }`}>
                                  {p.status === "approved" ? "\u2713 Proof approved" : p.status === "rejected" ? "\u2717 Proof rejected" : "\u23F3 Proof under review"}
                                </span>
                                {p.status === "approved" && p.attestation_uid ? (
                                  <a
                                    href={`${EAS_SCAN_BASE}${p.attestation_uid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600 hover:bg-emerald-500/15"
                                    title={p.attestation_uid}
                                  >
                                    EAS attested
                                  </a>
                                ) : null}
                              </div>
                              <p className="mt-0.5 font-medium text-[var(--ui-text)]">{p.title}</p>
                              {p.status === "approved" && p.attestation_uid ? (
                                <p className="mt-1 text-[10px] text-[var(--ui-muted)]">
                                  UID: {p.attestation_uid.slice(0, 10)}...{p.attestation_uid.slice(-6)}
                                </p>
                              ) : null}
                              {p.status === "rejected" && p.reviewer_notes && (
                                <p className="mt-1 italic text-red-500/80">Admin: &ldquo;{p.reviewer_notes}&rdquo;</p>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Submit proof button/form for org owner */}
                    {isOwner && isActive && !isReleased && (
                      <div className="mt-3 pl-8">
                        {proofMilestoneIndex === i ? (
                          <div className="space-y-2 rounded-xl border border-[color-mix(in_oklab,var(--ui-brand-green)_25%,var(--ui-border))] bg-[var(--ui-bg)] p-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-[var(--ui-brand-green-strong)]">
                              Submit proof for {msTitle || `Milestone ${i + 1}`}
                            </p>
                            <input
                              type="text"
                              value={proofTitle}
                              onChange={(e) => setProofTitle(e.target.value)}
                              maxLength={200}
                              placeholder="Proof title (e.g. 'Water well construction complete')"
                              className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none"
                            />
                            <textarea
                              value={proofDescription}
                              onChange={(e) => setProofDescription(e.target.value)}
                              rows={3}
                              maxLength={4000}
                              placeholder="Describe the work completed, include dates, locations, and measurable outcomes..."
                              className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none"
                            />
                            <div className="flex flex-wrap items-center gap-3">
                              <input
                                type="file"
                                multiple
                                accept="image/*,.pdf,.txt"
                                onChange={(e) => setProofFiles(e.target.files)}
                                className="max-w-xs text-xs file:mr-2 file:rounded-md file:border-0 file:bg-[var(--ui-brand-brown)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-[var(--ui-brand-brown-soft)]"
                              />
                              <span className={`text-xs ${mutedClass}`}>Photos, PDFs, text (max 5MB each)</span>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button
                                variant="primary"
                                compact
                                onClick={() => handleSubmitProof(i)}
                                disabled={proofSubmitting || !proofTitle.trim() || !proofDescription.trim()}
                                loading={proofSubmitting}
                              >
                                {proofSubmitting ? "Submitting..." : "Submit proof"}
                              </Button>
                              <Button
                                variant="secondary"
                                compact
                                transparent
                                onClick={() => { setProofMilestoneIndex(null); setProofTitle(""); setProofDescription(""); setProofFiles(null); }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="primary"
                            compact
                            onClick={() => setProofMilestoneIndex(i)}
                          >
                            Submit completion proof
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : !onChainOk && dbCampaign && (dbCampaign.milestone_count ?? 0) > 0 ? (
          <div className={sectionCard}>
            <TextHeadline as="h2" className="mb-3 text-[var(--ui-text)]">
              Milestones
            </TextHeadline>
            <p className={`text-sm ${mutedClass}`}>
              Milestone count from index: <strong>{dbCampaign.milestone_count}</strong>. Connect to the correct network
              to see per-milestone USDC amounts from the escrow contract.
            </p>
          </div>
        ) : null}

        {onChainOk && !initialized ? (
          <div
            className="rounded-xl border border-amber-500/35 px-4 py-3 text-sm"
            style={{ color: "var(--ui-brand-amber)" }}
            role="status"
          >
            Escrow not initialized yet. The campaign owner should complete initialization from the create flow.
          </div>
        ) : null}

        <div className={sectionCard}>
          <TextHeadline as="h2" className="mb-1 text-[var(--ui-text)]">
            Activity (indexed)
          </TextHeadline>
          <p className={`${mutedClass} mb-4 text-xs`}>
            Deposits and releases as recorded by the indexer (Supabase).
          </p>
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
                      href={`${TX_EXPLORER_BASE}${d.tx_hash}`}
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
                      href={`${TX_EXPLORER_BASE}${r.tx_hash}`}
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

        {donors.length > 0 && (
          <div className={sectionCard} id="supporters">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <TextHeadline as="h2" className="text-[var(--ui-text)]">
                  Supporters
                </TextHeadline>
                <p className={`mt-1 text-xs ${mutedClass}`}>
                  {donors.length} donor{donors.length !== 1 ? "s" : ""} — permanently recorded on Base.
                </p>
              </div>
              <p className="text-sm font-bold tabular-nums text-[var(--ui-brand-green)]">
                {formatUsdc(donors.reduce((s, d) => s + BigInt(d.amount), 0n))} USDC
              </p>
            </div>
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {donors.map((d) => (
                <li
                  key={d.tx_hash}
                  className="flex items-start gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2.5"
                >
                  {!d.is_anonymous && d.avatar_url ? (
                    <img src={d.avatar_url} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ui-border)] text-xs font-bold text-[var(--ui-muted)]">
                      {d.is_anonymous ? "?" : (d.display_name?.[0]?.toUpperCase() ?? "D")}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-[var(--ui-text)]">
                        {d.is_anonymous ? "Anonymous Donor" : (d.display_name || "Donor")}
                      </span>
                      <span className="text-sm font-medium brand-green">
                        +{formatUsdc(BigInt(d.amount))} USDC
                      </span>
                      {d.milestone_index != null && (() => {
                        const msData = parseMilestoneData(dbCampaign?.milestone_data);
                        const label = msData[d.milestone_index]?.title?.trim() || `Milestone ${d.milestone_index + 1}`;
                        return (
                          <span className={`text-xs ${mutedClass}`}>
                            → {label}
                          </span>
                        );
                      })()}
                    </div>
                    {d.donor_message && (
                      <p className="mt-0.5 text-xs italic text-[var(--ui-muted)]">&ldquo;{d.donor_message}&rdquo;</p>
                    )}
                    <p className={`mt-0.5 text-xs ${mutedClass}`}>
                      {new Date(d.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={sectionCard}>
          <TextHeadline as="h2" className="mb-1 text-[var(--ui-text)]">
            Impact feed
          </TextHeadline>
          <p className={`${mutedClass} mb-3`}>
            Post proof/updates for this campaign. Entries are pinned to IPFS (Filebase) and
            indexed in Supabase.
          </p>
          {isConnected && (
            <div className="mb-4 space-y-2">
              <textarea
                value={impactBody}
                onChange={(e) => setImpactBody(e.target.value)}
                rows={3}
                placeholder="What progress happened? What evidence did you gather?"
                className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-3 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus-ring)]"
              />
              <div className="flex flex-wrap gap-2">
                <input
                  type="number"
                  min="0"
                  value={impactMilestone}
                  onChange={(e) => setImpactMilestone(e.target.value)}
                  placeholder="Milestone index (optional)"
                  className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none sm:w-64"
                />
                <input
                  type="text"
                  value={impactTxHash}
                  onChange={(e) => setImpactTxHash(e.target.value)}
                  placeholder="Linked tx hash (optional 0x...)"
                  className="w-full flex-1 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none sm:min-w-[280px]"
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
            <div className="space-y-3">
              {impactPosts.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-sm"
                >
                  <p className="text-sm text-[var(--ui-text)]">{p.body}</p>
                  <p className={`mt-1 text-xs ${mutedClass}`}>
                    {new Date(p.created_at).toLocaleString()} · by{" "}
                    <span className="font-mono">{p.author_wallet.slice(0, 10)}...</span>
                    {p.milestone_index !== null ? ` · milestone #${p.milestone_index}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    <a
                      href={p.ipfs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="brand-brown hover:underline"
                    >
                      IPFS: {p.ipfs_cid.slice(0, 10)}...
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
                        href={`${TX_EXPLORER_BASE}${p.tx_hash_link}`}
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

        <div className={sectionCard}>
          <TextHeadline as="h2" className="mb-1 text-[var(--ui-text)]">
            Comments
          </TextHeadline>
          <p className={`${mutedClass} mb-4 text-xs`}>
            Public discussion. Comments are signed with your wallet (same verification as impact posts). You can
            reply once per thread (replies nest under the original comment).
          </p>
          {isConnected ? (
            <div className="mb-6 space-y-2">
              {replyTarget ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2 text-xs text-[var(--ui-text)]">
                  <span className="min-w-0">
                    Replying to{" "}
                    <span className="font-mono text-[var(--ui-muted)]">
                      {replyTarget.author_wallet.slice(0, 10)}…
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyToId(null)}
                    className="shrink-0 text-[var(--ui-brand-green)] hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={
                  replyTarget
                    ? "Write your reply…"
                    : "Share encouragement, questions, or feedback…"
                }
                className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-3 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus-ring)]"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs ${mutedClass}`}>{commentBody.length}/2000</span>
                <Button
                  variant="primary"
                  compact
                  onClick={handlePostComment}
                  disabled={commentSubmitting || !commentBody.trim()}
                  loading={commentSubmitting}
                >
                  {commentSubmitting ? "Posting…" : replyTarget ? "Post reply" : "Post comment"}
                </Button>
              </div>
            </div>
          ) : (
            <p className={`${mutedClass} mb-6 text-sm`}>Connect your wallet to leave a comment.</p>
          )}

          {commentThreads.length === 0 ? (
            <p className={`text-sm ${mutedClass}`}>No comments yet. Be the first to say something.</p>
          ) : (
            <ul className="space-y-4">
              {commentThreads.map(({ root, replies }) => (
                <li
                  key={root.id}
                  className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4"
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ui-text)]">
                    {root.body}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className={`flex flex-wrap items-center gap-x-2 text-xs ${mutedClass}`}>
                      <span className="font-mono">{root.author_wallet.slice(0, 10)}…</span>
                      <span aria-hidden>·</span>
                      <time dateTime={root.created_at}>{new Date(root.created_at).toLocaleString()}</time>
                    </p>
                    {isConnected ? (
                      <button
                        type="button"
                        onClick={() => setReplyToId(root.id)}
                        className="text-xs font-medium text-[var(--ui-brand-green)] hover:underline"
                      >
                        Reply
                      </button>
                    ) : null}
                  </div>
                  {replies.length > 0 ? (
                    <ul className="mt-4 space-y-3 border-l-2 border-[color-mix(in_oklab,var(--ui-brand-green)_35%,var(--ui-border))] pl-4">
                      {replies.map((co) => (
                        <li key={co.id}>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ui-text)]">
                            {co.body}
                          </p>
                          <p className={`mt-2 flex flex-wrap items-center gap-x-2 text-xs ${mutedClass}`}>
                            <span className="font-mono">{co.author_wallet.slice(0, 10)}…</span>
                            <span aria-hidden>·</span>
                            <time dateTime={co.created_at}>{new Date(co.created_at).toLocaleString()}</time>
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
          </div>

          <aside className="space-y-6 lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
            <div className={sectionCard}>
              <TextHeadline as="h2" className="mb-1 text-[var(--ui-text)]">
                Share & donate
              </TextHeadline>
              <p className={`${mutedClass} mb-4 text-xs`}>
                Send donors to this page or scan the QR code. Wallet-to-wallet updates use the{" "}
                <strong className="text-[var(--ui-text)]">messages</strong> button (bottom-right).
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="break-all rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-2 font-mono text-xs text-[var(--ui-muted)]">
                    {campaignShareUrl || `https://your-domain/campaigns/${id}`}
                  </div>
                  <Button
                    variant="primary"
                    compact
                    className="mt-3"
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
                {campaignShareUrl ? (
                  <div className="shrink-0 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                        campaignShareUrl,
                      )}`}
                      alt="Campaign QR code"
                      width={160}
                      height={160}
                      className="h-40 w-40"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className={sectionCard}>
              <p className={sectionEyebrow}>Snapshot</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-3">
                  <p className={`${mutedClass} text-xs font-semibold uppercase tracking-wide`}>Target</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-[var(--ui-text)]">
                    {formatUsdc(targetAmount)}
                  </p>
                  <p className="text-xs text-[var(--ui-muted)]">USDC</p>
                </div>
                <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-3">
                  <p className={`${mutedClass} text-xs font-semibold uppercase tracking-wide`}>Live escrow</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-[var(--ui-text)]">
                    {onChainOk && totalDeposited !== undefined ? formatUsdc(totalDeposited) : "—"}
                  </p>
                  <p className="text-xs text-[var(--ui-muted)]">USDC</p>
                </div>
                <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-3">
                  <p className={`${mutedClass} text-xs font-semibold uppercase tracking-wide`}>Indexed in</p>
                  <p className="mt-1 text-lg font-bold tabular-nums brand-green">{formatUsdc(indexedDeposited)}</p>
                  <p className="text-xs text-[var(--ui-muted)]">USDC deposited</p>
                </div>
              </div>
              {metadataUri ? (
                <p className={`${mutedClass} mt-3 truncate text-xs`} title={metadataUri}>
                  Metadata URI: {metadataUri}
                </p>
              ) : null}
            </div>

            {depositSuccessBanner && (
              <div
                className="rounded-2xl border border-emerald-500/40 bg-[color-mix(in_oklab,var(--ui-brand-green)_12%,var(--ui-surface-elev))] p-4 shadow-[var(--ui-shadow-md)]"
                role="status"
              >
                <p className="text-sm font-semibold text-[var(--ui-brand-green-strong)]">Donation sent on-chain</p>
                <p className="mt-1 text-xs text-[var(--ui-text)]">
                  Your USDC deposit has been confirmed. Thank you for supporting this campaign{fundAnonymous ? " anonymously" : ""}!
                </p>
              </div>
            )}

            {proofSuccessBanner && (
              <div
                className="rounded-2xl border border-emerald-500/40 bg-[color-mix(in_oklab,var(--ui-brand-green)_12%,var(--ui-surface-elev))] p-4 shadow-[var(--ui-shadow-md)]"
                role="status"
              >
                <p className="text-sm font-semibold text-[var(--ui-brand-green-strong)]">Milestone proof submitted</p>
                <p className="mt-1 text-xs text-[var(--ui-text)]">
                  Your evidence has been uploaded and is now pending admin review. The admin will verify with volunteers before issuing the EAS attestation.
                </p>
              </div>
            )}

            {isConnected && initialized && onChainOk ? (
              <div className={`${sectionCard} border-[color-mix(in_oklab,var(--ui-brand-green)_28%,var(--ui-border))]`}>
                <TextHeadline as="h2" className="mb-1 text-[var(--ui-text)]">
                  Fund this campaign
                </TextHeadline>
                <p className={`${mutedClass} mb-4 text-xs`}>
                  USDC on Base. Fund the current open milestone or make a general donation. Future milestones unlock after the organization proves progress and receives an EAS attestation.
                </p>

                <div className="space-y-4">
                  {/* Milestone selector */}
                  <div>
                    <label className={`${labelClass} mb-1`}>Support milestone</label>
                    <select
                      value={fundMilestoneIndex}
                      onChange={(e) => setFundMilestoneIndex(e.target.value)}
                      className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2.5 app-text focus:border-[var(--ui-brand-green)] focus:outline-none"
                    >
                      <option value="general">General (no preference)</option>
                      {milestoneAmounts?.map((amt, i) => {
                        const msData = parseMilestoneData(dbCampaign?.milestone_data);
                        const label = msData[i]?.title?.trim() || `Milestone ${i + 1}`;
                        const isLocked = i > Number(releasedCount ?? 0n);
                        const isReleased = Number(releasedCount ?? 0n) > i;
                        return (
                          <option key={i} value={String(i)} disabled={isLocked}>
                            {isLocked ? "\u{1F512} " : isReleased ? "\u2713 " : ""}{label} — {formatUsdc(amt)} USDC{isLocked ? " (locked)" : isReleased ? " (released)" : ""}
                          </option>
                        );
                      })}
                    </select>
                    {milestoneAmounts && Number(releasedCount ?? 0n) < milestoneAmounts.length && (
                      <p className={`mt-1.5 text-xs ${mutedClass}`}>
                        Only milestone {Number(releasedCount ?? 0n) + 1} is open for funding.
                        {Number(releasedCount ?? 0n) > 0
                          ? ` Previous milestones were attested and released.`
                          : ` Future milestones unlock after the current one is attested.`}
                      </p>
                    )}
                  </div>

                  {/* Amount */}
                  <div>
                    <label className={`${labelClass} mb-1`}>Amount (USDC)</label>
                    <input
                      type="text"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2.5 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Donor identity: segmented control */}
                  <div>
                    <label className={`${labelClass} mb-1.5`}>Appear as</label>
                    <div className="grid grid-cols-2 gap-0 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-1">
                      <button
                        type="button"
                        onClick={() => setFundAnonymous(false)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                          !fundAnonymous
                            ? "bg-[var(--ui-brand-green)] text-white shadow-sm"
                            : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                        }`}
                      >
                        Visible Donor
                      </button>
                      <button
                        type="button"
                        onClick={() => setFundAnonymous(true)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                          fundAnonymous
                            ? "bg-[var(--ui-surface-elev)] text-[var(--ui-text)] shadow-sm ring-1 ring-[var(--ui-border)]"
                            : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                        }`}
                      >
                        Anonymous
                      </button>
                    </div>
                    <p className={`mt-1.5 text-xs ${mutedClass}`}>
                      {fundAnonymous
                        ? "Your name and avatar will be hidden. On-chain wallet address remains public on the blockchain."
                        : "Your profile name and avatar will appear in the donor list."}
                    </p>
                  </div>

                  {/* Donation preview */}
                  {fundAmount && (
                    <div className="rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--ui-muted)]">
                        Preview — how your donation will appear
                      </p>
                      <div className="flex items-center gap-3">
                        {!fundAnonymous && donorProfileAvatar ? (
                          <img src={donorProfileAvatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ui-border)] text-xs font-bold text-[var(--ui-muted)]">
                            {fundAnonymous ? "?" : (donorProfileName?.[0]?.toUpperCase() ?? "D")}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-semibold text-[var(--ui-text)]">
                              {fundAnonymous ? "Anonymous Donor" : (donorProfileName || "Donor")}
                            </span>
                            <span className="text-sm font-medium text-[var(--ui-brand-green)]">
                              +{fundAmount} USDC
                            </span>
                          </div>
                          {fundMessage.trim() && (
                            <p className="mt-0.5 truncate text-xs italic text-[var(--ui-muted)]">
                              &ldquo;{fundMessage.trim()}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Optional message */}
                  <div>
                    <label className={`${labelClass} mb-1`}>Message (optional)</label>
                    <input
                      type="text"
                      value={fundMessage}
                      onChange={(e) => setFundMessage(e.target.value)}
                      maxLength={280}
                      className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2.5 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none"
                      placeholder="Leave a note for the campaign..."
                    />
                    {fundMessage.length > 0 && (
                      <span className={`mt-1 block text-right text-xs ${mutedClass}`}>{fundMessage.length}/280</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!approveConfirmed ? (
                      <Button
                        variant="primary"
                        compact
                        onClick={handleApprove}
                        disabled={!fundAmount || isPendingApprove || isConfirmingApprove}
                        loading={isPendingApprove || isConfirmingApprove}
                      >
                        {isPendingApprove || isConfirmingApprove ? "Approving..." : "1. Approve USDC"}
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        compact
                        onClick={handleDeposit}
                        disabled={!fundAmount || isPendingDeposit || isConfirmingDeposit}
                        loading={isPendingDeposit || isConfirmingDeposit}
                      >
                        {isPendingDeposit || isConfirmingDeposit ? "Depositing..." : "2. Deposit & Donate"}
                      </Button>
                    )}
                  </div>
                </div>

                {(isOwner || isBeneficiary) &&
                  milestoneAmounts &&
                  Number(releasedCount) < milestoneAmounts.length && (
                    <div className="mt-6 rounded-xl border border-amber-500/35 bg-[color-mix(in_oklab,var(--ui-brand-amber)_10%,var(--ui-surface-elev))] p-4">
                      <h3 className="mb-2 text-sm font-semibold text-[var(--ui-text)]">
                        Release milestone (EAS attestation)
                      </h3>
                      <input
                        type="text"
                        value={releaseMilestoneIndex}
                        onChange={(e) => setReleaseMilestoneIndex(e.target.value)}
                        className="mb-2 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none"
                        placeholder="Milestone index (0-based)"
                      />
                      <input
                        type="text"
                        value={attestationUid}
                        onChange={(e) => setAttestationUid(e.target.value)}
                        className="mb-2 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-2 font-mono text-sm app-text placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none"
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
            ) : null}

            {txDeposit ? (
              <p className={`text-center text-sm ${mutedClass} lg:text-left`}>
                Last deposit:{" "}
                <a
                  href={`${TX_EXPLORER_BASE}${txDeposit}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium brand-brown hover:underline"
                >
                  View on explorer
                </a>
              </p>
            ) : null}

            <div className={sectionCard}>
              <TextHeadline as="h2" className="mb-1 text-[var(--ui-text)]">
                Trust & reputation
              </TextHeadline>
              <p className={`${mutedClass} mb-4 text-xs`}>World ID verification for the beneficiary wallet.</p>
              {!reputationLoaded ? (
                <div className="flex items-center gap-2">
                  <Spinner size={2} accessibilityLabel="Loading reputation" />
                  <span className={mutedClass}>Loading…</span>
                </div>
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
                  <p className="brand-green font-medium">Verified by World ID</p>
                  <p className="mt-1 app-text">
                    Score: <span className="font-semibold">{beneficiaryReputation.score}</span> ·{" "}
                    {beneficiaryReputation.attested_count} attested milestones
                  </p>
                  <p className={`mt-1 text-xs ${mutedClass}`}>
                    Updated {new Date(beneficiaryReputation.last_updated).toLocaleString()}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm brand-brown">
                    Beneficiary not Sybil-verified yet. Reputation stays hidden until verification.
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
              {worldIdStatus ? <p className={`mt-2 text-xs ${mutedClass}`}>{worldIdStatus}</p> : null}
              {worldIdConfigReady === false ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-amber-500/40 px-2 py-1 text-xs text-[var(--ui-text)]">
                    World ID config incomplete
                  </span>
                  <Link href="/debug/world-id" className="text-xs brand-brown hover:underline">
                    Check config →
                  </Link>
                </div>
              ) : null}
              {worldIdRpContext &&
              process.env.NEXT_PUBLIC_WORLDCOIN_APP_ID &&
              process.env.NEXT_PUBLIC_WORLDCOIN_ACTION ? (
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
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      <CampaignMessagesBubble
        open={xmtpPanelOpen}
        onOpenChange={setXmtpPanelOpen}
        isConnected={isConnected}
        busy={xmtpBusy}
        statusHint={xmtpStatus}
        xmtpDraft={xmtpDraft}
        onDraftChange={setXmtpDraft}
        xmtpPeerAddress={xmtpPeerAddress}
        xmtpInboxId={xmtpInboxId}
        messages={xmtpMessages}
        onSend={handleSendXmtpDraft}
      />
    </main>
  );
}
