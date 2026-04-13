"use client";

import { useState, useEffect } from "react";
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

export default function AdminDashboard() {
  const { adminFetch, isConnected } = useAdminAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrg[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<PendingOrg | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isConnected) {
      fetchAdminData();
    }
  }, [isConnected]);

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, orgsRes] = await Promise.all([
        adminFetch("/api/admin/stats"),
        adminFetch("/api/admin/organizations/pending"),
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
    </div>
  );
}
