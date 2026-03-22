"use client";

import { useState, useEffect } from "react";
import { Button } from "@coinbase/cds-web/buttons/Button";
import Link from "next/link";
import { PlusCircle, Activity, ArrowUpRight } from "lucide-react";

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

// Dummy Data
const DUMMY_STATS: OrgStats = {
  totalRaised: "$239.2k",
  activeCampaigns: 3,
  pendingMilestones: 2,
};

const DUMMY_CAMPAIGNS: OrgCampaign[] = [
  {
    id: "1",
    name: "Great Green Wall: Sector 7",
    status: "Active",
    raised: "72.4k",
    goal: "85.0k"
  },
  {
    id: "2",
    name: "Java Aquifer Protection",
    status: "Active",
    raised: "145.0k",
    goal: "350.0k"
  },
  {
    id: "3",
    name: "Andean Resilience",
    status: "Review Pending",
    raised: "21.8k",
    goal: "180.0k"
  }
];

export default function OrganizationDashboard() {
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [campaigns, setCampaigns] = useState<OrgCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching data from Supabase/API
    const fetchOrgData = async () => {
      try {
        // const res = await fetch('/api/organization/dashboard');
        // const data = await res.json();
        const data: any = null; // Simulating empty response to trigger dummy data

        if (data) {
          setStats(data.stats);
          setCampaigns(data.campaigns);
        } else {
          setStats(DUMMY_STATS);
          setCampaigns(DUMMY_CAMPAIGNS);
        }
      } catch (error) {
        console.error("Failed to fetch org data", error);
        setStats(DUMMY_STATS);
        setCampaigns(DUMMY_CAMPAIGNS);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrgData();
  }, []);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-[var(--ui-text)]">
            Organization <span className="brand-brown">Dashboard</span>
          </h1>
          <p className="max-w-xl text-[var(--ui-muted)]">
            Manage your active campaigns, track disbursements, and attest to milestones.
          </p>
        </div>
        <Button 
          as={Link}
          href="/campaigns/create" 
          variant="primary"
          className="inline-flex items-center justify-center gap-2"
        >
          <PlusCircle className="h-4 w-4" />
          Create Campaign
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Total Raised</p>
          <p className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{stats?.totalRaised}</p>
          <div className="mt-2 flex items-center gap-1 text-xs font-medium text-[var(--ui-brand-green)]">
            <ArrowUpRight className="h-3 w-3" />
            <span>+12% this month</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Active Campaigns</p>
          <p className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{stats?.activeCampaigns}</p>
          <div className="mt-2 text-xs font-medium text-[var(--ui-muted)]">
            Across 2 regions
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Pending Milestones</p>
          <p className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{stats?.pendingMilestones}</p>
          <div className="mt-2 text-xs font-medium text-[var(--ui-brand-amber)]">
            Requires attestation
          </div>
        </div>
      </div>

      {/* Active Campaigns List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-[var(--ui-text)]">Your Campaigns</h2>
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
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-[var(--ui-surface-elev)] transition-colors">
                  <td className="px-4 py-4 font-medium text-[var(--ui-text)]">{campaign.name}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      campaign.status === 'Active' 
                        ? 'bg-[var(--ui-brand-green)]/10 text-[var(--ui-brand-green)]'
                        : 'bg-[var(--ui-brand-amber)]/10 text-[var(--ui-brand-amber)]'
                    }`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-[var(--ui-text)]">{campaign.raised}</td>
                  <td className="px-4 py-4 text-right font-mono text-[var(--ui-muted)]">{campaign.goal}</td>
                  <td className="px-4 py-4 text-center">
                    <button className={`font-semibold text-xs uppercase tracking-wider ${
                      campaign.status === 'Active'
                        ? 'text-[var(--ui-brand-green)] hover:text-[var(--ui-brand-green-strong)]'
                        : 'text-[var(--ui-brand-amber)] hover:text-[var(--ui-brand-amber)]'
                    }`}>
                      {campaign.status === 'Active' ? 'Manage' : 'Attest'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
