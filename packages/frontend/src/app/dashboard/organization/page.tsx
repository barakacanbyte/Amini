"use client";

import { useState, useEffect } from "react";
import { Button } from "@coinbase/cds-web/buttons/Button";
import Link from "next/link";
import { Icon } from "@coinbase/cds-web/icons";
import { useAminiSigning } from "@/context/AminiSigningContext";

// Types
interface OrgStats {
  totalRaised: string;
  activeCampaigns: number;
  pendingMilestones: number;
}

interface OrgCampaign {
  id: string;
  name: string;
  status: "Active" | "Review Pending" | "Completed";
  raised: string;
  goal: string;
}

const EMPTY_STATS: OrgStats = {
  totalRaised: "$0",
  activeCampaigns: 0,
  pendingMilestones: 0,
};

type OrgListRow = { id: string; name: string; status: string };

export default function OrganizationDashboard() {
  const { address, isConnected } = useAminiSigning();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [campaigns, setCampaigns] = useState<OrgCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [myOrgs, setMyOrgs] = useState<OrgListRow[]>([]);

  useEffect(() => {
    if (!address || !isConnected) {
      setMyOrgs([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/organizations?wallet=${encodeURIComponent(address)}&list=1`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; organizations?: OrgListRow[] }) => {
        if (!cancelled && j.ok && Array.isArray(j.organizations)) setMyOrgs(j.organizations);
      })
      .catch(() => {
        if (!cancelled) setMyOrgs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  useEffect(() => {
    if (!address || !isConnected) {
      setStats(EMPTY_STATS);
      setCampaigns([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/organization/dashboard?wallet=${encodeURIComponent(address)}`)
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          stats?: OrgStats;
          campaigns?: OrgCampaign[];
          message?: string;
        }) => {
          if (cancelled) return;
          if (j.ok && j.stats && Array.isArray(j.campaigns)) {
            setStats(j.stats);
            setCampaigns(j.campaigns);
          } else {
            setStats(EMPTY_STATS);
            setCampaigns([]);
          }
        },
      )
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to fetch org dashboard", error);
        setStats(EMPTY_STATS);
        setCampaigns([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-[var(--ui-text)]">
            Organization <span className="brand-brown">Dashboard</span>
          </h1>
          <p className="max-w-xl text-[var(--ui-muted)]">
            Manage your active campaigns, track disbursements, and attest to milestones.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {address ? (
            <Button
              as={Link}
              href={`/profile/${address.toLowerCase()}`}
              variant="secondary"
              compact
              font="label1"
              className="shrink-0 whitespace-nowrap !px-5"
              startIcon="account"
              startIconActive
            >
              My profile
            </Button>
          ) : null}
          <Button
            as={Link}
            href="/campaigns/create"
            variant="primary"
            compact
            font="label1"
            className="shrink-0 whitespace-nowrap !px-5"
            startIcon="add"
            startIconActive
          >
            Create Campaign
          </Button>
        </div>
      </div>

      {address && myOrgs.length > 0 ? (
        <section
          className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5 shadow-[var(--ui-shadow-md)] sm:p-6"
          aria-labelledby="org-public-profiles-heading"
        >
          <h2
            id="org-public-profiles-heading"
            className="text-lg font-bold tracking-tight text-[var(--ui-text)]"
          >
            Public organization {myOrgs.length === 1 ? "profile" : "profiles"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ui-muted)]">
            {myOrgs.length === 1
              ? "Open your public page to edit branding, write posts, and share your link."
              : "You have multiple organizations—each has its own public page, posts, and link. Pick the one you want to view or update."}
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {myOrgs.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/organizations/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 transition-colors hover:border-[var(--ui-brand-green)]/50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon name="peopleGroup" size="m" className="shrink-0 text-[var(--ui-muted)]" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[var(--ui-text)]">{o.name}</span>
                      <span className="text-xs text-[var(--ui-muted)]">Profile &amp; posts</span>
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      o.status === "approved"
                        ? "bg-emerald-500/15 text-emerald-950 dark:text-emerald-200"
                        : o.status === "pending"
                          ? "bg-amber-500/15 text-amber-900 dark:text-amber-200"
                          : "bg-[var(--ui-surface-elev)] text-[var(--ui-muted)]"
                    }`}
                  >
                    {o.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-[var(--ui-border)] pt-4">
            <Link
              href="/organizations/register"
              className="text-sm font-medium text-[var(--ui-brand-green)] hover:underline"
            >
              Register another organization
            </Link>
          </div>
        </section>
      ) : address && myOrgs.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-elev)]/60 p-5 sm:p-6">
          <p className="text-sm text-[var(--ui-muted)]">
            You have no registered organizations yet. Register to get a public profile page and post updates.
          </p>
          <Button as={Link} href="/organizations/register" variant="secondary" className="mt-3">
            Register organization
          </Button>
        </section>
      ) : null}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Total Raised</p>
          <p className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{stats?.totalRaised ?? "$0"}</p>
          <div className="mt-2 text-xs font-medium text-[var(--ui-muted)]">
            Across all campaigns
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Active Campaigns</p>
          <p className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{stats?.activeCampaigns ?? 0}</p>
          <div className="mt-2 text-xs font-medium text-[var(--ui-muted)]">
            Currently fundraising
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Pending Milestones</p>
          <p className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{stats?.pendingMilestones ?? 0}</p>
          <div className="mt-2 text-xs font-medium text-[var(--ui-brand-amber)]">
            Awaiting review
          </div>
        </div>
      </div>

      {/* Active Campaigns List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-[var(--ui-text)]">Your Campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-elev)]/60 p-6 text-center">
            <p className="text-sm text-[var(--ui-muted)]">
              You have not created any campaigns yet.
            </p>
            <Button
              as={Link}
              href="/campaigns/create"
              variant="primary"
              compact
              font="label1"
              className="mt-4 shrink-0 whitespace-nowrap"
              startIcon="add"
              startIconActive
            >
              Create your first campaign
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--ui-border)] bg-[var(--ui-surface-elev)]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-[var(--ui-muted)]">Campaign Name</th>
                  <th className="px-4 py-3 font-semibold text-[var(--ui-muted)]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[var(--ui-muted)] text-right">Raised</th>
                  <th className="px-4 py-3 font-semibold text-[var(--ui-muted)] text-right">Goal</th>
                  <th className="px-4 py-3 font-semibold text-[var(--ui-muted)] text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ui-border)]">
                {campaigns.map((campaign) => {
                  const statusClass =
                    campaign.status === "Active"
                      ? "bg-[var(--ui-brand-green)]/10 text-[var(--ui-brand-green)]"
                      : campaign.status === "Review Pending"
                        ? "bg-[var(--ui-brand-amber)]/10 text-[var(--ui-brand-amber)]"
                        : "bg-[var(--ui-surface-elev)] text-[var(--ui-muted)]";
                  return (
                    <tr key={campaign.id} className="hover:bg-[var(--ui-surface-elev)] transition-colors">
                      <td className="px-4 py-4 font-medium text-[var(--ui-text)]">{campaign.name}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${statusClass}`}>
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-[var(--ui-text)]">{campaign.raised}</td>
                      <td className="px-4 py-4 text-right font-mono text-[var(--ui-muted)]">{campaign.goal}</td>
                      <td className="px-4 py-4 text-center">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
                            campaign.status === "Review Pending"
                              ? "bg-[var(--ui-brand-amber)]/10 text-[var(--ui-brand-amber)] hover:bg-[var(--ui-brand-amber)]/20"
                              : "bg-[var(--ui-brand-green)]/10 text-[var(--ui-brand-green)] hover:bg-[var(--ui-brand-green)]/20"
                          }`}
                        >
                          {campaign.status === "Review Pending" ? "Attest" : "Manage"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
