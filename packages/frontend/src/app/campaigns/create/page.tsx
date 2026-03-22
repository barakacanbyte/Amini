"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { decodeEventLog } from "viem";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextLabel1 } from "@coinbase/cds-web/typography/TextLabel1";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { Tag } from "@coinbase/cds-web/tag/Tag";
import { Spinner } from "@coinbase/cds-web/loaders/Spinner";
import { ProgressBar } from "@coinbase/cds-web/visualizations/ProgressBar";
import { Upload, Trash2, Plus, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { config, campaignRegistryAbi, milestoneEscrowAbi, parseUsdc } from "@/lib/contracts";

const EMPTY_MILESTONE = { title: "", amount: "" };

const REGIONS = [
  { value: "", label: "Select region (optional)" },
  { value: "africa", label: "Sub-Saharan Africa" },
  { value: "asia", label: "Southeast Asia" },
  { value: "americas", label: "Latin America" },
  { value: "europe", label: "Europe" },
  { value: "mena", label: "Middle East & North Africa" },
  { value: "oceania", label: "Oceania" },
];

const CAUSES = [
  { value: "", label: "Select cause (optional)" },
  { value: "forest", label: "Reforestation" },
  { value: "water", label: "Water infrastructure" },
  { value: "education", label: "Digital literacy" },
  { value: "health", label: "Health & sanitation" },
  { value: "energy", label: "Renewable energy" },
  { value: "agriculture", label: "Sustainable agriculture" },
];

type Step = "idle" | "uploading" | "creating" | "saving" | "done" | "error";

export default function CreateCampaignPage() {
  const { address, isConnected } = useAccount();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [region, setRegion] = useState("");
  const [cause, setCause] = useState("");
  const [milestones, setMilestones] = useState([{ ...EMPTY_MILESTONE }]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flow state
  const [step, setStep] = useState<Step>("idle");
  const [metadataUri, setMetadataUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedToDb, setSavedToDb] = useState(false);

  // Contract interaction
  const { writeContract: writeRegistry, data: txCreate, isPending: isPendingCreate } = useWriteContract();
  const { data: receiptCreate, isLoading: isConfirmingCreate } = useWaitForTransactionReceipt({ hash: txCreate });
  const { writeContract: writeEscrow, data: txInit, isPending: isPendingInit } = useWriteContract();
  const { isLoading: isConfirmingInit, data: receiptInit } = useWaitForTransactionReceipt({ hash: txInit });

  const registryAddress = config.campaignRegistry;
  const escrowAddress = config.escrow;

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

  // Auto-save to DB when we have a campaign ID from the receipt
  const savedRef = useRef(false);
  useMemo(() => {
    if (createdCampaignId === undefined || savedRef.current || !receiptCreate) return;
    savedRef.current = true;
    setStep("saving");

    fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: createdCampaignId,
        chainId: config.chainId,
        owner: address?.toLowerCase(),
        beneficiary: beneficiary.toLowerCase(),
        targetAmount: parseUsdc(targetAmount).toString(),
        milestoneCount: milestones.length,
        metadataUri,
        txHash: txCreate,
        blockNumber: Number(receiptCreate.blockNumber),
        title,
        description,
        imageUrl,
        region: region || undefined,
        cause: cause || undefined,
      }),
    })
      .then((res) => res.json())
      .then((json: { ok: boolean; message?: string }) => {
        setSavedToDb(json.ok);
        setStep("done");
      })
      .catch(() => {
        setSavedToDb(false);
        setStep("done");
      });
  }, [createdCampaignId, receiptCreate]);

  const milestonesValid = milestones.every((m) => m.amount && m.title);
  const canSubmit =
    isConnected &&
    address &&
    registryAddress &&
    escrowAddress &&
    title &&
    targetAmount &&
    beneficiary &&
    milestonesValid &&
    step === "idle";

  const milestoneSum = useMemo(() => {
    try {
      return milestones.reduce((acc, m) => acc + (m.amount ? parseUsdc(m.amount) : BigInt(0)), BigInt(0));
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

  // Handlers
  function addMilestone() {
    setMilestones((prev) => [...prev, { ...EMPTY_MILESTONE }]);
  }

  function updateMilestone(i: number, field: "title" | "amount", value: string) {
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || !registryAddress || !escrowAddress) return;

      const amounts = milestones.map((m) => parseUsdc(m.amount));
      const sum = amounts.reduce((a, b) => a + b, BigInt(0));
      const target = parseUsdc(targetAmount);
      if (sum !== target) {
        setErrorMsg("Milestone amounts must sum to the target amount.");
        return;
      }

      setErrorMsg(null);
      setStep("uploading");

      // Step 1: Upload metadata to Arweave
      let uri: string;
      let imgUrl: string | null = null;
      try {
        const form = new FormData();
        form.append("title", title);
        form.append("description", description);
        form.append("milestones", JSON.stringify(milestones));
        if (region) form.append("region", region);
        if (cause) form.append("cause", cause);
        if (imageFile) form.append("image", imageFile);

        const metaRes = await fetch("/api/campaigns/metadata", {
          method: "POST",
          body: form,
        });
        const metaJson = (await metaRes.json()) as {
          ok: boolean;
          metadataUri?: string;
          imageUrl?: string | null;
          message?: string;
        };

        if (!metaRes.ok || !metaJson.ok || !metaJson.metadataUri) {
          throw new Error(metaJson.message ?? "Failed to upload metadata.");
        }
        uri = metaJson.metadataUri;
        imgUrl = metaJson.imageUrl ?? null;
      } catch (err) {
        setErrorMsg((err as Error).message);
        setStep("error");
        return;
      }

      setMetadataUri(uri);
      setImageUrl(imgUrl);
      setStep("creating");

      // Step 2: Call createCampaign on-chain
      try {
        writeRegistry({
          address: registryAddress,
          abi: campaignRegistryAbi,
          functionName: "createCampaign",
          args: [
            beneficiary as `0x${string}`,
            target,
            milestones.length,
            uri,
          ],
          chainId: config.chainId,
        });
      } catch (err) {
        setErrorMsg("On-chain transaction failed: " + (err as Error).message);
        setStep("error");
      }
    },
    [canSubmit, registryAddress, escrowAddress, title, description, targetAmount, beneficiary, milestones, region, cause, imageFile, writeRegistry],
  );

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
    setStep("idle");
    setErrorMsg(null);
    setMetadataUri(null);
    setImageUrl(null);
    setSavedToDb(false);
    savedRef.current = false;
  }

  // Step progress indicator
  const steps = [
    { key: "uploading", label: "Upload metadata" },
    { key: "creating", label: "On-chain creation" },
    { key: "saving", label: "Save to database" },
  ] as const;

  function stepIcon(stepKey: string) {
    const order = ["uploading", "creating", "saving", "done"];
    const currentIdx = order.indexOf(step);
    const keyIdx = order.indexOf(stepKey);
    if (step === "done" || currentIdx > keyIdx) {
      return <CheckCircle2 className="h-5 w-5 text-[var(--ui-brand-green)]" />;
    }
    if (step === stepKey) {
      return <Loader2 className="h-5 w-5 animate-spin text-[var(--ui-brand-brown)]" />;
    }
    return <Circle className="h-5 w-5 text-[var(--ui-muted)]" />;
  }

  const isSubmitting = step !== "idle" && step !== "done" && step !== "error";
  const escrowInitialized = receiptInit !== undefined;

  return (
    <main className="app-page px-4 py-8 md:px-8">
      <div className="app-surface mx-auto max-w-2xl rounded-2xl p-6 md:p-8">
        <Button as={Link} href="/campaigns" variant="secondary" compact transparent className="mb-4">
          &larr; Back to campaigns
        </Button>

        <TextTitle2 as="h1" className="brand-brown mb-2">
          Create campaign
        </TextTitle2>
        <TextBody as="p" className="app-muted mb-6">
          Set up a new milestone-based USDC campaign. Metadata is uploaded to Arweave for
          permanent storage, and the campaign is registered on Base.
        </TextBody>

        {/* Wallet / contract warnings */}
        {!isConnected && (
          <div className="callout-amber mb-4">
            <Tag colorScheme="yellow" emphasis="high">Connect your wallet to create a campaign.</Tag>
          </div>
        )}
        {isConnected && (!registryAddress || !escrowAddress) && (
          <div className="callout-amber mb-4">
            <Tag colorScheme="yellow" emphasis="high">Contract addresses not configured</Tag>
            <TextBody as="p" className="app-muted mt-2">
              Set NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS and NEXT_PUBLIC_ESCROW_ADDRESS in your .env after deploying.
            </TextBody>
          </div>
        )}

        {/* Step progress (visible during submission) */}
        {step !== "idle" && (
          <div className="mb-6 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
            <TextLabel1 as="p" className="app-text mb-3">Progress</TextLabel1>
            <div className="space-y-3">
              {steps.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  {stepIcon(s.key)}
                  <span className={step === s.key ? "app-text font-medium" : "app-muted text-sm"}>
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

        {/* Success state */}
        {step === "done" && createdCampaignId !== undefined && (
          <div className="callout-brown mb-6 p-6">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-[var(--ui-brand-green)]" />
              <Tag colorScheme="green" emphasis="high">Campaign #{createdCampaignId} created</Tag>
            </div>
            {savedToDb && (
              <TextCaption as="p" className="app-muted mb-3">
                Saved to database. Visible in the explorer immediately.
              </TextCaption>
            )}
            <TextBody as="p" className="app-muted mb-3">
              Initialize escrow so donors can fund this campaign.
            </TextBody>
            <div className="flex flex-wrap gap-3">
              {!escrowInitialized ? (
                <Button
                  variant="primary"
                  compact
                  onClick={handleInitEscrow}
                  disabled={!escrowAddress || isPendingInit || isConfirmingInit}
                  loading={isPendingInit || isConfirmingInit}
                >
                  {isPendingInit || isConfirmingInit ? "Initializing escrow..." : "Initialize escrow"}
                </Button>
              ) : (
                <Tag colorScheme="green" emphasis="high">Escrow initialized</Tag>
              )}
              <Button as={Link} href={"/campaigns/" + createdCampaignId} variant="secondary" compact>
                View campaign &rarr;
              </Button>
              <Button variant="secondary" compact transparent onClick={resetForm}>
                Create another
              </Button>
            </div>
          </div>
        )}

        {/* Error retry */}
        {step === "error" && (
          <div className="mb-6">
            <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <TextBody as="p" className="text-red-700 dark:text-red-400">
                {errorMsg ?? "Something went wrong."}
              </TextBody>
              <Button variant="secondary" compact className="mt-3" onClick={resetForm}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {/* Main form */}
        {(step === "idle" || step === "error") && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <TextLabel1 as="label" className="app-text mb-1 block">
                Title <span className="text-red-500">*</span>
              </TextLabel1>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field"
                placeholder="e.g. Sahel Community Reforestation Phase 2"
                required
              />
            </div>

            {/* Description */}
            <div>
              <TextLabel1 as="label" className="app-text mb-1 block">
                Description
              </TextLabel1>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field min-h-[80px]"
                placeholder="Explain the goals, timeline, and expected outcomes..."
                rows={3}
              />
            </div>

            {/* Image upload */}
            <div>
              <TextLabel1 as="label" className="app-text mb-1 block">
                Campaign image
              </TextLabel1>
              <TextCaption as="p" className="app-muted mb-2">
                JPEG, PNG, WEBP or GIF. Max 5 MB. Stored permanently on Arweave.
              </TextCaption>
              {imagePreview ? (
                <div className="relative mb-2 overflow-hidden rounded-xl border border-[var(--ui-border)]">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="h-48 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--ui-border)] p-8 text-sm transition-colors hover:border-[var(--ui-brand-brown)] hover:bg-[var(--ui-surface-elev)]"
                >
                  <Upload className="h-5 w-5 app-muted" />
                  <span className="app-muted">Click to upload image</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageChange}
                className="hidden"
              />
            </div>

            {/* Region & cause */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <TextLabel1 as="label" className="app-text mb-1 block">Region</TextLabel1>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="input-field w-full"
                >
                  {REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <TextLabel1 as="label" className="app-text mb-1 block">Cause</TextLabel1>
                <select
                  value={cause}
                  onChange={(e) => setCause(e.target.value)}
                  className="input-field w-full"
                >
                  {CAUSES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target amount */}
            <div>
              <TextLabel1 as="label" className="app-text mb-1 block">
                Target amount (USDC) <span className="text-red-500">*</span>
              </TextLabel1>
              <input
                type="text"
                inputMode="decimal"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="input-field"
                placeholder="e.g. 50000"
                required
              />
            </div>

            {/* Beneficiary */}
            <div>
              <TextLabel1 as="label" className="app-text mb-1 block">
                Beneficiary address <span className="text-red-500">*</span>
              </TextLabel1>
              <TextCaption as="p" className="app-muted mb-1">
                Wallet that receives released milestone funds.
              </TextCaption>
              <input
                type="text"
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                className="input-field font-mono"
                placeholder="0x..."
                required
              />
            </div>

            {/* Milestones */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <TextLabel1 as="label" className="app-text block">
                    Milestones <span className="text-red-500">*</span>
                  </TextLabel1>
                  <TextCaption as="p" className="app-muted">
                    Amounts must sum to the target ({targetAmount || "0"} USDC).
                  </TextCaption>
                </div>
                <Button
                  variant="secondary"
                  compact
                  transparent
                  onClick={addMilestone}
                  type="button"
                >
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>

              <div className="space-y-3">
                {milestones.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TextCaption as="span" className="app-muted w-6 shrink-0 text-center">
                      {i + 1}
                    </TextCaption>
                    <input
                      type="text"
                      value={m.title}
                      onChange={(e) => updateMilestone(i, "title", e.target.value)}
                      className="input-field flex-1"
                      placeholder="Milestone title"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={m.amount}
                      onChange={(e) => updateMilestone(i, "amount", e.target.value)}
                      className="input-field w-28"
                      placeholder="USDC"
                    />
                    <button
                      type="button"
                      onClick={() => removeMilestone(i)}
                      disabled={milestones.length <= 1}
                      className="shrink-0 p-1 text-[var(--ui-muted)] transition-colors hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Milestone sum indicator */}
              {targetAmount && milestones.some((m) => m.amount) && (
                <div className="mt-2">
                  <ProgressBar
                    progress={targetWei > BigInt(0) ? Math.min(1, Number(milestoneSum * BigInt(100) / targetWei) / 100) : 0}
                    accessibilityLabel="Milestone sum progress"
                  />
                  <div className="mt-1 flex justify-between">
                    <TextCaption
                      as="span"
                      className={milestoneSumMatches ? "text-[var(--ui-brand-green)]" : "text-[var(--ui-brand-amber)]"}
                    >
                      {milestoneSumMatches ? "Amounts match target" : "Sum does not match target yet"}
                    </TextCaption>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <Button
              variant="primary"
              block
              disabled={!canSubmit || !milestoneSumMatches || isPendingCreate || isConfirmingCreate}
              loading={isSubmitting || isPendingCreate || isConfirmingCreate}
            >
              {isSubmitting || isPendingCreate || isConfirmingCreate
                ? "Creating campaign..."
                : "Create campaign"}
            </Button>
          </form>
        )}

        {/* Confirming tx banner */}
        {(step === "creating" || isPendingCreate || isConfirmingCreate) && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4">
            <Spinner size={3} accessibilityLabel="Confirming transaction" />
            <div>
              <TextBody as="p" className="app-text font-medium">Waiting for on-chain confirmation...</TextBody>
              {txCreate && (
                <TextCaption as="p" className="app-muted mt-1">
                  Tx:{" "}
                  <a
                    href={"https://basescan.org/tx/" + txCreate}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-amber"
                  >
                    {String(txCreate).slice(0, 14)}...
                  </a>
                </TextCaption>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
