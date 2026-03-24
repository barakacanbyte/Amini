"use client";

import { useState, useEffect } from "react";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { Icon } from "@coinbase/cds-web/icons";

// Types
interface AdminStats {
  totalVolume: string;
  activeCampaigns: number;
  verifiedOrgs: number;
  pendingReviews: number;
}

interface PendingOrg {
  id: string;
  name: string;
  submittedAt: string;
  location: string;
}

// Dummy Data
const DUMMY_STATS: AdminStats = {
  totalVolume: "$1.2M",
  activeCampaigns: 42,
  verifiedOrgs: 18,
  pendingReviews: 5,
};

const DUMMY_ORGS: PendingOrg[] = [
  { id: "1", name: "Global Water Initiative", submittedAt: "2 days ago", location: "Kenya" },
  { id: "2", name: "Solar for Schools", submittedAt: "3 days ago", location: "Peru" },
  { id: "3", name: "Agroforestry Alliance", submittedAt: "5 days ago", location: "Senegal" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrg[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching data from Supabase/API
    const fetchAdminData = async () => {
      try {
        // const res = await fetch('/api/admin/dashboard');
        // const data = await res.json();
        const data: any = null; // Simulating empty response to trigger dummy data

        if (data) {
          setStats(data.stats);
          setPendingOrgs(data.pendingOrgs);
        } else {
          setStats(DUMMY_STATS);
          setPendingOrgs(DUMMY_ORGS);
        }
      } catch (error) {
        console.error("Failed to fetch admin data", error);
        setStats(DUMMY_STATS);
        setPendingOrgs(DUMMY_ORGS);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdminData();
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
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1">
          <div className="divide-y divide-[var(--ui-border)]">
            {pendingOrgs.map((org) => (
              <div key={org.id} className="flex items-center justify-between p-4 hover:bg-[var(--ui-surface-elev)] transition-colors rounded-xl">
                <div>
                  <p className="font-medium text-[var(--ui-text)]">{org.name}</p>
                  <p className="text-sm text-[var(--ui-muted)]">Submitted {org.submittedAt} • {org.location}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" compact>
                    Review
                  </Button>
                  <Button variant="primary" compact>
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
