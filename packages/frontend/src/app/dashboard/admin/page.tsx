"use client";

import { useState, useEffect } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import type { Address, Hex } from "viem";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { Icon } from "@coinbase/cds-web/icons";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { Modal } from "@coinbase/cds-web/overlays/modal/Modal";
import { ModalHeader } from "@coinbase/cds-web/overlays/modal/ModalHeader";
import { ModalBody } from "@coinbase/cds-web/overlays/modal/ModalBody";
import { ModalFooter } from "@coinbase/cds-web/overlays/modal/ModalFooter";
import { TextInput } from "@coinbase/cds-web/controls/TextInput";
import Link from "next/link";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { CdpEmbeddedAuth } from "@/components/CdpEmbeddedAuth";
import {
  Wallet,
  ConnectWallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { getCdpWalletConfig } from "@/lib/cdpWalletConfig";
import { createMilestoneAttestation } from "@amini/eas-schemas";
import { BASE_SEPOLIA_CHAIN_ID, EAS_PORTAL_BASE } from "@amini/shared";

const cdpConfigured = Boolean(getCdpWalletConfig());

interface AdminStats {
  totalVolume: string;
  activeCampaigns: number;
  verifiedOrgs: number;
  pendingReviews: number;
}

interface PendingOrg {
  id: string;
  wallet: string;
  name: string;
  description?: string;
  website_url?: string;
  country?: string;
  official_email?: string;
  twitter_handle?: string;
  linkedin_url?: string;
  ens_name?: string;
  has_coinbase_verification?: boolean;
  logo_url?: string;
  created_at: string;
}

interface MilestoneProof {
  id: number;
  campaign_id: number;
  milestone_index: number;
  submitter_wallet: string;
  title: string;
  description: string;
  evidence_urls: string[];
  ipfs_cid?: string;
  ipfs_url?: string;
  status: string;
  reviewer_notes?: string;
  attestation_uid?: string;
  created_at: string;
  campaign_title?: string;
  org_name?: string;
  org_logo_url?: string;
  beneficiary?: `0x${string}` | string | null;
}

export default function AdminDashboard() {
  const { adminFetch, isConnected } = useAdminAuth();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: BASE_SEPOLIA_CHAIN_ID });
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrg[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<PendingOrg | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingProofs, setPendingProofs] = useState<MilestoneProof[]>([]);
  const [selectedProof, setSelectedProof] = useState<MilestoneProof | null>(null);
  const [showProofApproveModal, setShowProofApproveModal] = useState(false);
  const [showProofRejectModal, setShowProofRejectModal] = useState(false);
  const [proofRejectNotes, setProofRejectNotes] = useState("");
  const [proofAttestationUid, setProofAttestationUid] = useState("");
  const [isProofSubmitting, setIsProofSubmitting] = useState(false);

  const easSchemaUid = (process.env.NEXT_PUBLIC_EAS_SCHEMA_UID ??
    "0x18e9a692ecf6adbe3c27beadcaef53e888bbca8e38b59f11655fc73494a248f9") as Hex;
  const easAddress = (process.env.NEXT_PUBLIC_EAS_PORTAL_ADDRESS ??
    EAS_PORTAL_BASE) as Address;

  useEffect(() => {
    if (isConnected) {
      fetchAdminData();
    }
  }, [isConnected]);

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, orgsRes, proofsRes] = await Promise.all([
        adminFetch("/api/admin/stats"),
        adminFetch("/api/admin/organizations/pending"),
        adminFetch("/api/admin/milestone-proofs?status=submitted"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.ok) {
          setStats(statsData.stats);
        }
      }

      if (orgsRes.ok) {
        const orgsData = await orgsRes.json();
        if (orgsData.ok) {
          setPendingOrgs(orgsData.organizations);
        }
      }

      if (proofsRes.ok) {
        const proofsData = await proofsRes.json();
        if (proofsData.ok) {
          setPendingProofs(proofsData.proofs);
        }
      }
    } catch (error) {
      console.error("Failed to fetch admin data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const openApproveModal = (org: PendingOrg) => {
    setSelectedOrg(org);
    setShowApproveModal(true);
  };

  const handleApprove = async () => {
    if (!selectedOrg) return;
    
    setIsSubmitting(true);
    try {
      const res = await adminFetch(`/api/admin/organizations/${selectedOrg.id}/approve`, {
        method: "POST",
      });
      
      if (res.ok) {
        setShowApproveModal(false);
        setSelectedOrg(null);
        await fetchAdminData();
      } else {
        const data = await res.json();
        alert(`Failed to approve: ${data.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Approval error:", error);
      alert("Failed to approve organization");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRejectModal = (org: PendingOrg) => {
    setSelectedOrg(org);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!selectedOrg) return;
    
    setIsSubmitting(true);
    try {
      const res = await adminFetch(`/api/admin/organizations/${selectedOrg.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      
      if (res.ok) {
        setShowRejectModal(false);
        setSelectedOrg(null);
        setRejectReason("");
        await fetchAdminData();
      } else {
        const data = await res.json();
        alert(`Failed to reject: ${data.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Rejection error:", error);
      alert("Failed to reject organization");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const handleApproveProof = async () => {
    if (!selectedProof) return;
    if (!walletClient?.account || !publicClient) {
      alert("Connect the admin wallet on Base Sepolia to issue the EAS attestation.");
      return;
    }
    if (
      !selectedProof.beneficiary ||
      !/^0x[a-fA-F0-9]{40}$/.test(selectedProof.beneficiary)
    ) {
      alert("Campaign beneficiary address is missing or invalid.");
      return;
    }

    setIsProofSubmitting(true);
    try {
      let uid = proofAttestationUid.trim();
      if (!uid) {
        const issued = await createMilestoneAttestation(walletClient, publicClient, {
          campaignId: BigInt(selectedProof.campaign_id),
          milestoneIndex: selectedProof.milestone_index,
          schemaUID: easSchemaUid,
          recipient: selectedProof.beneficiary as Address,
          easAddress,
          revocable: false,
        });
        uid = issued.uid;
      }

      const res = await adminFetch(
        `/api/admin/milestone-proofs/${selectedProof.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve",
            attestation_uid: uid,
          }),
        },
      );
      if (res.ok) {
        setShowProofApproveModal(false);
        setSelectedProof(null);
        setProofAttestationUid("");
        await fetchAdminData();
      } else {
        const data = await res.json();
        alert(`Failed: ${data.message || "Unknown error"}`);
      }
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    } finally {
      setIsProofSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <Icon name="wallet" size="l" className="text-[var(--ui-muted)]" />
        <TextBody className="text-[var(--ui-muted)]">
          Connect your wallet to access the admin dashboard
        </TextBody>
        <div className="amini-header-wallet">
          {cdpConfigured ? (
            <div className="amini-header-cdp-login" aria-label="Account">
              <CdpEmbeddedAuth />
            </div>
          ) : (
            <Wallet>
              <ConnectWallet disconnectedLabel="Log in" />
              <WalletDropdown>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ui-brand-green)] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-[var(--ui-text)]">
          Admin <span className="text-blue-500">Control Center</span>
        </h1>
        <p className="max-w-2xl text-[var(--ui-muted)]">
          Platform overview, verification requests, and global metrics.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <div className="flex items-center gap-3">
              <Icon name="activity" size="m" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Total Volume</p>
              <p className="text-xl font-bold text-[var(--ui-text)]">{stats?.totalVolume}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <div className="flex items-center gap-3">
              <Icon name="securityShield" size="m" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Active Campaigns</p>
              <p className="text-xl font-bold text-[var(--ui-text)]">{stats?.activeCampaigns}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <div className="flex items-center gap-3">
              <Icon name="peopleGroup" size="m" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Verified Orgs</p>
              <p className="text-xl font-bold text-[var(--ui-text)]">{stats?.verifiedOrgs}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <div className="flex items-center gap-3">
              <Icon name="warning" size="m" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Pending Reviews</p>
              <p className="text-xl font-bold text-[var(--ui-text)]">{stats?.pendingReviews}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Verifications */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-[var(--ui-text)]">Pending Organization Verifications</h2>
        
        {pendingOrgs.length === 0 ? (
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-8 text-center">
            <Icon name="circleCheckmark" size="l" className="mx-auto mb-3 text-[var(--ui-brand-green)]" />
            <TextBody className="text-[var(--ui-muted)]">No pending organization reviews</TextBody>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingOrgs.map((org) => (
              <div key={org.id} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-6">
                <div className="flex items-start gap-6">
                  {/* Logo */}
                  {org.logo_url ? (
                    <img 
                      src={org.logo_url} 
                      alt={org.name} 
                      className="h-16 w-16 rounded-xl object-cover border border-[var(--ui-border)]" 
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--ui-brand-brown-soft)] border border-[var(--ui-border)]">
                      <Icon name="peopleGroup" size="l" className="text-[var(--ui-brand-brown)]" />
                    </div>
                  )}
                  
                  {/* Content */}
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="text-lg font-bold text-[var(--ui-text)]">{org.name}</h3>
                      <p className="text-sm text-[var(--ui-muted)] mt-1">
                        Submitted {formatDate(org.created_at)}
                        {org.country && ` • ${org.country}`}
                      </p>
                    </div>
                    
                    {org.description && (
                      <TextBody className="text-[var(--ui-text)]">{org.description}</TextBody>
                    )}
                    
                    <div className="grid gap-2 sm:grid-cols-2">
                      {org.official_email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Icon name="email" size="s" className="text-[var(--ui-muted)]" />
                          <span className="text-[var(--ui-text)]">{org.official_email}</span>
                        </div>
                      )}
                      {org.website_url && (
                        <div className="flex items-center gap-2 text-sm">
                          <Icon name="globe" size="s" className="text-[var(--ui-muted)]" />
                          <a 
                            href={org.website_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[var(--ui-brand-green)] hover:underline"
                          >
                            {org.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          </a>
                        </div>
                      )}
                      {org.twitter_handle && (
                        <div className="flex items-center gap-2 text-sm">
                          <Icon name="xLogo" size="s" className="text-[var(--ui-muted)]" />
                          <span className="text-[var(--ui-text)]">@{org.twitter_handle}</span>
                        </div>
                      )}
                      {org.ens_name && (
                        <div className="flex items-center gap-2 text-sm">
                          <Icon name="ethereum" size="s" className="text-[var(--ui-muted)]" />
                          <span className="text-[var(--ui-text)]">{org.ens_name}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-xs text-[var(--ui-muted)]">Wallet:</span>
                      <code className="rounded bg-black/5 dark:bg-white/5 px-2 py-1 text-xs font-mono text-[var(--ui-text)]">
                        {org.wallet.slice(0, 6)}...{org.wallet.slice(-4)}
                      </code>
                      {org.has_coinbase_verification && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ui-brand-green)]/10 px-2 py-1 text-xs font-medium text-[var(--ui-brand-green)]">
                          <Icon name="circleCheckmark" size="xs" />
                          Coinbase Verified
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Button 
                      variant="primary" 
                      compact
                      onClick={() => openApproveModal(org)}
                    >
                      Approve
                    </Button>
                    <Button 
                      variant="secondary" 
                      compact
                      onClick={() => openRejectModal(org)}
                    >
                      Reject
                    </Button>
                    {org.linkedin_url && (
                      <Button 
                        as="a"
                        href={org.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary" 
                        compact
                        transparent
                      >
                        LinkedIn
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approve Modal */}
      <Modal
        visible={showApproveModal}
        onRequestClose={() => !isSubmitting && setShowApproveModal(false)}
      >
        <ModalHeader
          title="Approve Organization"
          closeAccessibilityLabel="Close"
        />
        <ModalBody>
          <div className="space-y-4">
            <p className="text-base text-[var(--ui-text)] leading-relaxed">
              Are you sure you want to approve <strong>{selectedOrg?.name}</strong>?
            </p>
            <p className="text-sm text-[var(--ui-muted)] leading-relaxed">
              This will grant them organization privileges and allow them to create campaigns.
            </p>
          </div>
        </ModalBody>
        <ModalFooter
          primaryAction={
            <Button onClick={handleApprove} disabled={isSubmitting}>
              {isSubmitting ? "Approving..." : "Approve"}
            </Button>
          }
          secondaryAction={
            <Button
              onClick={() => setShowApproveModal(false)}
              variant="secondary"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          }
        />
      </Modal>

      {/* Reject Modal */}
      <Modal
        visible={showRejectModal}
        onRequestClose={() => !isSubmitting && setShowRejectModal(false)}
      >
        <ModalHeader
          title="Reject Organization"
          closeAccessibilityLabel="Close"
        />
        <ModalBody>
          <div className="readable-cds-fields space-y-4">
            <p className="text-base text-[var(--ui-text)] leading-relaxed">
              Are you sure you want to reject <strong>{selectedOrg?.name}</strong>?
            </p>
            <TextInput
              label="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason..."
            />
          </div>
        </ModalBody>
        <ModalFooter
          primaryAction={
            <Button onClick={handleReject} disabled={isSubmitting}>
              {isSubmitting ? "Rejecting..." : "Reject"}
            </Button>
          }
          secondaryAction={
            <Button
              onClick={() => setShowRejectModal(false)}
              variant="secondary"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          }
        />
      </Modal>

      {/* ── Pending Milestone Proofs ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-[var(--ui-text)]">Pending Milestone Proofs</h2>
        <p className="max-w-2xl text-sm text-[var(--ui-muted)]">
          Organizations submit evidence when a milestone is completed. Review the proof, verify with volunteers, then approve (issue EAS attestation) or reject.
        </p>

        {pendingProofs.length === 0 ? (
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-8 text-center">
            <Icon name="circleCheckmark" size="l" className="mx-auto mb-3 text-[var(--ui-brand-green)]" />
            <TextBody className="text-[var(--ui-muted)]">No pending milestone proofs to review</TextBody>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingProofs.map((proof) => (
              <div key={proof.id} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-6">
                <div className="flex items-start gap-6">
                  {proof.org_logo_url ? (
                    <img
                      src={proof.org_logo_url}
                      alt=""
                      className="h-12 w-12 rounded-xl object-cover border border-[var(--ui-border)]"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ui-brand-brown-soft)] border border-[var(--ui-border)]">
                      <Icon name="securityShield" size="m" className="text-[var(--ui-brand-brown)]" />
                    </div>
                  )}

                  <div className="flex-1 space-y-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-[var(--ui-text)]">{proof.title}</h3>
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">
                          Milestone {proof.milestone_index + 1}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-[var(--ui-muted)]">
                        {proof.campaign_title ?? `Campaign #${proof.campaign_id}`}
                        {proof.org_name && <> · {proof.org_name}</>}
                        {" · "}Submitted {formatDate(proof.created_at)}
                      </p>
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ui-text)]">
                      {proof.description}
                    </p>

                    {proof.evidence_urls.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {proof.evidence_urls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ui-brand-green)] hover:bg-[var(--ui-surface)]"
                          >
                            <Icon name="link" size="xs" />
                            Evidence {i + 1}
                          </a>
                        ))}
                        {proof.ipfs_url && (
                          <a
                            href={proof.ipfs_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-1.5 text-xs font-medium text-[var(--ui-muted)] hover:bg-[var(--ui-surface)]"
                          >
                            IPFS metadata
                          </a>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-[var(--ui-muted)]">
                      Submitted by{" "}
                      <code className="rounded bg-black/5 dark:bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
                        {proof.submitter_wallet.slice(0, 6)}...{proof.submitter_wallet.slice(-4)}
                      </code>
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="primary"
                      compact
                      onClick={() => {
                        setSelectedProof(proof);
                        setProofAttestationUid("");
                        setShowProofApproveModal(true);
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      compact
                      onClick={() => {
                        setSelectedProof(proof);
                        setProofRejectNotes("");
                        setShowProofRejectModal(true);
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proof Approve Modal */}
      <Modal
        visible={showProofApproveModal}
        onRequestClose={() => !isProofSubmitting && setShowProofApproveModal(false)}
      >
        <ModalHeader title="Approve Milestone Proof" closeAccessibilityLabel="Close" />
        <ModalBody>
          <div className="readable-cds-fields space-y-4">
            <p className="text-base text-[var(--ui-text)] leading-relaxed">
              Approve <strong>&ldquo;{selectedProof?.title}&rdquo;</strong> for{" "}
              <strong>{selectedProof?.campaign_title}</strong>, milestone {(selectedProof?.milestone_index ?? 0) + 1}?
            </p>
            <p className="text-sm text-[var(--ui-muted)] leading-relaxed">
              Approving will issue the EAS attestation from the connected admin wallet and store its UID automatically.
            </p>
            <TextInput
              label="Existing EAS Attestation UID (optional override)"
              value={proofAttestationUid}
              onChange={(e) => setProofAttestationUid(e.target.value)}
              placeholder="Leave empty to issue automatically"
            />
          </div>
        </ModalBody>
        <ModalFooter
          primaryAction={
            <Button
              onClick={handleApproveProof}
              disabled={isProofSubmitting}
            >
              {isProofSubmitting ? "Issuing attestation..." : "Approve & issue EAS"}
            </Button>
          }
          secondaryAction={
            <Button
              onClick={() => setShowProofApproveModal(false)}
              variant="secondary"
              disabled={isProofSubmitting}
            >
              Cancel
            </Button>
          }
        />
      </Modal>

      {/* Proof Reject Modal */}
      <Modal
        visible={showProofRejectModal}
        onRequestClose={() => !isProofSubmitting && setShowProofRejectModal(false)}
      >
        <ModalHeader title="Reject Milestone Proof" closeAccessibilityLabel="Close" />
        <ModalBody>
          <div className="readable-cds-fields space-y-4">
            <p className="text-base text-[var(--ui-text)] leading-relaxed">
              Reject <strong>&ldquo;{selectedProof?.title}&rdquo;</strong>?
              The organization can resubmit with better evidence.
            </p>
            <TextInput
              label="Reason / notes for the organization"
              value={proofRejectNotes}
              onChange={(e) => setProofRejectNotes(e.target.value)}
              placeholder="What's missing or insufficient..."
            />
          </div>
        </ModalBody>
        <ModalFooter
          primaryAction={
            <Button
              onClick={async () => {
                if (!selectedProof) return;
                setIsProofSubmitting(true);
                try {
                  const res = await adminFetch(
                    `/api/admin/milestone-proofs/${selectedProof.id}/review`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "reject",
                        notes: proofRejectNotes.trim() || undefined,
                      }),
                    },
                  );
                  if (res.ok) {
                    setShowProofRejectModal(false);
                    setSelectedProof(null);
                    await fetchAdminData();
                  } else {
                    const data = await res.json();
                    alert(`Failed: ${data.message || "Unknown error"}`);
                  }
                } catch (e) {
                  alert(`Error: ${(e as Error).message}`);
                } finally {
                  setIsProofSubmitting(false);
                }
              }}
              disabled={isProofSubmitting}
            >
              {isProofSubmitting ? "Rejecting..." : "Reject proof"}
            </Button>
          }
          secondaryAction={
            <Button
              onClick={() => setShowProofRejectModal(false)}
              variant="secondary"
              disabled={isProofSubmitting}
            >
              Cancel
            </Button>
          }
        />
      </Modal>
    </div>
  );
}
