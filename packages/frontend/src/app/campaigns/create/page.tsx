"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { useSendUserOperation, useWaitForUserOperation, useCurrentUser } from "@coinbase/cdp-hooks";
import { useAminiSigning } from "@/context/AminiSigningContext";
import { encodeFunctionData, decodeEventLog, TransactionReceiptNotFoundError } from "viem";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextLabel1 } from "@coinbase/cds-web/typography/TextLabel1";
import { TextLabel2 } from "@coinbase/cds-web/typography/TextLabel2";
import { TextTitle1 } from "@coinbase/cds-web/typography/TextTitle1";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { Tag } from "@coinbase/cds-web/tag/Tag";
import { Banner } from "@coinbase/cds-web/banner/Banner";
import { Spinner } from "@coinbase/cds-web/loaders/Spinner";
import { Icon } from "@coinbase/cds-web/icons";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  config,
  campaignRegistryAbi,
  milestoneEscrowAbi,
  formatUsdc,
  tryParseUsdc,
} from "@/lib/contracts";

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_MILESTONE = { title: "", description: "", amount: "" };

const CAUSE_OPTIONS = [
  { value: "forest", label: "Reforestation" },
  { value: "water", label: "Water infrastructure" },
  { value: "education", label: "Digital literacy" },
  { value: "health", label: "Health & sanitation" },
  { value: "energy", label: "Renewable energy" },
  { value: "agriculture", label: "Sustainable agriculture" },
  { value: "community", label: "Community development" },
  { value: "climate", label: "Climate action" },
];

/** Karma GAP–style horizon labels for expected outcomes (stored on each metric row). */
const METRIC_TIMEFRAME_OPTIONS = [
  { value: "", label: "Time horizon (optional)" },
  { value: "0-3 months", label: "Near-term (0–3 mo)" },
  { value: "3-12 months", label: "Mid-term (3–12 mo)" },
  { value: "12+ months", label: "Long-term (12+ mo)" },
] as const;

const EMPTY_IMPACT_METRIC = { name: "", target: "", timeframe: "" };

const VALIDATORS = [
  { value: "", label: "Select Validator" },
  { value: "eas", label: "EAS Attestation Service" },
  { value: "worldcoin", label: "Worldcoin ID" },
  { value: "custom", label: "Custom Validator" },
];

const STEPS = [
  { key: 1, label: "Details" },
  { key: 2, label: "Budget & milestones" },
  { key: 3, label: "Outcomes" },
  { key: 4, label: "Verification" },
  { key: 5, label: "Review" },
] as const;

const WIZARD_CARD_CLASS =
  "rounded-[22px] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-6 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.12)] sm:rounded-[28px] sm:p-8 dark:border-[var(--ui-border)] dark:bg-[var(--ui-surface)] dark:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.35)]";

function CampaignCreateStepper({
  currentStep,
  goToStep,
  isStepReachable,
}: {
  currentStep: number;
  goToStep: (step: number) => void;
  isStepReachable: (step: number) => boolean;
}) {
  const total = STEPS.length;
  /** Fill to horizontal center of current step; full width on last step. */
  const fillPct =
    currentStep >= total ? 100 : Math.max(0, Math.min(100, ((currentStep - 0.5) / total) * 100));

  return (
    <div className="mb-2">
      <div className="flex w-full justify-between gap-0.5 sm:gap-1">
        {STEPS.map((s) => {
          const reachable = isStepReachable(s.key);
          const active = currentStep === s.key;
          const completed = currentStep > s.key;
          return (
            <button
              key={s.key}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && goToStep(s.key)}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg px-0.5 py-1.5 transition-colors sm:gap-2.5 sm:px-1",
                !reachable && "cursor-not-allowed opacity-[0.38]",
                reachable && "cursor-pointer hover:bg-[color-mix(in_oklab,var(--ui-text)_5%,transparent)]",
              )}
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-[transform,box-shadow,border-color,background-color] sm:h-3 sm:w-3",
                  completed && "border-[var(--ui-brand-green)] bg-[var(--ui-brand-green)]",
                  active &&
                    !completed &&
                    "scale-110 border-[var(--ui-text)] bg-[var(--ui-text)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--ui-brand-green)_32%,transparent)] dark:shadow-[0_0_0_4px_color-mix(in_oklab,var(--ui-brand-green)_45%,transparent)]",
                  !active && !completed && "border-[var(--ui-border)] bg-[var(--ui-surface-elev)]",
                )}
              />
              <span
                className={cn(
                  "max-w-[4.5rem] text-center text-[10px] font-medium leading-snug sm:max-w-none sm:text-xs",
                  active && "font-semibold text-[var(--ui-text)]",
                  !active && completed && "text-[var(--ui-muted)]",
                  !active && !completed && "text-[var(--ui-muted)]",
                )}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
      <div
        className="mt-6 sm:mt-8"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={currentStep}
        aria-label={`Campaign wizard step ${currentStep} of ${total}`}
      >
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ui-border)_70%,var(--ui-surface-elev))] dark:bg-[color-mix(in_oklab,var(--ui-border)_55%,transparent)]">
          <div
            className="h-full min-w-[3px] rounded-full bg-[var(--ui-text)] transition-[width] duration-300 ease-out motion-reduce:transition-none dark:bg-[var(--ui-brand-green)]"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

type SubmitStep = "idle" | "uploading" | "creating" | "signing" | "saving" | "done" | "error";

/* ------------------------------------------------------------------ */
/* Draft helpers                                                      */
/* ------------------------------------------------------------------ */

/** Legacy local-only draft key (migrated to Supabase once on load when session allows). */
const LEGACY_DRAFT_KEY = "amini_campaign_draft";

/** Max length for optional cover `data:` URL stored inside draft JSON (Supabase row size). */
const MAX_DRAFT_IMAGE_DATA_URL_CHARS = 400_000;

type ImpactMetricRow = { name: string; target: string; timeframe?: string };

type DraftData = {
  title: string;
  description: string;
  beneficiaryDescription: string;
  contactEmail: string;
  socialLinks: { label: string; url: string }[];
  impactMetrics: ImpactMetricRow[];
  targetAmount: string;
  deadline: string;
  region: string;
  stateLoc: string;
  tags: string[];
  milestones: { title: string; description: string; amount: string }[];
  attestationService: string;
  permanentStorage: boolean;
  currentStep: number;
};

/** Payload merged into a `campaigns` row with `is_fully_created = false`. */
type DraftPayload = DraftData & { imagePreview?: string | null };

function loadLegacyDraft(): (DraftPayload & { savedAt?: string }) | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftPayload & { savedAt?: string };
  } catch {
    return null;
  }
}

function clearLegacyDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function CreateCampaignPage() {
  const { address, isConnected, signMessageAsync, getCdpAccessToken } =
    useAminiSigning();

  /* ---- Wizard step ---- */
  const [currentStep, setCurrentStep] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);

  /* ---- Form state ---- */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [beneficiaryDescription, setBeneficiaryDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [socialLinks, setSocialLinks] = useState<{ label: string; url: string }[]>([]);
  const [impactMetrics, setImpactMetrics] = useState<ImpactMetricRow[]>([]);
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [region, setRegion] = useState("");
  const [stateLoc, setStateLoc] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [milestones, setMilestones] = useState([{ ...EMPTY_MILESTONE }]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- Verification & Smart Escrow state ---- */
  const [attestationService, setAttestationService] = useState("");
  const [permanentStorage, setPermanentStorage] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);

  /* ---- Organization gate ---- */
  const [orgStatus, setOrgStatus] = useState<"loading" | "verified" | "unverified" | "none">("loading");
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  /* ---- Flow state ---- */
  const [submitStep, setSubmitStep] = useState<SubmitStep>("idle");
  const [metadataUri, setMetadataUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolvedCampaignId, setResolvedCampaignId] = useState<number | undefined>(undefined);
  const [savedToDb, setSavedToDb] = useState(false);
  const [showDraftToast, setShowDraftToast] = useState(false);
  const [pendingUserOperationHash, setPendingUserOperationHash] = useState<`0x${string}` | null>(null);

  /* ---- Contract interaction ---- */
  const publicClient = usePublicClient();
  const { currentUser } = useCurrentUser();
  const smartAccount = currentUser?.evmSmartAccounts?.[0];
  const isSmartWallet = !!(smartAccount && address && address.toLowerCase() === smartAccount.toLowerCase());
  
  // CDP smart account hook for user operations
  const { 
    sendUserOperation, 
    error: cdpTxError 
  } = useSendUserOperation();
  const { data: cdpUserOperation, error: cdpUserOperationError } = useWaitForUserOperation({
    userOperationHash: pendingUserOperationHash ?? undefined,
    evmSmartAccount: smartAccount as `0x${string}` | undefined,
    network: "base-sepolia",
    enabled: Boolean(pendingUserOperationHash && isSmartWallet && submitStep === "creating"),
  });
  const cdpTransactionHash =
    cdpUserOperation?.transactionHash ||
    cdpUserOperation?.receipts?.find((receipt) => receipt.transactionHash)?.transactionHash;
  const hasCanonicalCdpTransactionHash = Boolean(
    cdpTransactionHash && /^0x[a-fA-F0-9]{64}$/.test(cdpTransactionHash),
  );
  
  // Wagmi hooks for EOA fallback
  const { writeContract: writeRegistry, data: txCreate, isPending: isPendingCreate, error: txCreateError } = useWriteContract();
  const { data: receiptCreate, isLoading: isConfirmingCreate } = useWaitForTransactionReceipt({ hash: txCreate });
  const { writeContract: writeEscrow, data: txInit, isPending: isPendingInit } = useWriteContract();
  const { isLoading: isConfirmingInit, data: receiptInit } = useWaitForTransactionReceipt({ hash: txInit });

  const registryAddress = config.campaignRegistry;
  const escrowAddress = config.escrow;

  const applyServerDraft = useCallback((draft: Partial<DraftPayload>) => {
    if (typeof draft.title === "string") setTitle(draft.title);
    if (typeof draft.description === "string") setDescription(draft.description);
    if (typeof draft.beneficiaryDescription === "string") setBeneficiaryDescription(draft.beneficiaryDescription);
    if (typeof draft.contactEmail === "string") setContactEmail(draft.contactEmail);
    if (Array.isArray(draft.socialLinks)) setSocialLinks(draft.socialLinks);
    if (Array.isArray(draft.impactMetrics)) {
      setImpactMetrics(
        draft.impactMetrics.map((m) => ({
          name: typeof m?.name === "string" ? m.name : "",
          target: typeof m?.target === "string" ? m.target : "",
          timeframe: typeof m?.timeframe === "string" ? m.timeframe : "",
        })),
      );
    }
    if (typeof draft.targetAmount === "string") setTargetAmount(draft.targetAmount);
    if (typeof draft.deadline === "string") setDeadline(draft.deadline);
    if (typeof draft.region === "string") setRegion(draft.region);
    if (typeof draft.stateLoc === "string") setStateLoc(draft.stateLoc);
    if (Array.isArray(draft.tags)) setTags(draft.tags);
    if (Array.isArray(draft.milestones) && draft.milestones.length > 0) {
      setMilestones(draft.milestones);
    }
    if (typeof draft.attestationService === "string") setAttestationService(draft.attestationService);
    if (typeof draft.permanentStorage === "boolean") setPermanentStorage(draft.permanentStorage);
    if (
      typeof draft.currentStep === "number" &&
      draft.currentStep >= 1 &&
      draft.currentStep <= 5
    ) {
      setCurrentStep(draft.currentStep);
    }
    if (typeof draft.imagePreview === "string" && draft.imagePreview.length > 0) {
      setImagePreview(draft.imagePreview);
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else if (draft.imagePreview === null) {
      setImagePreview(null);
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  /* ---- Restore draft: Supabase (primary) + one-time legacy localStorage migration ---- */
  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getCdpAccessToken();
        const res = await fetch("/api/campaigns/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get",
            wallet: address.toLowerCase(),
            cdpAccessToken: token ?? undefined,
          }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          draft?: Partial<DraftPayload> | null;
          message?: string;
        };
        if (cancelled) return;

        if (
          json.ok &&
          json.draft &&
          typeof json.draft === "object" &&
          Object.keys(json.draft).length > 0
        ) {
          applyServerDraft(json.draft);
          setDraftRestored(true);
          clearLegacyDraft();
          return;
        }

        const legacy = loadLegacyDraft();
        if (!legacy) return;

        const { savedAt: _savedAt, ...rest } = legacy;
        applyServerDraft(rest);
        setDraftRestored(true);

        if (token) {
          let preview = rest.imagePreview ?? null;
          if (preview && preview.length > MAX_DRAFT_IMAGE_DATA_URL_CHARS) {
            preview = null;
          }
          const migrateBody = {
            ...rest,
            imagePreview: preview,
          };
          const saveRes = await fetch("/api/campaigns/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save",
              wallet: address.toLowerCase(),
              organizationId: orgId ?? undefined,
              draft: migrateBody,
              cdpAccessToken: token,
            }),
          });
          const saveJson = (await saveRes.json()) as { ok: boolean };
          if (saveJson.ok) clearLegacyDraft();
        }
      } catch (e) {
        console.warn("[Campaign Create] Draft load failed:", e);
        if (cancelled) return;
        const legacy = loadLegacyDraft();
        if (legacy) {
          const { savedAt: _savedAt, ...rest } = legacy;
          applyServerDraft(rest);
          setDraftRestored(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, getCdpAccessToken, applyServerDraft]);

  /* ---- Organization gate: check if wallet is a verified org ---- */
  useEffect(() => {
    if (!address) { setOrgStatus("none"); return; }
    setOrgStatus("loading");
    fetch(`/api/organizations?wallet=${address.toLowerCase()}`)
      .then((res) => res.json())
      .then((json: { ok: boolean; organization?: { id: string; name: string; status: string } }) => {
        if (json.ok && json.organization && json.organization.status === "approved") {
          setOrgStatus("verified");
          setOrgName(json.organization.name);
          setOrgId(json.organization.id);
        } else if (json.ok && json.organization) {
          setOrgStatus("unverified");
          setOrgName(json.organization.name);
        } else {
          setOrgStatus("none");
        }
      })
      .catch(() => setOrgStatus("none"));
  }, [address]);

  /* ---- Draft data getter ---- */
  const getDraftData = useCallback((): DraftData => ({
    title, description, beneficiaryDescription, contactEmail, socialLinks, impactMetrics,
    targetAmount, deadline, region, stateLoc, tags,
    milestones, attestationService, permanentStorage, currentStep,
  }), [title, description, beneficiaryDescription, contactEmail, socialLinks, impactMetrics,
    targetAmount, deadline, region, stateLoc, tags,
    milestones, attestationService, permanentStorage, currentStep]);

  const buildDraftPayload = useCallback(
    (override: Partial<DraftPayload> = {}): DraftPayload => {
      const base: DraftPayload = {
        ...getDraftData(),
        imagePreview:
          override.imagePreview !== undefined ? override.imagePreview : imagePreview,
      };
      let preview = base.imagePreview ?? null;
      if (preview && preview.length > MAX_DRAFT_IMAGE_DATA_URL_CHARS) {
        preview = null;
      }
      return { ...base, ...override, imagePreview: preview };
    },
    [getDraftData, imagePreview],
  );

  const persistDraftToServer = useCallback(
    async (draft: DraftPayload): Promise<{ ok: boolean; message?: string }> => {
      if (!address) {
        return { ok: false, message: "Connect your wallet to save a draft." };
      }
      try {
        const token = await getCdpAccessToken();
        const res = await fetch("/api/campaigns/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save",
            wallet: address.toLowerCase(),
            organizationId: orgId ?? undefined,
            draft,
            cdpAccessToken: token ?? undefined,
          }),
        });
        const json = (await res.json()) as { ok: boolean; message?: string };
        if (json.ok) clearLegacyDraft();
        return json;
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
    [address, orgId, getCdpAccessToken],
  );

  const deleteDraftOnServer = useCallback(async (): Promise<void> => {
    if (!address) return;
    try {
      const token = await getCdpAccessToken();
      await fetch("/api/campaigns/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          wallet: address.toLowerCase(),
          cdpAccessToken: token ?? undefined,
        }),
      });
    } catch {
      /* ignore */
    }
  }, [address, getCdpAccessToken]);

  const purgeDraftStorage = useCallback(async () => {
    clearLegacyDraft();
    await deleteDraftOnServer();
  }, [deleteDraftOnServer]);

  /* ---- Save draft handler ---- */
  async function handleSaveDraft() {
    const result = await persistDraftToServer(buildDraftPayload());
    setShowDraftToast(true);
    setTimeout(() => setShowDraftToast(false), 2500);
    if (!result.ok) {
      console.warn("[Campaign Create] Draft save failed:", result.message);
    }
  }

  /* ---- Extract campaign ID from receipt ---- */
  const createdCampaignId = useMemo(() => {
    if (!receiptCreate?.logs?.length) return undefined;
    for (const log of receiptCreate.logs) {
      try {
        const d = decodeEventLog({
          abi: campaignRegistryAbi,
          data: log.data,
          topics: log.topics,
        });
        if (d.eventName === "CampaignCreated") {
          return Number((d.args as unknown as { campaignId: bigint }).campaignId);
        }
      } catch {
        continue;
      }
    }
    return undefined;
  }, [receiptCreate]);

  useEffect(() => {
    if (createdCampaignId !== undefined) {
      setResolvedCampaignId(createdCampaignId);
    }
  }, [createdCampaignId]);

  function extractCampaignIdFromReceipt(receipt: any) {
    if (!receipt.logs?.length) return undefined;
    for (const log of receipt.logs) {
      try {
        const d = decodeEventLog({
          abi: campaignRegistryAbi,
          data: log.data,
          topics: log.topics,
        });
        if (d.eventName === "CampaignCreated") {
          return Number((d.args as unknown as { campaignId: bigint }).campaignId);
        }
      } catch {
        continue;
      }
    }
    return undefined;
  }

  async function saveCampaignToDb(
    campaignId: number,
    receipt: { transactionHash: string; blockNumber?: bigint | number },
    ownerAddress: string,
  ) {
    setSubmitStep("saving");

    try {
      const cdpToken = await getCdpAccessToken();

      console.log("[Campaign Create] Saving to DB:", {
        campaignId,
        hasCdpToken: !!cdpToken,
        owner: ownerAddress.toLowerCase(),
      });

      const targetWeiForDb = tryParseUsdc(targetAmount);
      /* step2Valid / canSubmit already enforced a parseable target */
      if (targetWeiForDb === null) {
        throw new Error("Invalid campaign budget for database save.");
      }

      const regionForDb = stateLoc.trim()
        ? `${region.trim()}, ${stateLoc.trim()}`
        : region.trim();

      const payload: Record<string, unknown> = {
        campaignId,
        chainId: config.chainId,
        owner: ownerAddress.toLowerCase(),
        beneficiary: ownerAddress.toLowerCase(),
        targetAmount: targetWeiForDb.toString(),
        milestoneCount: milestones.length,
        metadataUri,
        txHash: receipt.transactionHash,
        blockNumber: Number(receipt.blockNumber ?? 0),
        title,
        description,
        imageUrl,
        region: regionForDb || undefined,
        tags: tags.length ? tags : undefined,
        deadline: deadline || undefined,
        contactEmail: contactEmail || undefined,
        beneficiaryDescription: beneficiaryDescription || undefined,
        socialLinks: socialLinks.length ? socialLinks : undefined,
        impactMetrics: impactMetrics.some((m) => m.name.trim() || m.target.trim())
          ? impactMetrics.filter((m) => m.name.trim() || m.target.trim())
          : undefined,
        milestoneData: milestones,
        organizationId: orgId || undefined,
      };
      if (cdpToken) payload.cdpAccessToken = cdpToken;

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      console.log("[Campaign Create] DB save response:", { ok: json.ok, status: res.status });

      if (!json.ok) {
        setErrorMsg(json.message || "Failed to save campaign to database.");
        setSavedToDb(false);
      } else {
        setSavedToDb(true);
        await purgeDraftStorage();
      }
      setSubmitStep("done");
    } catch (err) {
      console.error("[Campaign Create] saveCampaignToDb error:", err);
      setErrorMsg((err as Error).message || "Failed to save campaign.");
      setSavedToDb(false);
      setSubmitStep("error");
    }
  }

  async function saveCampaignFromReceipt(receipt: any, ownerAddress: string) {
    const campaignId = extractCampaignIdFromReceipt(receipt);
    if (campaignId === undefined) {
      setErrorMsg("Transaction confirmed but could not extract campaign ID.");
      setSubmitStep("error");
      return;
    }

    setResolvedCampaignId(campaignId);
    await saveCampaignToDb(campaignId, receipt, ownerAddress);
  }

  /* ---- CDP Transaction success handler ---- */
  useEffect(() => {
    if (cdpTxError) {
      console.error("[Campaign Create] CDP transaction error:", cdpTxError);
      setErrorMsg(cdpTxError.message || "Transaction failed");
      setSubmitStep("error");
    }
  }, [cdpTxError, submitStep]);

  useEffect(() => {
    if (!pendingUserOperationHash || !cdpUserOperation || submitStep !== "creating") return;
    if (cdpUserOperationError) {
      setErrorMsg(cdpUserOperationError.message || "Failed to confirm user operation.");
      setSubmitStep("error");
      return;
    }
    if (cdpUserOperation.status !== "complete") return;

    const transactionHash = cdpTransactionHash;
    if (!transactionHash || !publicClient || !address) return;

    // CDP may briefly expose a non-final hash-like value. Only query viem with a canonical tx hash.
    if (!hasCanonicalCdpTransactionHash) {
      console.warn("[Campaign Create] Ignoring invalid transaction hash from CDP user operation:", transactionHash);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Poll for the receipt for up to ~45s, since some RPCs index CDP-bundled
        // user operations a bit later even though the dashboard already shows them.
        const maxAttempts = 15;
        const delayMs = 3_000;
        let attempt = 0;
        let receipt = null as Awaited<ReturnType<typeof publicClient.getTransactionReceipt>> | null;

        while (!cancelled && attempt < maxAttempts) {
          attempt += 1;
          try {
            receipt = await publicClient.getTransactionReceipt({
              hash: transactionHash as `0x${string}`,
            });
            break;
          } catch (err) {
            // For viem `TransactionReceiptNotFoundError` keep polling instead of failing the flow.
            if (err instanceof TransactionReceiptNotFoundError) {
              console.warn(
                "[Campaign Create] Receipt not found yet, retrying...",
                { attempt, transactionHash },
              );
              await new Promise((res) => setTimeout(res, delayMs));
              continue;
            }
            throw err;
          }
        }

        if (cancelled || !receipt) {
          console.error("[Campaign Create] Gave up polling for transaction receipt.", {
            transactionHash,
          });
          setErrorMsg(
            "Transaction was sent, but the receipt is still propagating. Please check BaseScan and try again in a moment.",
          );
          setSubmitStep("error");
          return;
        }

        if (receipt.status !== "success") {
          setErrorMsg("Transaction failed on-chain.");
          setSubmitStep("error");
          return;
        }

        await saveCampaignFromReceipt(receipt, address);
      } catch (err) {
        if (cancelled) return;
        console.error("[Campaign Create] Failed to fetch transaction receipt:", err);
        setErrorMsg("Transaction confirmed but the receipt could not be loaded.");
        setSubmitStep("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pendingUserOperationHash,
    cdpUserOperation,
    cdpUserOperationError,
    submitStep,
    publicClient,
    address,
    cdpTransactionHash,
    hasCanonicalCdpTransactionHash,
  ]);
  useEffect(() => {
    console.log("[Campaign Create] Transaction state:", {
      txCreate,
      receiptCreate: receiptCreate ? "present" : "undefined",
      isConfirmingCreate,
      isPendingCreate,
      txCreateError: txCreateError?.message,
      createdCampaignId,
      submitStep,
    });
    if (createdCampaignId !== undefined && submitStep === "creating" && receiptCreate && address) {
      void saveCampaignToDb(createdCampaignId, receiptCreate, address);
    }
  }, [createdCampaignId, submitStep, receiptCreate, isConfirmingCreate, isPendingCreate, txCreate, txCreateError, address]);

  /* ---- Derived validation per step ---- */
  const step1Valid = !!title.trim() && !!description.trim();

  const milestonesComplete =
    milestones.length > 0 &&
    milestones.every(
      (m) => m.title.trim().length > 0 && m.amount.trim().length > 0,
    );

  const targetParse = useMemo(() => {
    if (!targetAmount.trim()) {
      return { wei: BigInt(0), ok: false as const, empty: true as const };
    }
    const w = tryParseUsdc(targetAmount);
    if (w === null || w <= BigInt(0)) {
      return { wei: w ?? BigInt(0), ok: false as const, empty: false as const };
    }
    return { wei: w, ok: true as const, empty: false as const };
  }, [targetAmount]);

  const { milestoneSum, milestoneParseError } = useMemo(() => {
    let sum = BigInt(0);
    for (const m of milestones) {
      if (!m.amount.trim()) continue;
      const w = tryParseUsdc(m.amount);
      if (w === null) {
        return { milestoneSum: BigInt(0), milestoneParseError: true };
      }
      sum += w;
    }
    return { milestoneSum: sum, milestoneParseError: false };
  }, [milestones]);

  const targetWei = targetParse.wei;
  const milestoneSumMatches =
    targetParse.ok && !milestoneParseError && milestoneSum === targetWei;

  /** Percent of campaign budget covered by milestone sums (null = show empty bar until budget is valid). */
  const fundingBarRawPct = useMemo(() => {
    if (milestoneParseError || milestoneSum <= BigInt(0)) return null;
    if (!targetParse.ok || targetWei <= BigInt(0)) return null;
    if (milestoneSum === targetWei) return 100;
    const pct = (Number(milestoneSum) / Number(targetWei)) * 100;
    if (!Number.isFinite(pct) || pct <= 0) return null;
    return pct;
  }, [milestoneParseError, milestoneSum, targetParse.ok, targetWei]);

  /** Track fill width (capped); over-budget still uses 100% width + amber + label. */
  const fundingBarWidthPct =
    fundingBarRawPct == null ? 0 : Math.min(100, fundingBarRawPct);

  const fundingBarOverTarget =
    fundingBarRawPct != null && fundingBarRawPct > 100 + 1e-6;

  const step2Valid =
    targetParse.ok &&
    !milestoneParseError &&
    milestonesComplete &&
    milestoneSumMatches &&
    region.trim().length > 0 &&
    deadline.trim().length > 0;

  const fundingStatusOk =
    milestoneSumMatches && milestonesComplete && !milestoneParseError;
  const fundingNeedsAttention =
    milestoneParseError ||
    (Boolean(targetAmount.trim()) && !targetParse.ok && !targetParse.empty) ||
    (targetParse.ok && !milestonesComplete) ||
    (targetParse.ok && milestonesComplete && !milestoneSumMatches);

  const step3Valid = true;

  const canSubmit =
    isConnected &&
    address &&
    registryAddress &&
    escrowAddress &&
    step1Valid &&
    step2Valid &&
    step3Valid &&
    termsAccepted &&
    orgStatus === "verified" &&
    submitStep === "idle";

  /* ---- Navigation ---- */
  function goNext() {
    void persistDraftToServer(
      buildDraftPayload({ currentStep: currentStep + 1 }),
    );
    setCurrentStep((s) => Math.min(s + 1, 5));
  }

  function goBack() {
    setCurrentStep((s) => Math.max(s - 1, 1));
  }

  function goToStep(step: number) {
    setCurrentStep(step);
  }

  function isStepReachable(step: number): boolean {
    if (step <= 1) return true;
    if (step === 2) return step1Valid;
    if (step === 3) return step1Valid && step2Valid;
    if (step === 4) return step1Valid && step2Valid;
    if (step === 5) return step1Valid && step2Valid && step3Valid;
    return false;
  }

  /* ---- Milestone handlers ---- */
  function addMilestone() {
    setMilestones((prev) => [...prev, { ...EMPTY_MILESTONE }]);
  }

  function updateMilestone(i: number, field: "title" | "description" | "amount", value: string) {
    setMilestones((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  function removeMilestone(i: number) {
    if (milestones.length <= 1) return;
    setMilestones((prev) => prev.filter((_, j) => j !== i));
  }

  /* ---- Image handlers ---- */
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /* ---- Submit ---- */
  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !registryAddress || !escrowAddress) return;

    const target = tryParseUsdc(targetAmount);
    if (target === null || target <= BigInt(0)) {
      setErrorMsg("Enter a valid total budget (USDC).");
      return;
    }
    const amounts: bigint[] = [];
    for (const m of milestones) {
      const w = tryParseUsdc(m.amount);
      if (w === null) {
        setErrorMsg("Each milestone needs a valid USDC amount.");
        return;
      }
      amounts.push(w);
    }
    const sum = amounts.reduce((a, b) => a + b, BigInt(0));
    if (sum !== target) {
      setErrorMsg("Milestone amounts must sum to your campaign budget.");
      return;
    }

    if (!address) {
      setErrorMsg("Please connect your wallet first.");
      return;
    }

    setErrorMsg(null);
    setSubmitStep("uploading");

    let uri: string;
    let imgUrl: string | null = null;
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("description", description.trim());
      form.append("milestones", JSON.stringify(milestones));
      const finalRegion = stateLoc.trim() ? `${region.trim()}, ${stateLoc.trim()}` : region.trim();
      if (finalRegion) form.append("region", finalRegion);
      if (tags.length) form.append("tags", JSON.stringify(tags));
      if (deadline) form.append("deadline", deadline);
      if (beneficiaryDescription.trim()) form.append("beneficiaryDescription", beneficiaryDescription.trim());
      if (contactEmail.trim()) form.append("contactEmail", contactEmail.trim());
      if (socialLinks.length) form.append("socialLinks", JSON.stringify(socialLinks));
      const metricsPayload = impactMetrics.filter((m) => m.name.trim() || m.target.trim());
      if (metricsPayload.length) form.append("impactMetrics", JSON.stringify(metricsPayload));
      if (imageFile) form.append("image", imageFile);

      const metaRes = await fetch("/api/campaigns/metadata", { method: "POST", body: form });
      const metaJson = (await metaRes.json()) as {
        ok: boolean; metadataUri?: string; imageUrl?: string | null; message?: string;
      };

      if (!metaRes.ok || !metaJson.ok || !metaJson.metadataUri) {
        throw new Error(metaJson.message ?? "Failed to upload to IPFS.");
      }
      uri = metaJson.metadataUri;
      imgUrl = metaJson.imageUrl ?? null;
    } catch (err) {
      setErrorMsg((err as Error).message);
      setSubmitStep("error");
      return;
    }

    setMetadataUri(uri);
    setImageUrl(imgUrl);
    setSubmitStep("creating");
    setPendingUserOperationHash(null);

    try {
      if (isSmartWallet && smartAccount) {
        // Use CDP sendUserOperation for smart wallets
        console.log("[Campaign Create] Using CDP sendUserOperation for smart wallet");
        const callData = encodeFunctionData({
          abi: campaignRegistryAbi,
          functionName: "createCampaign",
          args: [address as `0x${string}`, target, milestones.length, uri],
        });
        
        // Explicitly use base-sepolia network
        console.log("[Campaign Create] Sending to base-sepolia network");
        
        const result = await sendUserOperation({
          evmSmartAccount: smartAccount,
          network: "base-sepolia",
          calls: [{
            to: registryAddress as `0x${string}`,
            data: callData,
            value: 0n, // Use bigint instead of string
          }],
          useCdpPaymaster: true,
        });
        setPendingUserOperationHash(result.userOperationHash as `0x${string}`);
      } else {
        // Use wagmi for EOAs
        console.log("[Campaign Create] Using wagmi writeContract for EOA");
        writeRegistry({
          address: registryAddress,
          abi: campaignRegistryAbi,
          functionName: "createCampaign",
          args: [address as `0x${string}`, target, milestones.length, uri],
        });
      }
    } catch (err) {
      setErrorMsg("Failed to create campaign: " + (err as Error).message);
      setSubmitStep("error");
    }
  }, [canSubmit, registryAddress, escrowAddress, address, title, description, targetAmount, milestones, region, stateLoc, tags, deadline, beneficiaryDescription, contactEmail, socialLinks, impactMetrics, imageFile, isSmartWallet, smartAccount, sendUserOperation, writeRegistry]);

  function handleInitEscrow() {
    if (!escrowAddress || createdCampaignId === undefined || !config.usdc) return;
    const amounts: bigint[] = [];
    for (const m of milestones) {
      const w = tryParseUsdc(m.amount);
      if (w === null) return;
      amounts.push(w);
    }
    writeEscrow({
      address: escrowAddress,
      abi: milestoneEscrowAbi,
      functionName: "initializeCampaign",
      args: [BigInt(createdCampaignId), config.usdc, amounts],
      chainId: config.chainId,
    });
  }

  function resetForm() {
    setSubmitStep("idle");
    setErrorMsg(null);
    setMetadataUri(null);
    setImageUrl(null);
    setSavedToDb(false);
    setPendingUserOperationHash(null);
    setCurrentStep(1);
    void purgeDraftStorage();
  }

  /* ---- Submit flow steps ---- */
  const flowSteps = [
    { key: "uploading", label: "Upload to IPFS" },
    { key: "creating", label: "Create on-chain" },
    { key: "saving", label: "Save to database" },
  ] as const;

  function stepIcon(stepKey: string) {
    const order = ["uploading", "creating", "saving", "done"];
    const currentIdx = order.indexOf(submitStep);
    const keyIdx = order.indexOf(stepKey);
    if (submitStep === "done" || currentIdx > keyIdx) {
      return <Icon name="circleCheckmark" size="m" className="text-[var(--ui-brand-green)]" />;
    }
    if (submitStep === stepKey) {
      return <Spinner size={2} />;
    }
    return <div className="h-4 w-4 rounded-full border-2 border-[var(--ui-muted)]" />;
  }

  const isSubmitting = submitStep !== "idle" && submitStep !== "done" && submitStep !== "error";
  const escrowInitialized = receiptInit !== undefined;

  /* ================================================================ */
  /* Render                                                           */
  /* ================================================================ */

  return (
    <main className="app-page px-3 py-6 sm:px-4 sm:py-8 md:px-8">
      <div className="app-surface mx-auto max-w-6xl overflow-hidden rounded-[20px] sm:rounded-[28px]">
        <section className="px-4 pb-6 pt-8 sm:px-6 sm:pb-8 sm:pt-10 md:px-10 md:pb-10 md:pt-12">

          {/* ---- Page header ---- */}
          <div className="mx-auto mb-8 flex max-w-3xl flex-col items-center justify-center text-center">
            <TextTitle1
              as="h1"
              className="app-text text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl !text-center"
            >
              Create <span className="brand-green">Amini Campaign</span>
            </TextTitle1>
          </div>

          {/* ---- Draft restored banner ---- */}
          {draftRestored && submitStep === "idle" && (
            <div className="mx-auto mb-6 max-w-3xl">
              <Banner
                variant="informational"
                startIcon="info"
                startIconActive
                styleVariant="contextual"
                borderRadius={400}
                title="Draft restored from your last session"
                style={{ padding: '0.75rem 1.25rem' }}
                showDismiss
                onClose={() => {
                  void purgeDraftStorage();
                  setDraftRestored(false);
                  resetForm();
                  setTitle(""); setDescription(""); setBeneficiaryDescription(""); setContactEmail("");
                  setSocialLinks([]); setImpactMetrics([]); setTargetAmount(""); setDeadline("");
                  setRegion(""); setStateLoc(""); setTags([]); setMilestones([{ ...EMPTY_MILESTONE }]);
                  setAttestationService("");
                }}
              >
                Your previously saved campaign draft has been loaded. Dismiss to start fresh.
              </Banner>
            </div>
          )}

          {/* ---- Wallet / contract warnings ---- */}
          {!isConnected && (
            <div className="mx-auto mb-6 max-w-3xl">
              <Banner
                variant="warning"
                startIcon="warning"
                startIconActive
                styleVariant="contextual"
                borderRadius={400}
                title="Wallet not connected"
                style={{ padding: '0.75rem 1.25rem' }}
              >
                Connect your wallet to create a campaign.
              </Banner>
            </div>
          )}
          {isConnected && (!registryAddress || !escrowAddress) && (
            <div className="mx-auto mb-6 max-w-3xl">
              <Banner
                variant="warning"
                startIcon="warning"
                startIconActive
                styleVariant="contextual"
                borderRadius={400}
                title="Contract addresses not configured"
                style={{ padding: '0.75rem 1.25rem' }}
              >
                Set NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS and NEXT_PUBLIC_ESCROW_ADDRESS in your .env
              </Banner>
            </div>
          )}

          {/* ---- Organization gate banner ---- */}
          {isConnected && orgStatus === "loading" && (
            <div className="mx-auto mb-6 max-w-3xl">
              <Banner
                variant="informational"
                startIcon="info"
                startIconActive
                styleVariant="contextual"
                borderRadius={400}
                title="Checking organization status"
                style={{ padding: '0.75rem 1.25rem' }}
              >
                Verifying your wallet is linked to an approved organization...
              </Banner>
            </div>
          )}
          {isConnected && orgStatus === "verified" && (
            <div className="mx-auto mb-6 max-w-3xl">
              <Banner
                variant="promotional"
                startIcon="verifiedBadge"
                startIconActive
                styleVariant="contextual"
                borderRadius={400}
                title={`${orgName} — Verified Organization`}
                style={{ padding: '0.75rem 1.25rem' }}
              >
                Your organization is verified. You can create campaigns.
              </Banner>
            </div>
          )}
          {isConnected && (orgStatus === "unverified" || orgStatus === "none") && (
            <div className="mx-auto mb-6 max-w-3xl">
              <Banner
                variant="error"
                startIcon="warning"
                startIconActive
                styleVariant="contextual"
                borderRadius={400}
                title="Only verified organizations can create campaigns"
                style={{ padding: '0.75rem 1.25rem' }}
                primaryAction={<Link href="/organizations/register" className="text-sm font-semibold underline underline-offset-2">Register Organization</Link>}
              >
                {orgStatus === "unverified"
                  ? `Your organization "${orgName}" is pending verification. Please wait for admin approval.`
                  : "Your wallet is not linked to any organization. Register your organization to get started."}
              </Banner>
            </div>
          )}

          <div className="mx-auto max-w-3xl">
            {submitStep === "idle" && (
              <CampaignCreateStepper
                currentStep={currentStep}
                goToStep={goToStep}
                isStepReachable={isStepReachable}
              />
            )}

            {/* ---- Submit progress ---- */}
            {submitStep !== "idle" && submitStep !== "done" && submitStep !== "error" && (
              <div className="campaign-card mb-6">
                <TextLabel1 as="p" className="app-text mb-4">Creating your campaign...</TextLabel1>
                <div className="space-y-3">
                  {flowSteps.map((s) => (
                    <div key={s.key} className="flex items-center gap-3">
                      {stepIcon(s.key)}
                      <span className={submitStep === s.key ? "app-text font-medium" : "app-muted text-sm"}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
                {errorMsg && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {errorMsg}
                  </div>
                )}
              </div>
            )}

            {/* ---- Success ---- */}
            {submitStep === "done" && resolvedCampaignId !== undefined && (
              <div className="campaign-card mb-6">
                <div className="mb-4 flex items-center gap-2">
                  <Icon name="circleCheckmark" size="l" className="text-[var(--ui-brand-green)]" />
                  <Tag colorScheme="green" emphasis="high">Campaign #{resolvedCampaignId} created!</Tag>
                </div>
                {savedToDb && (
                  <TextCaption as="p" className="app-muted mb-3">Campaign saved. You can now enable funding.</TextCaption>
                )}
                <div className="flex flex-wrap gap-3 mt-4">
                  {!escrowInitialized ? (
                    <Button
                      variant="primary"
                      className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                      onClick={handleInitEscrow}
                      disabled={!escrowAddress || isPendingInit || isConfirmingInit}
                    >
                      {isPendingInit || isConfirmingInit ? "Setting up..." : "Enable Funding"}
                    </Button>
                  ) : (
                    <Tag colorScheme="green" emphasis="high" start={<Icon name="circleCheckmark" size="xs" />}>Funding enabled</Tag>
                  )}
                  <Button as={Link} href={"/campaigns/" + resolvedCampaignId} variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                    View campaign <Icon name="arrowRight" size="s" className="inline" />
                  </Button>
                  <Button variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2" onClick={resetForm}>Create another</Button>
                </div>
              </div>
            )}

            {/* ---- Error ---- */}
            {submitStep === "error" && (
              <div className="mx-auto mb-6 max-w-3xl">
                <Banner
                  variant="error"
                  startIcon="error"
                  startIconActive
                  styleVariant="contextual"
                  borderRadius={400}
                  title="Campaign creation failed"
                >
                  {errorMsg ?? "Something went wrong."}
                </Banner>
                <div className="mt-3">
                  <Button variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2" onClick={() => setSubmitStep("idle")}>Try again</Button>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 1: Campaign Details                                     */}
            {/* ============================================================ */}
            {submitStep === "idle" && currentStep === 1 && (
              <div className="wizard-step-content">
                <div className={cn(WIZARD_CARD_CLASS)}>
                  {/* Campaign Name */}
                  <div className="campaign-field">
                    <label className="campaign-label">
                      Campaign Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="campaign-input"
                      placeholder="e.g. Amini Swahili School: Phase 2"
                    />
                  </div>

                  {/* Campaign Description */}
                  <div className="campaign-field">
                    <label className="campaign-label">Campaign Description <span className="text-red-500">*</span></label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="campaign-textarea"
                      placeholder="Describe the project goals, timeline, and expected impact..."
                      rows={5}
                    />
                  </div>

                  {/* Campaign Photo */}
                  <div className="campaign-field">
                    <label className="campaign-label">Cover Photo</label>
                    <p className="campaign-validation-note mb-3">
                      Max 5 MB <span className="mx-1 op-50">•</span> JPEG, PNG, WEBP, or GIF
                    </p>
                    {imagePreview ? (
                      <div className="relative overflow-hidden rounded-xl border border-[var(--ui-border)]">
                        <img src={imagePreview} alt="Preview" className="h-48 w-full object-cover" />
                        <button
                          type="button"
                          onClick={clearImage}
                          className="absolute right-3 top-3 rounded-full bg-black/70 p-2 text-white transition-all hover:bg-black/90"
                        >
                          <Icon name="trashCan" size="s" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 p-10 transition-all hover:border-[var(--ui-brand-green)] hover:bg-[var(--ui-surface-elev)] dark:border-[var(--ui-border)]"
                      >
                        <Icon name="upload" size="l" className="text-gray-400" />
                        <span className="text-sm text-gray-500 dark:text-[var(--ui-muted)]">Click to upload or drag and drop</span>
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageChange} className="hidden" />
                  </div>

                  {/* Beneficiary Description */}
                  <div className="campaign-field">
                    <label className="campaign-label">Beneficiary / Who Benefits <span className="app-muted font-normal text-xs">(recommended)</span></label>
                    <input
                      type="text"
                      value={beneficiaryDescription}
                      onChange={(e) => setBeneficiaryDescription(e.target.value)}
                      className="campaign-input"
                      placeholder="e.g. Mombasa Community Health Center"
                    />
                  </div>

                  {/* Contact Email */}
                  <div className="campaign-field">
                    <label className="campaign-label">Contact Email <span className="app-muted font-normal text-xs">(recommended)</span></label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="campaign-input"
                      placeholder="you@organization.org"
                    />
                    {contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) && (
                      <p className="mt-1 text-xs text-red-500">Invalid email format</p>
                    )}
                  </div>

                  {/* Social / Proof Links */}
                  <div className="campaign-field">
                    <label className="campaign-label">Social & Proof Links <span className="app-muted font-normal text-xs">(optional, max 5)</span></label>
                    {socialLinks.map((link, i) => (
                      <div key={i} className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => {
                            const next = [...socialLinks];
                            next[i] = { ...next[i], label: e.target.value };
                            setSocialLinks(next);
                          }}
                          className="campaign-input w-1/3"
                          placeholder="Label (e.g. Website)"
                        />
                        <input
                          type="url"
                          value={link.url}
                          onChange={(e) => {
                            const next = [...socialLinks];
                            next[i] = { ...next[i], url: e.target.value };
                            setSocialLinks(next);
                          }}
                          className="campaign-input flex-1"
                          placeholder="https://..."
                        />
                        <button type="button" onClick={() => setSocialLinks((prev) => prev.filter((_, j) => j !== i))} className="campaign-milestone-remove" title="Remove">
                          <Icon name="trashCan" size="s" />
                        </button>
                      </div>
                    ))}
                    {socialLinks.length < 5 && (
                      <button type="button" onClick={() => setSocialLinks((prev) => [...prev, { label: "", url: "" }])} className="campaign-add-milestone-btn mt-2">
                        + Add Link
                      </button>
                    )}
                  </div>

                  <div className="mt-8 flex flex-col gap-3 border-t border-[var(--ui-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="hidden min-h-[44px] sm:block sm:min-w-[7rem]" aria-hidden />
                    <div className="flex w-full flex-wrap justify-end gap-2 sm:ml-auto sm:w-auto sm:gap-3">
                      <Button
                        variant="secondary"
                        className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                        start={<Icon name="save" size="s" />}
                        onClick={handleSaveDraft}
                      >
                        Save draft
                      </Button>
                      <Button
                        variant="primary"
                        className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                        end={<ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />}
                        onClick={goNext}
                        disabled={!step1Valid}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="mt-6 text-center text-sm text-[var(--ui-muted)]">
                  Step 1 of 5: {STEPS[0].label}
                </p>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 2: Budget & milestones                                  */}
            {/* ============================================================ */}
            {submitStep === "idle" && currentStep === 2 && (
              <div className="wizard-step-content">
                <div className={cn(WIZARD_CARD_CLASS)}>
                  <h2 className="text-xl font-bold tracking-tight text-[var(--ui-text)] sm:text-2xl">
                    Budget & milestones
                  </h2>
                  <TextBody as="p" className="app-muted mt-2 mb-6 text-sm leading-relaxed sm:text-[15px]">
                    Set your total budget first—it is the single source of truth. Milestone payouts are slices of that
                    budget and must add up exactly. Optional outcomes mirror how programs like{" "}
                    <span className="font-medium text-[var(--ui-text)]">Karma GAP</span> expect measurable indicators.
                  </TextBody>

                  {/* —— Campaign budget (reference for milestones + bar) —— */}
                  <div
                    className="mb-8 rounded-2xl border border-[color-mix(in_oklab,var(--ui-brand-green)_28%,var(--ui-border))] bg-[color-mix(in_oklab,var(--ui-brand-green)_7%,transparent)] p-5 sm:p-6"
                  >
                    <div className="mb-4 flex flex-col gap-1">
                      <TextLabel1 as="h3" className="app-text text-base font-bold">
                        Campaign budget
                      </TextLabel1>
                      <TextBody as="p" className="app-muted text-sm leading-relaxed">
                        This total is what you raise and what escrow allocates across milestones. Enter it before
                        splitting amounts below—all milestone USDC values should refer back to this budget.
                      </TextBody>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="campaign-field sm:col-span-1">
                        <label className="campaign-label">
                          Total budget (USDC) <span className="text-red-500">*</span>
                        </label>
                        <div className="campaign-input-icon-wrapper">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={targetAmount}
                            onChange={(e) => setTargetAmount(e.target.value)}
                            className="campaign-input campaign-input-with-icon font-medium tabular-nums"
                            placeholder="e.g. 50000"
                          />
                          <span className="campaign-input-icon">
                            <Icon name="cash" size="s" />
                          </span>
                        </div>
                      </div>
                      <div className="campaign-field sm:col-span-1">
                        <label className="campaign-label">Campaign deadline <span className="text-red-500">*</span></label>
                        <input
                          type="date"
                          value={deadline}
                          onChange={(e) => setDeadline(e.target.value)}
                          min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                          className="campaign-input"
                        />
                      </div>
                    </div>
                  </div>

                  <TextLabel2 as="h3" className="app-text mb-3 text-sm font-semibold tracking-wide">
                    Location & tags
                  </TextLabel2>

                  {/* Location & Cause */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="campaign-field">
                      <label className="campaign-label">Location / Region <span className="text-red-500">*</span></label>
                      <input 
                        type="text" 
                        value={region} 
                        onChange={(e) => setRegion(e.target.value)} 
                        className="campaign-input" 
                        placeholder="e.g. Nairobi, Kenya" 
                      />
                    </div>
                    <div className="campaign-field">
                      <label className="campaign-label">State / Province <span className="app-muted font-normal text-xs">(optional)</span></label>
                      <input 
                        type="text" 
                        value={stateLoc} 
                        onChange={(e) => setStateLoc(e.target.value)} 
                        className="campaign-input" 
                        placeholder="e.g. Rift Valley" 
                      />
                    </div>
                    <div className="campaign-field sm:col-span-2">
                      <label className="campaign-label">Cause Tags <span className="app-muted font-normal text-xs">(select up to 3)</span></label>
                      <div className="flex flex-wrap gap-2">
                        {CAUSE_OPTIONS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => {
                              setTags((prev) => {
                                if (prev.includes(c.value)) return prev.filter((t) => t !== c.value);
                                if (prev.length >= 3) return prev;
                                return [...prev, c.value];
                              });
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                              tags.includes(c.value)
                                ? "border-[var(--ui-brand-green)] bg-[color-mix(in_oklab,var(--ui-brand-green)_12%,transparent)] text-[var(--ui-brand-green)]"
                                : "border-[var(--ui-border)] bg-transparent app-muted hover:border-[var(--ui-brand-green)] hover:text-[var(--ui-brand-green)]"
                            }`}
                          >
                            {tags.includes(c.value) ? <Icon name="circleCheckmark" size="xs" className="mr-1 inline-block" /> : ""}{c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Milestones — split budget */}
                  <div className="mt-8">
                    <label className="campaign-label mb-1 block">
                      Split your budget into milestones <span className="text-red-500">*</span>
                    </label>
                    <TextCaption as="p" className="app-muted mb-4 max-w-3xl text-sm leading-relaxed">
                      Each row is a tranche of your total budget (USDC). Titles and descriptions are what you will
                      deliver; amounts must add up to exactly your campaign budget above.
                    </TextCaption>
                    {milestones.map((m, i) => (
                      <div key={i} className="campaign-milestone-block mb-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4 dark:bg-[var(--ui-surface)]">
                        <div className="campaign-milestone-header mb-3">
                          <span className="campaign-milestone-label font-semibold">Milestone {i + 1}</span>
                          {milestones.length > 1 && (
                            <button type="button" onClick={() => removeMilestone(i)} className="campaign-milestone-remove" title="Remove">
                              <Icon name="trashCan" size="s" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input
                            type="text"
                            value={m.title}
                            onChange={(e) => updateMilestone(i, "title", e.target.value)}
                            className="campaign-input"
                            placeholder="e.g. Foundation & Walls"
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            value={m.amount}
                            onChange={(e) => updateMilestone(i, "amount", e.target.value)}
                            className="campaign-input tabular-nums"
                            placeholder="USDC from budget (e.g. 15000)"
                          />
                        </div>
                        <textarea
                          value={m.description}
                          onChange={(e) => updateMilestone(i, "description", e.target.value)}
                          className="campaign-textarea mt-3 text-sm"
                          placeholder="Deliverables, verification, proof of work for this tranche…"
                          rows={2}
                        />
                      </div>
                    ))}
                    <button type="button" onClick={addMilestone} className="campaign-add-milestone-btn">
                      + Add Milestone
                    </button>
                  </div>

                  {/* Budget allocation — milestone sums vs total budget */}
                  {(targetAmount.trim().length > 0 ||
                    milestones.some((m) => m.amount.trim() || m.title.trim())) && (
                    <div className="mt-6 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4 dark:bg-[var(--ui-surface)]">
                      <TextCaption as="p" className="app-muted mb-2 block text-[11px] font-semibold uppercase tracking-wider">
                        Budget allocation
                      </TextCaption>
                      <div className="w-full rounded-full h-2 bg-[color-mix(in_oklab,var(--ui-border)_35%,transparent)]">
                        <div
                          className={`h-2 min-w-px rounded-full transition-[width] duration-200 ease-out ${
                            fundingBarOverTarget
                              ? "bg-[var(--ui-brand-amber)]"
                              : "bg-[var(--ui-brand-green)]"
                          }`}
                          style={{ width: `${fundingBarWidthPct}%` }}
                        />
                      </div>
                      {fundingBarRawPct != null && targetParse.ok && (
                        <TextCaption as="p" className="app-muted mt-1.5 text-[11px] leading-snug tabular-nums">
                          {fundingBarOverTarget
                            ? `${fundingBarRawPct.toFixed(1)}% of budget — milestone total exceeds campaign budget`
                            : `${fundingBarRawPct.toFixed(1)}% of budget allocated in milestones`}
                        </TextCaption>
                      )}
                      {fundingBarRawPct == null && milestoneSum > BigInt(0) && !milestoneParseError && (
                        <TextCaption as="p" className="app-muted mt-1.5 text-[11px] leading-snug">
                          Enter a valid total budget above to show how much of it your milestones cover.
                        </TextCaption>
                      )}
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <TextCaption as="span" className="app-muted block">
                            Milestone payouts vs budget
                          </TextCaption>
                          {targetParse.ok ? (
                            <TextCaption as="span" className="app-text mt-0.5 block font-medium tabular-nums">
                              {formatUsdc(milestoneSum)} / {formatUsdc(targetWei)} USDC
                            </TextCaption>
                          ) : targetAmount.trim() && !targetParse.empty ? (
                            <TextCaption as="span" className="app-muted mt-0.5 block">
                              Fix total budget to compare milestone totals
                            </TextCaption>
                          ) : milestoneSum > BigInt(0) ? (
                            <TextCaption as="span" className="app-muted mt-0.5 block tabular-nums">
                              Parsed milestones: {formatUsdc(milestoneSum)} USDC — set budget above to reconcile
                            </TextCaption>
                          ) : null}
                        </div>
                        <TextCaption
                          as="span"
                          className={
                            fundingStatusOk
                              ? "text-[var(--ui-brand-green)] font-semibold"
                              : fundingNeedsAttention
                                ? "text-[var(--ui-brand-amber)] font-semibold"
                                : "app-muted"
                          }
                        >
                          {milestoneParseError ? (
                            <span className="flex items-center gap-1">
                              <Icon name="warning" size="xs" /> Use valid numbers for each amount
                            </span>
                          ) : targetAmount.trim() && !targetParse.ok && !targetParse.empty ? (
                            <span className="flex items-center gap-1">
                              <Icon name="warning" size="xs" /> Enter a valid total budget
                            </span>
                          ) : targetParse.ok && !milestonesComplete ? (
                            <span className="flex items-center gap-1">
                              <Icon name="warning" size="xs" /> Complete every milestone (title + amount), or remove
                              an empty row
                            </span>
                          ) : targetParse.ok && milestonesComplete && !milestoneSumMatches ? (
                            milestoneSum < targetWei ? (
                              <span className="flex items-center gap-1">
                                <Icon name="warning" size="xs" /> Short by{" "}
                                {formatUsdc(targetWei - milestoneSum)} USDC
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Icon name="warning" size="xs" /> Over by{" "}
                                {formatUsdc(milestoneSum - targetWei)} USDC
                              </span>
                            )
                          ) : fundingStatusOk ? (
                            <span className="flex items-center gap-1">
                              <Icon name="circleCheckmark" size="xs" /> Milestones match budget
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              Set your total budget, then allocate it across milestones
                            </span>
                          )}
                        </TextCaption>
                      </div>
                    </div>
                  )}

                  <div className="mt-8 flex flex-col gap-3 border-t border-[var(--ui-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      variant="secondary"
                      className="campaign-btn-draft order-2 w-full sm:order-1 sm:w-auto [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                      start={<ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />}
                      onClick={goBack}
                    >
                      Back
                    </Button>
                    <div className="order-1 flex w-full flex-wrap justify-end gap-2 sm:order-2 sm:w-auto sm:gap-3">
                      <Button
                        variant="secondary"
                        className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                        start={<Icon name="save" size="s" />}
                        onClick={handleSaveDraft}
                      >
                        Save draft
                      </Button>
                      <Button
                        variant="primary"
                        className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                        end={<ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />}
                        onClick={goNext}
                        disabled={!step2Valid}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="mt-6 text-center text-sm text-[var(--ui-muted)]">
                  Step 2 of 5: {STEPS[1].label}
                </p>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 3: Expected outcomes                                    */}
            {/* ============================================================ */}
            {submitStep === "idle" && currentStep === 3 && (
              <div className="wizard-step-content">
                <div className={cn(WIZARD_CARD_CLASS)}>
                  <h2 className="text-xl font-bold tracking-tight text-[var(--ui-text)] sm:text-2xl">
                    Expected outcomes & measurement
                  </h2>
                  <TextBody as="p" className="app-muted mt-2 mb-4 text-sm leading-relaxed sm:text-[15px]">
                    Define a small set of outcome indicators so donors and evaluators can see what success looks like.
                    This is optional but strongly recommended—similar to how programs like{" "}
                    <span className="font-medium text-[var(--ui-text)]">Karma GAP</span> structure project reporting.
                  </TextBody>

                  <ul className="app-muted mb-4 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                    <li>
                      <span className="font-medium text-[var(--ui-text)]">Indicator</span> — what you measure (people,
                      kWh, hectares, sessions…).
                    </li>
                    <li>
                      <span className="font-medium text-[var(--ui-text)]">Target / deliverable</span> — the concrete
                      result or threshold (“200 households”, “portal live with 50 orgs”).
                    </li>
                    <li>
                      <span className="font-medium text-[var(--ui-text)]">Horizon</span> — when you expect to report
                      (near-, mid-, or long-term).
                    </li>
                  </ul>

                  <div className="mt-2 space-y-3">
                    {impactMetrics.map((metric, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4 dark:bg-[var(--ui-surface)]"
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <TextCaption as="span" className="text-[11px] font-bold uppercase tracking-wider text-[var(--ui-muted)]">
                            Outcome {i + 1}
                          </TextCaption>
                          <button
                            type="button"
                            onClick={() => setImpactMetrics((prev) => prev.filter((_, j) => j !== i))}
                            className="campaign-milestone-remove shrink-0"
                            title="Remove"
                          >
                            <Icon name="trashCan" size="s" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                          <div className="lg:col-span-5">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                              Indicator
                            </label>
                            <input
                              type="text"
                              value={metric.name}
                              onChange={(e) => {
                                const next = [...impactMetrics];
                                next[i] = { ...next[i], name: e.target.value };
                                setImpactMetrics(next);
                              }}
                              className="campaign-input w-full"
                              placeholder="e.g. Community members trained"
                            />
                          </div>
                          <div className="lg:col-span-3">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                              Time horizon
                            </label>
                            <select
                              value={metric.timeframe ?? ""}
                              onChange={(e) => {
                                const next = [...impactMetrics];
                                next[i] = { ...next[i], timeframe: e.target.value };
                                setImpactMetrics(next);
                              }}
                              className="campaign-select w-full"
                            >
                              {METRIC_TIMEFRAME_OPTIONS.map((o) => (
                                <option key={o.value || "none"} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="lg:col-span-4">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                              Target / deliverable
                            </label>
                            <textarea
                              value={metric.target}
                              onChange={(e) => {
                                const next = [...impactMetrics];
                                next[i] = { ...next[i], target: e.target.value };
                                setImpactMetrics(next);
                              }}
                              className="campaign-textarea min-h-[4rem] w-full text-sm"
                              placeholder="e.g. 350 people complete certification — evidence: attendance sheets + test scores"
                              rows={3}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setImpactMetrics((prev) => [...prev, { ...EMPTY_IMPACT_METRIC }])}
                    className="campaign-add-milestone-btn mt-4"
                  >
                    + Add outcome indicator
                  </button>

                  <div className="mt-8 flex flex-col gap-3 border-t border-[var(--ui-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      variant="secondary"
                      className="campaign-btn-draft order-2 w-full sm:order-1 sm:w-auto [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                      start={<ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />}
                      onClick={goBack}
                    >
                      Back
                    </Button>
                    <div className="order-1 flex w-full flex-wrap justify-end gap-2 sm:order-2 sm:w-auto sm:gap-3">
                      <Button
                        variant="secondary"
                        className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                        start={<Icon name="save" size="s" />}
                        onClick={handleSaveDraft}
                      >
                        Save draft
                      </Button>
                      <Button
                        variant="primary"
                        className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                        end={<ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />}
                        onClick={goNext}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="mt-6 text-center text-sm text-[var(--ui-muted)]">
                  Step 3 of 5: {STEPS[2].label}
                </p>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 4: Verification & Escrow                                */}
            {/* ============================================================ */}
            {submitStep === "idle" && currentStep === 4 && (
              <div className="wizard-step-content">
                <div className={cn(WIZARD_CARD_CLASS)}>
                  <h2 className="text-xl font-bold tracking-tight text-[var(--ui-text)] sm:text-2xl">
                    Verification & escrow
                  </h2>
                  <TextBody as="p" className="app-muted mt-2 mb-6 text-sm leading-relaxed sm:text-[15px]">
                    Configure attestation requirements and payment options.
                  </TextBody>

                  <div className="campaign-field">
                    <label className="campaign-label">Attestation Service</label>
                    <select value={attestationService} onChange={(e) => setAttestationService(e.target.value)} className="campaign-select">
                      {VALIDATORS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                  </div>

                  {/* Toggle: Permanent Storage */}
                  <div className="campaign-toggle-row">
                    <div className="campaign-toggle-info">
                      <span className="campaign-toggle-icon campaign-toggle-icon-green"><Icon name="folder" size="xs" /></span>
                      <div>
                        <span className="campaign-toggle-text">Permanent Storage (IPFS)</span>
                        <p className="campaign-toggle-subtext">Receipts and proofs pinned via Filebase</p>
                      </div>
                    </div>
                    <label className="campaign-toggle">
                      <input type="checkbox" checked={permanentStorage} onChange={(e) => setPermanentStorage(e.target.checked)} />
                      <span className="campaign-toggle-slider"></span>
                    </label>
                  </div>

                  <div className="mt-8 flex flex-col gap-3 border-t border-[var(--ui-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      variant="secondary"
                      className="campaign-btn-draft order-2 w-full sm:order-1 sm:w-auto [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                      start={<ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />}
                      onClick={goBack}
                    >
                      Back
                    </Button>
                    <div className="order-1 flex w-full flex-wrap justify-end gap-2 sm:order-2 sm:w-auto sm:gap-3">
                      <Button
                        variant="secondary"
                        className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                        start={<Icon name="save" size="s" />}
                        onClick={handleSaveDraft}
                      >
                        Save draft
                      </Button>
                      <Button
                        variant="primary"
                        className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                        end={<ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />}
                        onClick={goNext}
                        disabled={!step3Valid}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="mt-6 text-center text-sm text-[var(--ui-muted)]">
                  Step 4 of 5: {STEPS[3].label}
                </p>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 5: Review & Launch                                      */}
            {/* ============================================================ */}
            {submitStep === "idle" && currentStep === 5 && (
              <div className="wizard-step-content">
                <div className={cn(WIZARD_CARD_CLASS)}>
                  <h2 className="text-xl font-bold tracking-tight text-[var(--ui-text)] sm:text-2xl">
                    Review & launch
                  </h2>
                  <TextBody as="p" className="app-muted mt-2 mb-6 text-sm leading-relaxed sm:text-[15px]">
                    Review all details before creating your campaign on-chain.
                  </TextBody>

                  {/* Section: Campaign Details */}
                  <div className="wizard-review-section bg-[var(--ui-surface-elev)]/30 p-5 rounded-2xl mb-4 border border-[var(--ui-border)]">
                    <div className="wizard-review-header">
                      <TextLabel1 as="h3" className="brand-green font-bold text-base">Campaign Details</TextLabel1>
                      <button type="button" onClick={() => goToStep(1)} className="wizard-review-edit">
                        <Icon name="pencil" size="s" className="mr-1" /> Edit
                      </button>
                    </div>
                    <div className="wizard-review-grid flex flex-col sm:grid sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <TextCaption as="span" className="text-[var(--ui-muted)] dark:text-gray-400 text-[11px] uppercase tracking-wider font-bold">Name</TextCaption>
                        <TextBody as="p" className="app-text font-medium">{title || "—"}</TextBody>
                      </div>
                      <div className="flex flex-col gap-1">
                        <TextCaption as="span" className="text-[var(--ui-muted)] dark:text-gray-400 text-[11px] uppercase tracking-wider font-bold">Description</TextCaption>
                        <TextBody as="p" className="app-text text-sm">{description || "—"}</TextBody>
                      </div>
                    </div>
                    {imagePreview && (
                      <img src={imagePreview} alt="Cover" className="mt-3 h-32 w-full rounded-lg object-cover" />
                    )}
                  </div>

                  {/* Section: Budget, milestones & outcomes */}
                  <div className="wizard-review-section bg-[var(--ui-surface-elev)]/30 p-5 rounded-2xl mb-4 border border-[var(--ui-border)]">
                    <div className="wizard-review-header">
                      <TextLabel1 as="h3" className="brand-green font-bold text-base">Budget, milestones & outcomes</TextLabel1>
                      <button type="button" onClick={() => goToStep(2)} className="wizard-review-edit">
                        <Icon name="pencil" size="s" className="mr-1" /> Edit
                      </button>
                    </div>
                    <div className="wizard-review-grid flex flex-col sm:grid sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <TextCaption as="span" className="text-[var(--ui-muted)] dark:text-gray-400 text-[11px] uppercase tracking-wider font-bold">Total budget</TextCaption>
                        <TextBody as="p" className="app-text font-medium">{targetAmount ? `${targetAmount} USDC` : "—"}</TextBody>
                      </div>
                      <div className="flex flex-col gap-1">
                        <TextCaption as="span" className="text-[var(--ui-muted)] dark:text-gray-400 text-[11px] uppercase tracking-wider font-bold">Location / Tags</TextCaption>
                        <TextBody as="p" className="app-text text-sm">
                          {region ? (stateLoc ? `${region}, ${stateLoc}` : region) : "—"}
                          {tags.length > 0 && <><span className="mx-1 op-50">•</span> {tags.map((t) => CAUSE_OPTIONS.find((c) => c.value === t)?.label || t).join(", ")}</>}
                        </TextBody>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {milestones.map((m, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-4 py-2.5 dark:bg-[var(--ui-surface)]">
                          <div>
                            <TextBody as="span" className="app-text text-sm font-medium">{m.title || `Milestone ${i + 1}`}</TextBody>
                          </div>
                          <Tag colorScheme="green" emphasis="low">{m.amount} USDC</Tag>
                        </div>
                      ))}
                    </div>
                    {impactMetrics.some((m) => m.name.trim() || m.target.trim()) && (
                      <div className="mt-4 border-t border-[var(--ui-border)] pt-4">
                        <TextCaption as="p" className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--ui-muted)]">
                          Expected outcomes
                        </TextCaption>
                        <ul className="space-y-2">
                          {impactMetrics
                            .filter((m) => m.name.trim() || m.target.trim())
                            .map((m, i) => (
                              <li
                                key={i}
                                className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-3 py-2.5 text-sm dark:bg-[var(--ui-surface)]"
                              >
                                <TextBody as="p" className="app-text font-medium">{m.name || "—"}</TextBody>
                                {m.timeframe ? (
                                  <TextCaption as="p" className="app-muted mt-0.5 text-xs">
                                    {METRIC_TIMEFRAME_OPTIONS.find((o) => o.value === m.timeframe)?.label || m.timeframe}
                                  </TextCaption>
                                ) : null}
                                <TextBody as="p" className="app-muted mt-1 text-xs leading-relaxed whitespace-pre-wrap">
                                  {m.target || "—"}
                                </TextBody>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Section: Verification & Escrow */}
                  <div className="wizard-review-section bg-[var(--ui-surface-elev)]/30 p-5 rounded-2xl border border-[var(--ui-border)]">
                    <div className="wizard-review-header">
                      <TextLabel1 as="h3" className="brand-green font-bold text-base">Verification & Escrow</TextLabel1>
                      <button type="button" onClick={() => goToStep(4)} className="wizard-review-edit">
                        <Icon name="pencil" size="s" className="mr-1" /> Edit
                      </button>
                    </div>
                    <div className="wizard-review-grid flex flex-col sm:grid sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <TextCaption as="span" className="text-[var(--ui-muted)] dark:text-gray-400 text-[11px] uppercase tracking-wider font-bold">Beneficiary Account</TextCaption>
                        <TextBody as="p" className="app-text font-mono text-sm leading-tight">
                          {address ? `${address.slice(0, 10)}...${address.slice(-6)}` : "—"}
                        </TextBody>
                      </div>
                      <div className="flex flex-col gap-1">
                        <TextCaption as="span" className="text-[var(--ui-muted)] dark:text-gray-400 text-[11px] uppercase tracking-wider font-bold">Attestation</TextCaption>
                        <TextBody as="p" className="app-text text-sm leading-tight">
                          {VALIDATORS.find((v) => v.value === attestationService)?.label || "None"}
                        </TextBody>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {permanentStorage && <Tag colorScheme="green" emphasis="low" start={<Icon name="folder" size="xs" />}>IPFS Storage</Tag>}
                      {!permanentStorage && (
                        <TextCaption as="span" className="app-muted">No optional features enabled</TextCaption>
                      )}
                    </div>
                  </div>

                {/* Terms Acknowledgment */}
                <div className="mt-6 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)]/80 p-4 dark:bg-[var(--ui-surface)]">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-[var(--ui-brand-green)]"
                    />
                    <TextBody as="span" className="app-text text-sm leading-relaxed">
                      terms and conditions place holder
                    </TextBody>
                  </label>
                </div>

                {process.env.NODE_ENV === "development" && (
                  <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-left text-gray-800 dark:text-gray-200">
                    <p><strong>Debug Validation:</strong></p>
                    <p>isConnected: {String(isConnected)}</p>
                    <p>hasAddress: {String(!!address)}</p>
                    <p>hasRegistryAddress: {String(!!registryAddress)}</p>
                    <p>hasEscrowAddress: {String(!!escrowAddress)}</p>
                    <p>step1Valid: {String(step1Valid)} (title: {title.length}, desc: {description.length})</p>
                    <p>step2Valid: {String(step2Valid)}</p>
                    <p>- targetAmount: {String(!!targetAmount)}</p>
                    <p>- targetWei: {targetWei.toString()}</p>
                    <p>- milestoneSum: {milestoneSum.toString()}</p>
                    <p>
                      - fundingBar: raw% {fundingBarRawPct == null ? "null" : fundingBarRawPct.toFixed(4)}, width{" "}
                      {String(fundingBarWidthPct)}, over {String(fundingBarOverTarget)}
                    </p>
                    <p>
                      - showFundingPanel:{" "}
                      {String(
                        Boolean(
                          targetAmount.trim().length > 0 ||
                            milestones.some((m) => m.amount.trim() || m.title.trim()),
                        ),
                      )}
                    </p>
                    <p>- milestonesComplete: {String(milestonesComplete)}</p>
                    <p>- milestoneParseError: {String(milestoneParseError)}</p>
                    <p>- targetParse.ok: {String(targetParse.ok)}</p>
                    <p>- milestoneSumMatches: {String(milestoneSumMatches)} (sum: {milestoneSum.toString()}, target: {targetWei.toString()})</p>
                    <p>- region: {String(!!region.trim())}</p>
                    <p>- deadline: {String(!!deadline)}</p>
                    <p>step3Valid: {String(step3Valid)}</p>
                    <p>termsAccepted: {String(termsAccepted)}</p>
                    <p>orgStatus === verified: {String(orgStatus === "verified")} (current: {orgStatus})</p>
                    <p>submitStep === idle: {String(submitStep === "idle")}</p>
                  </div>
                )}

                <div className="mt-8 flex flex-col gap-3 border-t border-[var(--ui-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="secondary"
                    className="campaign-btn-draft order-2 w-full sm:order-1 sm:w-auto [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                    start={<ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />}
                    onClick={goBack}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="campaign-btn-launch order-1 w-full sm:order-2 sm:w-auto [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                    onClick={handleSubmit}
                    disabled={!canSubmit || isPendingCreate || isConfirmingCreate}
                    end={
                      !(isSubmitting || isPendingCreate || isConfirmingCreate) ? (
                        <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      ) : undefined
                    }
                    start={isSubmitting || isPendingCreate || isConfirmingCreate ? <Spinner size={2} /> : undefined}
                  >
                    {isSubmitting || isPendingCreate || isConfirmingCreate ? "Creating…" : "Launch campaign"}
                  </Button>
                </div>
                </div>
                <p className="mt-6 text-center text-sm text-[var(--ui-muted)]">
                  Step 5 of 5: {STEPS[4].label}
                </p>
              </div>
            )}

            {/* ---- Confirming tx / Post-tx signing ---- */}
            {(submitStep === "creating" || isPendingCreate || isConfirmingCreate) && (
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-brand-amber)]/10 border-[var(--ui-brand-amber)]/20 p-4">
                <Spinner size={3} accessibilityLabel="Confirming transaction" />
                <div className="flex-1">
                  <TextBody as="p" className="app-text font-medium text-amber-600">Waiting for on-chain confirmation...</TextBody>
                  {txCreate && (
                    <TextCaption as="p" className="app-muted mt-1">
                      Tx: <a href={"https://sepolia.basescan.org/tx/" + txCreate} target="_blank" rel="noopener noreferrer" className="link-amber">{String(txCreate).slice(0, 14)}...</a>
                    </TextCaption>
                  )}
                  {pendingUserOperationHash && (
                    <TextCaption as="p" className="app-muted mt-1">
                      User op: {pendingUserOperationHash.slice(0, 14)}...
                    </TextCaption>
                  )}
                  {hasCanonicalCdpTransactionHash && cdpTransactionHash && (
                    <TextCaption as="p" className="app-muted mt-1">
                      CDP Tx: <a href={"https://sepolia.basescan.org/tx/" + cdpTransactionHash} target="_blank" rel="noopener noreferrer" className="link-amber">{String(cdpTransactionHash).slice(0, 14)}...</a>
                    </TextCaption>
                  )}
                  {/* Debug info - always visible during creating step */}
                  <div className="mt-2 p-2 bg-black/5 rounded text-xs font-mono text-gray-600">
                    <p>Debug: txHash={txCreate ? "yes" : "no"} | userOp={pendingUserOperationHash ? "yes" : "no"} | cdpTxValid={String(hasCanonicalCdpTransactionHash)} | receipt={receiptCreate ? "yes" : "no"} | pending={String(isPendingCreate)} | confirming={String(isConfirmingCreate)} | cdpStatus={cdpUserOperation?.status ?? "none"}</p>
                    {cdpTransactionHash && !hasCanonicalCdpTransactionHash && (
                      <p className="text-amber-700">Skipping interim CDP hash until canonical tx hash is available.</p>
                    )}
                    {txCreateError && <p className="text-red-500">Error: {txCreateError.message}</p>}
                    {cdpTxError && <p className="text-red-500">CDP Error: {cdpTxError.message}</p>}
                  </div>
                </div>
              </div>
            )}

            {submitStep !== "done" && resolvedCampaignId !== undefined && (
              <div className="mt-6 rounded-xl border-2 border-[var(--ui-brand-green)] bg-[var(--ui-brand-green)]/5 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-start gap-4">
                  <div className="bg-[var(--ui-brand-green)] p-2 rounded-full text-white">
                    <Icon name="circleCheckmark" size="m" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--ui-brand-green)]">On-chain Campaign Created!</h3>
                    <p className="app-text text-sm mt-1">Success! Your campaign is now live on the blockchain. The details will be saved to the discovery engine as soon as the receipt is available.</p>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (resolvedCampaignId !== undefined && receiptCreate && address) {
                        void saveCampaignToDb(resolvedCampaignId, receiptCreate, address);
                      }
                    }}
                    disabled={submitStep === "saving"}
                    className="shadow-lg hover:scale-105 transition-transform"
                    start={submitStep === "saving" ? <Spinner size={2} /> : <Icon name="pencil" size="s" />}
                  >
                    {submitStep === "saving" ? "Saving..." : "Save campaign"}
                  </Button>
                </div>
              </div>
            )}

            {submitStep === "done" && (
              <div className="mt-6 rounded-xl border-2 border-[var(--ui-brand-green)] bg-[var(--ui-brand-green)]/5 p-6 text-center">
                <div className="inline-flex bg-[var(--ui-brand-green)] p-3 rounded-full text-white mb-4">
                  <Icon name="circleCheckmark" size="l" />
                </div>
                <h3 className="text-xl font-bold text-[var(--ui-brand-green)]">Congratulations!</h3>
                <p className="app-text mt-2 mb-6">Your campaign is fully registered and visible to everyone.</p>
                <Button variant="primary" as={Link} href={`/campaigns/${resolvedCampaignId}`} className="w-full">
                  Go to Campaign Page
                </Button>
              </div>
            )}

          </div>

          {/* ---- Draft saved toast ---- */}
          {showDraftToast && (
            <div className="wizard-toast">
              <Icon name="circleCheckmark" size="s" className="text-[var(--ui-brand-green)]" />
              <span>Draft saved</span>
            </div>
          )}

        </section>
      </div>
    </main>
  );
}
