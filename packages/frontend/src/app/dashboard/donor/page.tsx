"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, ChevronDown } from "lucide-react";

// Types
interface Campaign {
  id: string;
  title: string;
  description: string;
  disbursed: string;
  goalComplete: number;
  isVerified: boolean;
  isAttested: boolean;
  imageUrl?: string;
  gradientFrom: string;
  gradientTo: string;
}

// Dummy Data Fallback
const DUMMY_CAMPAIGNS: Campaign[] = [
  {
    id: "1",
    title: "Great Green Wall: Sector 7 Restoration",
    description: "Accelerating agroforestry systems in Senegal to combat desertification and support local carbon...",
    disbursed: "72.4k",
    goalComplete: 85,
    isVerified: true,
    isAttested: true,
    gradientFrom: "from-[var(--ui-brand-green)]/20",
    gradientTo: "to-[var(--ui-brand-brown)]/20"
  },
  {
    id: "2",
    title: "Java Aquifer Protection Initiative",
    description: "Implementation of sensor-based groundwater management across 12 vulnerable districts in...",
    disbursed: "145.0k",
    goalComplete: 42,
    isVerified: true,
    isAttested: true,
    gradientFrom: "from-blue-500/20",
    gradientTo: "to-cyan-500/20"
  },
  {
    id: "3",
    title: "Andean Resilience: School Hubs",
    description: "Retrofitting educational facilities with solar grids and digital connectivity in remote Peruvian...",
    disbursed: "21.8k",
    goalComplete: 12,
    isVerified: true,
    isAttested: true,
    gradientFrom: "from-[var(--ui-brand-brown)]/20",
    gradientTo: "to-orange-500/20"
  }
];

export default function DonorDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching data from Supabase/API
    const fetchCampaigns = async () => {
      try {
        // const res = await fetch('/api/campaigns');
        // const data = await res.json();
        const data: Campaign[] = []; // Simulating empty response to trigger dummy data

        if (data && data.length > 0) {
          setCampaigns(data);
        } else {
          setCampaigns(DUMMY_CAMPAIGNS);
        }
      } catch (error) {
        console.error("Failed to fetch campaigns", error);
        setCampaigns(DUMMY_CAMPAIGNS);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCampaigns();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-[var(--ui-text)]">
          Campaign <span className="brand-green">Explorer</span>
        </h1>
        <p className="max-w-3xl text-[var(--ui-muted)]">
          Transparent fund disbursement through the Amini Ledger. High-precision monitoring for global ecological and humanitarian architectural grants.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
        <div className="flex-1 min-w-[200px] space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Search Campaigns</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ui-muted)]" />
            <input 
              type="text" 
              placeholder="Mission name or architect..." 
              className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] py-2.5 pl-10 pr-4 text-sm text-[var(--ui-text)] placeholder-[var(--ui-muted)] outline-none focus:border-[var(--ui-brand-green)] focus:ring-1 focus:ring-[var(--ui-brand-green)]"
            />
          </div>
        </div>
        
        <div className="w-48 space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Region</label>
          <div className="relative">
            <select className="w-full appearance-none rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] py-2.5 pl-4 pr-10 text-sm text-[var(--ui-text)] outline-none focus:border-[var(--ui-brand-green)] focus:ring-1 focus:ring-[var(--ui-brand-green)]">
              <option>All Regions</option>
              <option>Africa</option>
              <option>South America</option>
              <option>Asia</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-[var(--ui-muted)]" />
          </div>
        </div>

        <div className="w-48 space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Cause</label>
          <div className="relative">
            <select className="w-full appearance-none rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] py-2.5 pl-4 pr-10 text-sm text-[var(--ui-text)] outline-none focus:border-[var(--ui-brand-green)] focus:ring-1 focus:ring-[var(--ui-brand-green)]">
              <option>All Causes</option>
              <option>Ecological</option>
              <option>Humanitarian</option>
              <option>Education</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-[var(--ui-muted)]" />
          </div>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ui-brand-green)] border-t-transparent"></div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] shadow-sm transition-all hover:shadow-md">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--ui-surface)]">
                {campaign.isVerified && (
                  <div className="absolute left-3 top-3 z-10 rounded-full bg-[var(--ui-brand-green)]/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ui-brand-green)] backdrop-blur-md border border-[var(--ui-brand-green)]/30">
                    • Verified
                  </div>
                )}
                {/* Placeholder for image or gradient */}
                <div className={`h-full w-full bg-gradient-to-br ${campaign.gradientFrom} ${campaign.gradientTo}`}></div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-bold text-[var(--ui-text)] line-clamp-2">{campaign.title}</h3>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Disbursed</p>
                    <p className="font-mono font-bold text-[var(--ui-text)]">{campaign.disbursed}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[var(--ui-muted)] line-clamp-3">
                  {campaign.description}
                </p>
                
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="uppercase tracking-wider text-[var(--ui-muted)]">Funding Goal</span>
                    <span className="text-[var(--ui-brand-green)]">{campaign.goalComplete}% Complete</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ui-border)]">
                    <div className="h-full rounded-full bg-[var(--ui-brand-green)]" style={{ width: `${campaign.goalComplete}%` }}></div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-[var(--ui-border)] pt-4">
                  {campaign.isAttested ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ui-brand-green)]">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--ui-brand-green)]"></div>
                      EAS ATTESTED
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ui-muted)]">
                      PENDING
                    </div>
                  )}
                  <Link href={`/campaigns/${campaign.id}`} className="text-xs font-bold uppercase tracking-wider text-[var(--ui-brand-green)] hover:text-[var(--ui-brand-green-strong)]">
                    View Ledger →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
