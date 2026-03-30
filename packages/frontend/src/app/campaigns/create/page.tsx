"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAminiSigning } from "@/context/AminiSigningContext";
import { decodeEventLog } from "viem";
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
import { ProgressBar } from "@coinbase/cds-web/visualizations/ProgressBar";
import { Icon } from "@coinbase/cds-web/icons";
import { config, campaignRegistryAbi, milestoneEscrowAbi, parseUsdc } from "@/lib/contracts";

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const DRAFT_KEY = "amini_campaign_draft";

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

const VALIDATORS = [
  { value: "", label: "Select Validator" },
  { value: "eas", label: "EAS Attestation Service" },
  { value: "worldcoin", label: "Worldcoin ID" },
  { value: "custom", label: "Custom Validator" },
];

const STEPS = [
  { key: 1, label: "Details" },
  { key: 2, label: "Funding" },
  { key: 3, label: "Verification" },
  { key: 4, label: "Review" },
] as const;

type SubmitStep = "idle" | "uploading" | "creating" | "signing" | "saving" | "done" | "error";

/* ------------------------------------------------------------------ */
/* Draft helpers                                                      */
/* ------------------------------------------------------------------ */

type DraftData = {
  title: string;
  description: string;
  beneficiaryDescription: string;
  contactEmail: string;
  socialLinks: { label: string; url: string }[];
  impactMetrics: { name: string; target: string }[];
  targetAmount: string;
  deadline: string;
  region: string;
  stateLoc: string;
  tags: string[];
  milestones: { title: string; description: string; amount: string }[];
  attestationService: string;
  superfluidEnabled: boolean;
  permanentStorage: boolean;
  currentStep: number;
};

function saveDraft(data: DraftData) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
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
  const [impactMetrics, setImpactMetrics] = useState<{ name: string; target: string }[]>([]);
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
  const [superfluidEnabled, setSuperfluidEnabled] = useState(false);
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
  const [savedToDb, setSavedToDb] = useState(false);
  const [showDraftToast, setShowDraftToast] = useState(false);

  /* ---- Contract interaction ---- */
  const { writeContract: writeRegistry, data: txCreate, isPending: isPendingCreate } = useWriteContract();
  const { data: receiptCreate, isLoading: isConfirmingCreate } = useWaitForTransactionReceipt({ hash: txCreate });
  const { writeContract: writeEscrow, data: txInit, isPending: isPendingInit } = useWriteContract();
  const { isLoading: isConfirmingInit, data: receiptInit } = useWaitForTransactionReceipt({ hash: txInit });

  const registryAddress = config.campaignRegistry;
  const escrowAddress = config.escrow;

  /* ---- Restore draft on mount ---- */
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setTitle(draft.title || "");
      setDescription(draft.description || "");
      setBeneficiaryDescription(draft.beneficiaryDescription || "");
      setContactEmail(draft.contactEmail || "");
      setSocialLinks(draft.socialLinks?.length ? draft.socialLinks : []);
      setImpactMetrics(draft.impactMetrics?.length ? draft.impactMetrics : []);
      setTargetAmount(draft.targetAmount || "");
      setDeadline(draft.deadline || "");
      setRegion(draft.region || "");
      setStateLoc(draft.stateLoc || "");
      setTags(draft.tags?.length ? draft.tags : []);
      setMilestones(draft.milestones?.length ? draft.milestones : [{ ...EMPTY_MILESTONE }]);
      setAttestationService(draft.attestationService || "");
      setSuperfluidEnabled(draft.superfluidEnabled ?? false);
      setPermanentStorage(draft.permanentStorage ?? true);
      setCurrentStep(draft.currentStep || 1);
      setDraftRestored(true);
    }
  }, []);

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
    milestones, attestationService, superfluidEnabled, permanentStorage, currentStep,
  }), [title, description, beneficiaryDescription, contactEmail, socialLinks, impactMetrics,
    targetAmount, deadline, region, stateLoc, tags,
    milestones, attestationService, superfluidEnabled, permanentStorage, currentStep]);

  /* ---- Save draft handler ---- */
  function handleSaveDraft() {
    saveDraft(getDraftData());
    setShowDraftToast(true);
    setTimeout(() => setShowDraftToast(false), 2500);
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

  async function handleSignAndSave() {
    if (createdCampaignId === undefined || !receiptCreate || !address) return;
    setSubmitStep("saving");

    try {
      const cdpToken = await getCdpAccessToken();
      
      const payload: Record<string, unknown> = {
        campaignId: createdCampaignId,
        chainId: config.chainId,
        owner: address.toLowerCase(),
        beneficiary: address.toLowerCase(),
        targetAmount: parseUsdc(targetAmount).toString(),
        milestoneCount: milestones.length,
        metadataUri,
        txHash: txCreate,
        blockNumber: Number(receiptCreate.blockNumber),
        title,
        description,
        imageUrl,
        region: region || undefined,
        tags: tags.length ? tags : undefined,
        deadline: deadline || undefined,
        contactEmail: contactEmail || undefined,
        beneficiaryDescription: beneficiaryDescription || undefined,
        socialLinks: socialLinks.length ? socialLinks : undefined,
        impactMetrics: impactMetrics.length ? impactMetrics : undefined,
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
      setSavedToDb(json.ok);
      setSubmitStep("done");
      clearDraft();
    } catch (err) {
      console.error(err);
      setSavedToDb(false);
      setSubmitStep("done");
    }
  }


  /* ---- Derived validation per step ---- */
  const step1Valid = !!title.trim() && !!description.trim();

  const milestonesValid = milestones.length > 0 && milestones.every((m) => m.amount && m.title);
  const milestoneSum = useMemo(() => {
    try {
      return milestones.reduce(
        (acc, m) => acc + (m.amount ? parseUsdc(m.amount) : BigInt(0)),
        BigInt(0),
      );
    } catch {
      return BigInt(0);
    }
  }, [milestones]);
  const targetWei = useMemo(() => {
    try {
      return targetAmount ? parseUsdc(targetAmount) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [targetAmount]);
  const milestoneSumMatches = targetWei > BigInt(0) && milestoneSum === targetWei;
  const step2Valid = !!targetAmount && milestonesValid && milestoneSumMatches && !!region.trim() && !!deadline;

  const step3Valid = true;

  const canSubmit =
    isConnected && address && registryAddress && escrowAddress &&
    step1Valid && step2Valid && step3Valid && termsAccepted && orgStatus === "verified" && submitStep === "idle";

  /* ---- Navigation ---- */
  function goNext() {
    saveDraft({ ...getDraftData(), currentStep: currentStep + 1 });
    setCurrentStep((s) => Math.min(s + 1, 4));
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
    if (step === 4) return step1Valid && step2Valid && step3Valid;
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

    const amounts = milestones.map((m) => parseUsdc(m.amount));
    const sum = amounts.reduce((a, b) => a + b, BigInt(0));
    const target = parseUsdc(targetAmount);
    if (sum !== target) {
      setErrorMsg("Milestone amounts must sum to the funding target.");
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
      if (impactMetrics.length) form.append("impactMetrics", JSON.stringify(impactMetrics));
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

    try {
      writeRegistry({
        address: registryAddress,
        abi: campaignRegistryAbi,
        functionName: "createCampaign",
        args: [address as `0x${string}`, target, milestones.length, uri],
        chainId: config.chainId,
      });
    } catch (err) {
      setErrorMsg("Failed to create campaign: " + (err as Error).message);
      setSubmitStep("error");
    }
  }, [canSubmit, registryAddress, escrowAddress, address, title, description, targetAmount, milestones, region, stateLoc, tags, deadline, beneficiaryDescription, contactEmail, socialLinks, impactMetrics, imageFile, writeRegistry]);

  function handleInitEscrow() {
    if (!escrowAddress || createdCampaignId === undefined || !config.usdc) return;
    const amounts = milestones.map((m) => parseUsdc(m.amount));
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
    setCurrentStep(1);
    clearDraft();
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
    <main className="app-page px-4 py-8 md:px-8">
      <div className="app-surface mx-auto max-w-6xl overflow-hidden rounded-[28px]">
        <section className="px-6 pb-8 pt-10 md:px-10 md:pb-10 md:pt-12">

          {/* ---- Page header ---- */}
          <div className="mx-auto mb-8 flex max-w-3xl flex-col items-center justify-center text-center">
            <TextLabel2 as="p" className="brand-brown uppercase tracking-[0.18em] !text-center">
              Amini Impact Layer
            </TextLabel2>
            <TextTitle1
              as="h1"
              className="app-text mt-4 text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl !text-center"
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
                  clearDraft();
                  setDraftRestored(false);
                  resetForm();
                  setTitle(""); setDescription(""); setBeneficiaryDescription(""); setContactEmail("");
                  setSocialLinks([]); setImpactMetrics([]); setTargetAmount(""); setDeadline("");
                  setRegion(""); setStateLoc(""); setTags([]); setMilestones([{ ...EMPTY_MILESTONE }]);
                  setAttestationService(""); setSuperfluidEnabled(false); setPermanentStorage(true);
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

          {/* ============================================================ */}
          {/* Step Indicator                                                */}
          {/* ============================================================ */}
          {submitStep === "idle" && (
            <div className="wizard-steps mx-auto mb-10 max-w-3xl">
              <div className="wizard-steps-track">
                {STEPS.map((s, i) => {
                  const completed = currentStep > s.key;
                  const active = currentStep === s.key;
                  const reachable = isStepReachable(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => reachable && goToStep(s.key)}
                      disabled={!reachable}
                      className={`wizard-step ${active ? "wizard-step-active" : ""} ${completed ? "wizard-step-completed" : ""}`}
                    >
                      <span className="wizard-step-dot">
                        {completed ? <Icon name="circleCheckmark" size="m" /> : <span>{s.key}</span>}
                      </span>
                      <span className="wizard-step-label">{s.label}</span>
                      {i < STEPS.length - 1 && <span className="wizard-step-connector" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* Step Content                                                  */}
          {/* ============================================================ */}
          <div className="mx-auto max-w-3xl">

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
            {submitStep === "done" && createdCampaignId !== undefined && (
              <div className="campaign-card mb-6">
                <div className="mb-4 flex items-center gap-2">
                  <Icon name="circleCheckmark" size="l" className="text-[var(--ui-brand-green)]" />
                  <Tag colorScheme="green" emphasis="high">Campaign #{createdCampaignId} created!</Tag>
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
                  <Button as={Link} href={"/campaigns/" + createdCampaignId} variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2">
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
                <div className="campaign-card">
                  <div className="campaign-card-header">
                    <h2 className="campaign-card-title">Campaign Details</h2>
                    <TextCaption as="span" className="app-muted">Step 1 of 4</TextCaption>
                  </div>
                  <TextBody as="p" className="app-muted mb-6 text-sm">
                    Give your campaign a name, description, and an optional cover image.
                  </TextBody>

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

                  {/* Impact Metrics */}
                  <div className="campaign-field">
                    <label className="campaign-label">Expected Impact Metrics <span className="app-muted font-normal text-xs">(optional)</span></label>
                    {impactMetrics.map((metric, i) => (
                      <div key={i} className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={metric.name}
                          onChange={(e) => {
                            const next = [...impactMetrics];
                            next[i] = { ...next[i], name: e.target.value };
                            setImpactMetrics(next);
                          }}
                          className="campaign-input flex-1"
                          placeholder="Metric (e.g. People served)"
                        />
                        <input
                          type="text"
                          value={metric.target}
                          onChange={(e) => {
                            const next = [...impactMetrics];
                            next[i] = { ...next[i], target: e.target.value };
                            setImpactMetrics(next);
                          }}
                          className="campaign-input w-1/3"
                          placeholder="Target (e.g. 500)"
                        />
                        <button type="button" onClick={() => setImpactMetrics((prev) => prev.filter((_, j) => j !== i))} className="campaign-milestone-remove" title="Remove">
                          <Icon name="trashCan" size="s" />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setImpactMetrics((prev) => [...prev, { name: "", target: "" }])} className="campaign-add-milestone-btn mt-2">
                      + Add Metric
                    </button>
                  </div>
                </div>

                {/* Navigation */}
                <div className="wizard-nav">
                  <Button variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2" start={<Icon name="save" size="s" />} onClick={handleSaveDraft}>
                    Save Draft
                  </Button>
                  <Button variant="primary" className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2" end={<Icon name="caretRight" size="s" />} onClick={goNext} disabled={!step1Valid}>
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 2: Funding & Milestones                                 */}
            {/* ============================================================ */}
            {submitStep === "idle" && currentStep === 2 && (
              <div className="wizard-step-content">
                <div className="campaign-card">
                  <div className="campaign-card-header">
                    <h2 className="campaign-card-title">Funding & Milestones</h2>
                    <TextCaption as="span" className="app-muted">Step 2 of 4</TextCaption>
                  </div>
                  <TextBody as="p" className="app-muted mb-6 text-sm">
                    Set your funding target and break it into milestones. Milestone amounts must total the target.
                  </TextBody>

                  {/* Funding Target */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="campaign-field">
                      <label className="campaign-label">
                        Funding Target (USDC) <span className="text-red-500">*</span>
                      </label>
                      <div className="campaign-input-icon-wrapper">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={targetAmount}
                          onChange={(e) => setTargetAmount(e.target.value)}
                          className="campaign-input campaign-input-with-icon"
                          placeholder="e.g. 50000"
                        />
                        <span className="campaign-input-icon">
                          <Icon name="cash" size="s" />
                        </span>
                      </div>
                    </div>

                    {/* Campaign Deadline */}
                    <div className="campaign-field">
                      <label className="campaign-label">Campaign Deadline <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                        className="campaign-input"
                      />
                    </div>
                  </div>

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

                  {/* Milestones */}
                  <div className="mt-2">
                    <label className="campaign-label mb-3 block">
                      Milestones <span className="text-red-500">*</span>
                    </label>
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
                            className="campaign-input"
                            placeholder="Amount (USDC)"
                          />
                        </div>
                        <textarea
                          value={m.description}
                          onChange={(e) => updateMilestone(i, "description", e.target.value)}
                          className="campaign-textarea mt-3 text-sm"
                          placeholder="Describe deliverables for this milestone..."
                          rows={2}
                        />
                      </div>
                    ))}
                    <button type="button" onClick={addMilestone} className="campaign-add-milestone-btn">
                      + Add Milestone
                    </button>
                  </div>

                  {/* Milestone sum indicator */}
                  {targetAmount && milestones.some((m) => m.amount) && (
                    <div className="mt-5 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4 dark:bg-[var(--ui-surface)]">
                      <ProgressBar
                        progress={targetWei > BigInt(0) ? Math.min(1, Number((milestoneSum * BigInt(100)) / targetWei) / 100) : 0}
                        accessibilityLabel="Milestone sum progress"
                      />
                      <div className="mt-3 flex items-center justify-between">
                        <TextCaption as="span" className="app-muted">Milestone total</TextCaption>
                        <TextCaption
                          as="span"
                          className={milestoneSumMatches ? "text-[var(--ui-brand-green)] font-semibold" : "text-[var(--ui-brand-amber)] font-semibold"}
                        >
                          {milestoneSumMatches ? (
                            <span className="flex items-center gap-1"><Icon name="circleCheckmark" size="xs" /> Amounts match target</span>
                          ) : (
                            <span className="flex items-center gap-1"><Icon name="warning" size="xs" /> Adjust milestones to match target</span>
                          )}
                        </TextCaption>
                      </div>
                    </div>
                  )}
                </div>

                {/* Navigation */}
                <div className="wizard-nav">
                  <Button variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2" start={<Icon name="caretLeft" size="s" />} onClick={goBack}>
                    Back
                  </Button>
                  <div className="flex gap-3">
                    <Button variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2" start={<Icon name="save" size="s" />} onClick={handleSaveDraft}>
                      Save Draft
                    </Button>
                    <Button variant="primary" className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2" end={<Icon name="caretRight" size="s" />} onClick={goNext} disabled={!step2Valid}>
                      Continue
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 3: Verification & Escrow                                */}
            {/* ============================================================ */}
            {submitStep === "idle" && currentStep === 3 && (
              <div className="wizard-step-content">
                <div className="campaign-card">
                  <div className="campaign-card-header">
                    <h2 className="campaign-card-title">Verification & Smart Escrow</h2>
                    <TextCaption as="span" className="app-muted">Step 3 of 4</TextCaption>
                  </div>
                  <TextBody as="p" className="app-muted mb-6 text-sm">
                    Configure attestation requirements and payment options.
                  </TextBody>
                  {/* Attestation Service */}
                  <div className="campaign-field">
                    <label className="campaign-label">Attestation Service</label>
                    <select value={attestationService} onChange={(e) => setAttestationService(e.target.value)} className="campaign-select">
                      {VALIDATORS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                  </div>

                  {/* Toggle: Superfluid */}
                  <div className="campaign-toggle-row">
                    <div className="campaign-toggle-info">
                      <span className="campaign-toggle-icon campaign-toggle-icon-purple"><Icon name="lightning" size="xs" /></span>
                      <div>
                        <span className="campaign-toggle-text">Superfluid Streaming Payments</span>
                        <p className="campaign-toggle-subtext">Enable real-time streaming of funds</p>
                      </div>
                    </div>
                    <label className="campaign-toggle">
                      <input type="checkbox" checked={superfluidEnabled} onChange={(e) => setSuperfluidEnabled(e.target.checked)} />
                      <span className="campaign-toggle-slider"></span>
                    </label>
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
                </div>

                {/* Navigation */}
                <div className="wizard-nav">
                  <Button variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2" start={<Icon name="caretLeft" size="s" />} onClick={goBack}>
                    Back
                  </Button>
                  <div className="flex gap-3">
                    <Button variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2" start={<Icon name="save" size="s" />} onClick={handleSaveDraft}>
                      Save Draft
                    </Button>
                    <Button variant="primary" className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2" end={<Icon name="caretRight" size="s" />} onClick={goNext} disabled={!step3Valid}>
                      Continue
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 4: Review & Launch                                      */}
            {/* ============================================================ */}
            {submitStep === "idle" && currentStep === 4 && (
              <div className="wizard-step-content">
                <div className="campaign-card">
                  <div className="campaign-card-header">
                    <h2 className="campaign-card-title">Review & Launch</h2>
                    <TextCaption as="span" className="app-muted">Step 4 of 4</TextCaption>
                  </div>
                  <TextBody as="p" className="app-muted mb-6 text-sm">
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

                  {/* Section: Funding & Milestones */}
                  <div className="wizard-review-section bg-[var(--ui-surface-elev)]/30 p-5 rounded-2xl mb-4 border border-[var(--ui-border)]">
                    <div className="wizard-review-header">
                      <TextLabel1 as="h3" className="brand-green font-bold text-base">Funding & Milestones</TextLabel1>
                      <button type="button" onClick={() => goToStep(2)} className="wizard-review-edit">
                        <Icon name="pencil" size="s" className="mr-1" /> Edit
                      </button>
                    </div>
                    <div className="wizard-review-grid flex flex-col sm:grid sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <TextCaption as="span" className="text-[var(--ui-muted)] dark:text-gray-400 text-[11px] uppercase tracking-wider font-bold">Target</TextCaption>
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
                  </div>

                  {/* Section: Verification & Escrow */}
                  <div className="wizard-review-section bg-[var(--ui-surface-elev)]/30 p-5 rounded-2xl border border-[var(--ui-border)]">
                    <div className="wizard-review-header">
                      <TextLabel1 as="h3" className="brand-green font-bold text-base">Verification & Escrow</TextLabel1>
                      <button type="button" onClick={() => goToStep(3)} className="wizard-review-edit">
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
                      {superfluidEnabled && <Tag colorScheme="blue" emphasis="low" start={<Icon name="lightning" size="xs" />}>Superfluid</Tag>}
                      {permanentStorage && <Tag colorScheme="green" emphasis="low" start={<Icon name="folder" size="xs" />}>IPFS Storage</Tag>}
                      {!superfluidEnabled && !permanentStorage && (
                        <TextCaption as="span" className="app-muted">No optional features enabled</TextCaption>
                      )}
                    </div>
                  </div>
                </div>

                {/* Terms Acknowledgment */}
                <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4 dark:bg-[var(--ui-surface)]">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-[var(--ui-brand-green)]"
                    />
                    <TextBody as="span" className="app-text text-sm leading-relaxed">
                      I acknowledge that donated funds will be held in a smart contract escrow and released only when milestones are verified through EAS attestations. Campaign details will be permanently stored on IPFS.
                    </TextBody>
                  </label>
                </div>

                {/* Launch buttons */}
                <div className="wizard-nav">
                  <Button variant="secondary" className="campaign-btn-draft [&>span]:flex [&>span]:items-center [&>span]:gap-2" start={<Icon name="caretLeft" size="s" />} onClick={goBack}>
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                    onClick={handleSubmit}
                    disabled={!canSubmit || isPendingCreate || isConfirmingCreate}
                    start={(!(isSubmitting || isPendingCreate || isConfirmingCreate)) ? <Icon name="add" size="s" /> : undefined}
                  >
                    {isSubmitting || isPendingCreate || isConfirmingCreate
                      ? "Creating..."
                      : "Launch Campaign"}
                  </Button>
                </div>
              </div>
            )}

            {/* ---- Confirming tx / Post-tx signing ---- */}
            {(submitStep === "creating" || isPendingCreate || isConfirmingCreate) && (
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-brand-amber)]/10 border-[var(--ui-brand-amber)]/20 p-4">
                <Spinner size={3} accessibilityLabel="Confirming transaction" />
                <div>
                  <TextBody as="p" className="app-text font-medium text-amber-600">Waiting for on-chain confirmation...</TextBody>
                  {txCreate && (
                    <TextCaption as="p" className="app-muted mt-1">
                      Tx: <a href={"https://basescan.org/tx/" + txCreate} target="_blank" rel="noopener noreferrer" className="link-amber">{String(txCreate).slice(0, 14)}...</a>
                    </TextCaption>
                  )}
                </div>
              </div>
            )}

            {submitStep !== "done" && createdCampaignId !== undefined && (
              <div className="mt-6 rounded-xl border-2 border-[var(--ui-brand-green)] bg-[var(--ui-brand-green)]/5 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-start gap-4">
                  <div className="bg-[var(--ui-brand-green)] p-2 rounded-full text-white">
                    <Icon name="circleCheckmark" size="m" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--ui-brand-green)]">On-chain Campaign Created!</h3>
                    <p className="app-text text-sm mt-1">Success! Your campaign is now live on the blockchain. Now, please sign a one-time message to verify your identity and save the campaign details to our discovery engine.</p>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={handleSignAndSave}
                    disabled={submitStep === "signing" || submitStep === "saving"}
                    className="shadow-lg hover:scale-105 transition-transform"
                    start={(submitStep === "signing" || submitStep === "saving") ? <Spinner size={2} /> : <Icon name="pencil" size="s" />}
                  >
                    {submitStep === "signing" ? "Waiting for Sign..." : submitStep === "saving" ? "Saving..." : "Sign & Finalize"}
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
                <Button variant="primary" as={Link} href={`/campaigns/${createdCampaignId}`} className="w-full">
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
