"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { decodeEventLog } from "viem";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextLabel1 } from "@coinbase/cds-web/typography/TextLabel1";
import { Tag } from "@coinbase/cds-web/tag/Tag";
import { config, campaignRegistryAbi, milestoneEscrowAbi, parseUsdc } from "@/lib/contracts";

const EMPTY_MILESTONE = { title: "", amount: "" };

export default function CreateCampaignPage() {
  const { address, isConnected } = useAccount();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [milestones, setMilestones] = useState([{ ...EMPTY_MILESTONE }]);

  const { writeContract: writeRegistry, data: txCreate, isPending: isPendingCreate } = useWriteContract();
  const { data: receiptCreate, isLoading: isConfirmingCreate } = useWaitForTransactionReceipt({ hash: txCreate });
  const { writeContract: writeEscrow, data: txInit, isPending: isPendingInit } = useWriteContract();
  const { isLoading: isConfirmingInit } = useWaitForTransactionReceipt({ hash: txInit });

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
        if (d.eventName === "CampaignCreated") return Number((d.args as unknown as { campaignId: bigint }).campaignId);
      } catch {
        continue;
      }
    }
    return undefined;
  }, [receiptCreate]);

  const canSubmit =
    isConnected &&
    address &&
    registryAddress &&
    escrowAddress &&
    title &&
    targetAmount &&
    beneficiary &&
    milestones.every((m) => m.amount && m.title);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !registryAddress || !escrowAddress) return;
    const targetWei = parseUsdc(targetAmount);
    const amounts = milestones.map((m) => parseUsdc(m.amount));
    const sum = amounts.reduce((a, b) => a + b, BigInt(0));
    if (sum !== targetWei) {
      alert("Milestone amounts must sum to target amount.");
      return;
    }
    const meta = metadataUri || `ipfs://amini-${Date.now()}`;
    try {
      writeRegistry({
        address: registryAddress,
        abi: campaignRegistryAbi,
        functionName: "createCampaign",
        args: [
          beneficiary as `0x${string}`,
          targetWei,
          milestones.length as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32,
          meta,
        ],
        chainId: config.chainId,
      });
    } catch (err) {
      console.error(err);
      alert("Failed to create campaign.");
    }
  }

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

  return (
    <main className="app-page px-4 py-8 md:px-8">
      <div className="app-surface mx-auto max-w-2xl rounded-2xl p-6 md:p-8">
        <Button as={Link} href="/campaigns" variant="secondary" compact transparent className="mb-4">
          ← Back to campaigns
        </Button>
        <TextTitle2 as="h1" className="brand-brown mb-6">
          Create campaign
        </TextTitle2>

        {!isConnected && (
          <div className="callout-amber mb-4">
            <Tag colorScheme="yellow" emphasis="high">Connect your wallet to create a campaign.</Tag>
          </div>
        )}

        {isConnected && (!registryAddress || !escrowAddress) && (
          <div className="callout-amber mb-4">
            <Tag colorScheme="yellow" emphasis="high">Contract addresses not configured</Tag>
            <TextBody as="p" className="app-muted mt-2">
              Set NEXT_PUBLIC_CAMPAIGN_REGISTRY_ADDRESS and NEXT_PUBLIC_ESCROW_ADDRESS after deploying.
            </TextBody>
          </div>
        )}

        {createdCampaignId !== undefined && (
          <div className="callout-brown mb-6 p-6">
            <Tag colorScheme="green" emphasis="high" className="mb-2">Campaign created — ID: {createdCampaignId}</Tag>
            <TextBody as="p" className="app-muted mt-2">
              Initialize escrow so others can fund this campaign.
            </TextBody>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                variant="primary"
                compact
                onClick={handleInitEscrow}
                disabled={!escrowAddress || isPendingInit || isConfirmingInit}
                loading={isPendingInit || isConfirmingInit}
              >
                {isPendingInit || isConfirmingInit ? "Initializing..." : "Initialize escrow"}
              </Button>
              <Button as={Link} href={`/campaigns/${createdCampaignId}`} variant="secondary" compact>
                View campaign →
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <TextLabel1 as="label" className="app-text mb-1 block">Title</TextLabel1>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="Campaign title"
            />
          </div>
          <div>
            <TextLabel1 as="label" className="app-text mb-1 block">Description</TextLabel1>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field min-h-[80px]"
              placeholder="Short description"
              rows={3}
            />
          </div>
          <div>
            <TextLabel1 as="label" className="app-text mb-1 block">Target amount (USDC)</TextLabel1>
            <input
              type="text"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="input-field"
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <TextLabel1 as="label" className="app-text mb-1 block">Beneficiary address</TextLabel1>
            <input
              type="text"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              className="input-field font-mono"
              placeholder="0x..."
            />
          </div>
          <div>
            <TextLabel1 as="label" className="app-text mb-1 block">Metadata URI (optional)</TextLabel1>
            <input
              type="text"
              value={metadataUri}
              onChange={(e) => setMetadataUri(e.target.value)}
              className="input-field"
              placeholder="ipfs://... or https://..."
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <TextLabel1 as="label" className="app-text block">
                Milestones (amounts must sum to target)
              </TextLabel1>
              <Button variant="secondary" compact transparent onClick={addMilestone}>
                + Add
              </Button>
            </div>
            <div className="space-y-3">
              {milestones.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={m.title}
                    onChange={(e) => updateMilestone(i, "title", e.target.value)}
                    className="input-field flex-1"
                    placeholder="Milestone title"
                  />
                  <input
                    type="text"
                    value={m.amount}
                    onChange={(e) => updateMilestone(i, "amount", e.target.value)}
                    className="input-field w-28"
                    placeholder="USDC"
                  />
                  <Button
                    variant="secondary"
                    compact
                    transparent
                    onClick={() => removeMilestone(i)}
                    disabled={milestones.length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="primary"
            block
            disabled={!canSubmit || isPendingCreate || isConfirmingCreate}
            loading={isPendingCreate || isConfirmingCreate}
          >
            {isPendingCreate || isConfirmingCreate ? "Creating campaign..." : "Create campaign"}
          </Button>
        </form>

        {txCreate && (
          <TextBody as="p" className="app-muted mt-4">
            Create tx:{" "}
            <a
              href={`https://basescan.org/tx/${txCreate}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link-amber"
            >
              {txCreate.slice(0, 10)}...
            </a>
          </TextBody>
        )}
      </div>
    </main>
  );
}
