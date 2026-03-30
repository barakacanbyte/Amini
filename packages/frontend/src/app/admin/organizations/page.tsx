"use client";

import { useState, useEffect } from "react";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { Icon } from "@coinbase/cds-web/icons";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextTitle4 } from "@coinbase/cds-web/typography/TextTitle4";

interface Organization {
  id: string;
  wallet: string;
  name: string;
  description?: string;
  website_url?: string;
  country?: string;
  status: "pending" | "approved" | "rejected";
  official_email?: string;
  twitter_handle?: string;
  linkedin_url?: string;
  ens_name?: string;
  has_coinbase_verification?: boolean;
  logo_url?: string;
  created_at: string;
  verified_at?: string;
}

type FilterStatus = "all" | "pending" | "approved" | "rejected";

export default function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    setIsLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !anonKey) {
        console.error("Supabase configuration missing");
        return;
      }

      const res = await fetch(
        `${supabaseUrl}/rest/v1/organizations?select=id,wallet,name,description,website_url,country,status,official_email,twitter_handle,linkedin_url,ens_name,has_coinbase_verification,logo_url,created_at,verified_at&order=created_at.desc`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setOrganizations(data);
      }
    } catch (error) {
      console.error("Failed to fetch organizations", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (orgId: string) => {
    if (!confirm("Approve this organization?")) return;

    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/approve`, {
        method: "POST",
      });

      if (res.ok) {
        await fetchOrganizations();
      } else {
        const data = await res.json();
        alert(`Failed to approve: ${data.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Approval error:", error);
      alert("Failed to approve organization");
    }
  };

  const handleReject = async (orgId: string) => {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;

    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (res.ok) {
        await fetchOrganizations();
      } else {
        const data = await res.json();
        alert(`Failed to reject: ${data.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Rejection error:", error);
      alert("Failed to reject organization");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const filteredOrgs = organizations.filter((org) => {
    const matchesFilter = filter === "all" || org.status === filter;
    const matchesSearch =
      !searchQuery ||
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.wallet.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.country?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-[var(--ui-brand-green)]/10 text-[var(--ui-brand-green)]";
      case "pending":
        return "bg-[var(--ui-brand-amber)]/10 text-[var(--ui-brand-amber)]";
      case "rejected":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ui-brand-green)] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="app-surface mx-auto max-w-7xl rounded-2xl p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <TextTitle2 as="h1" className="app-text">
            Organizations Management
          </TextTitle2>
          <TextBody as="p" className="app-muted mt-2">
            Review and manage all organization registrations
          </TextBody>
        </div>
        <Button onClick={fetchOrganizations} variant="secondary" compact>
          <Icon name="refresh" size="s" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <div className="relative">
            <Icon
              name="search"
              size="s"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-muted)]"
            />
            <input
              type="text"
              placeholder="Search by name, wallet, or country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-10 py-2 text-sm text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus-ring)]"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {(["all", "pending", "approved", "rejected"] as FilterStatus[]).map((status) => (
            <Button
              key={status}
              onClick={() => setFilter(status)}
              variant={filter === status ? "primary" : "secondary"}
              compact
              transparent={filter !== status}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4">
          <p className="text-xs font-medium text-[var(--ui-muted)]">Total</p>
          <p className="text-2xl font-bold text-[var(--ui-text)]">{organizations.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4">
          <p className="text-xs font-medium text-[var(--ui-muted)]">Approved</p>
          <p className="text-2xl font-bold text-[var(--ui-brand-green)]">
            {organizations.filter((o) => o.status === "approved").length}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4">
          <p className="text-xs font-medium text-[var(--ui-muted)]">Pending</p>
          <p className="text-2xl font-bold text-[var(--ui-brand-amber)]">
            {organizations.filter((o) => o.status === "pending").length}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4">
          <p className="text-xs font-medium text-[var(--ui-muted)]">Rejected</p>
          <p className="text-2xl font-bold text-red-500">
            {organizations.filter((o) => o.status === "rejected").length}
          </p>
        </div>
      </div>

      {/* Organizations List */}
      {filteredOrgs.length === 0 ? (
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-12 text-center">
          <Icon name="search" size="l" className="mx-auto mb-3 text-[var(--ui-muted)]" />
          <TextBody className="text-[var(--ui-muted)]">
            No organizations found matching your filters
          </TextBody>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrgs.map((org) => (
            <div
              key={org.id}
              className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5"
            >
              <div className="flex items-start gap-4">
                {/* Logo */}
                {org.logo_url ? (
                  <img
                    src={org.logo_url}
                    alt={org.name}
                    className="h-14 w-14 rounded-lg object-cover border border-[var(--ui-border)]"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--ui-brand-brown-soft)] border border-[var(--ui-border)]">
                    <Icon name="peopleGroup" size="m" className="text-[var(--ui-brand-brown)]" />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <TextTitle4 as="h3" className="app-text">
                          {org.name}
                        </TextTitle4>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClass(org.status)}`}
                        >
                          {org.status}
                        </span>
                        {org.has_coinbase_verification && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ui-brand-green)]/10 px-2 py-0.5 text-xs font-medium text-[var(--ui-brand-green)]">
                            <Icon name="checkCircle" size="xs" />
                            CB Verified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--ui-muted)] mt-1">
                        Registered {formatDate(org.created_at)}
                        {org.verified_at && ` • Verified ${formatDate(org.verified_at)}`}
                      </p>
                    </div>

                    {/* Actions */}
                    {org.status === "pending" && (
                      <div className="flex gap-2">
                        <Button variant="primary" compact onClick={() => handleApprove(org.id)}>
                          Approve
                        </Button>
                        <Button variant="secondary" compact onClick={() => handleReject(org.id)}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>

                  {org.description && (
                    <TextBody className="text-[var(--ui-text)] mt-2 line-clamp-2">
                      {org.description}
                    </TextBody>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Icon name="wallet" size="xs" className="text-[var(--ui-muted)]" />
                      <code className="font-mono text-[var(--ui-text)]">
                        {org.wallet.slice(0, 6)}...{org.wallet.slice(-4)}
                      </code>
                    </div>
                    {org.country && (
                      <div className="flex items-center gap-1.5">
                        <Icon name="globe" size="xs" className="text-[var(--ui-muted)]" />
                        <span className="text-[var(--ui-text)]">{org.country}</span>
                      </div>
                    )}
                    {org.official_email && (
                      <div className="flex items-center gap-1.5">
                        <Icon name="email" size="xs" className="text-[var(--ui-muted)]" />
                        <span className="text-[var(--ui-text)]">{org.official_email}</span>
                      </div>
                    )}
                    {org.website_url && (
                      <a
                        href={org.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[var(--ui-brand-green)] hover:underline"
                      >
                        <Icon name="link" size="xs" />
                        Website
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
