"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle4 } from "@coinbase/cds-web/typography/TextTitle4";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { Spinner } from "@coinbase/cds-web/loaders/Spinner";

type Campaign = {
  id: number;
  owner: string;
  beneficiary: string;
  target_amount: string;
  milestone_count: number;
  created_at: string;
};

type Deposit = {
  tx_hash: string;
  campaign_id: number;
  depositor: string;
  amount: string;
  created_at: string;
};

type Release = {
  tx_hash: string;
  campaign_id: number;
  milestone_index: number;
  amount: string;
  attestation_uid: string | null;
  created_at: string;
};

export function ExplorerClient() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [error, setError] = useState<string | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const runSearch = async () => {
    setError(null);
    if (!supabaseUrl || !anon) {
      setError("Supabase env is missing.");
      return;
    }
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    try {
      const headers: HeadersInit = {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      };

      const isNumeric = /^\d+$/.test(q);
      const walletLike = q.startsWith("0x") && q.length >= 10;
      const txLike = q.startsWith("0x") && q.length >= 32;

      const pubCampaign = `${supabaseUrl}/rest/v1/campaigns?select=id,owner,beneficiary,target_amount,milestone_count,created_at&is_fully_created=eq.true`;
      const campaignUrl = isNumeric
        ? `${pubCampaign}&id=eq.${q}&limit=20`
        : walletLike
          ? `${pubCampaign}&or=(owner.eq.${q.toLowerCase()},beneficiary.eq.${q.toLowerCase()})&limit=20`
          : `${pubCampaign}&limit=0`;

      const depositUrl = txLike
        ? `${supabaseUrl}/rest/v1/escrow_deposits?select=tx_hash,campaign_id,depositor,amount,created_at&tx_hash=eq.${q}&limit=20`
        : walletLike
          ? `${supabaseUrl}/rest/v1/escrow_deposits?select=tx_hash,campaign_id,depositor,amount,created_at&depositor=eq.${q.toLowerCase()}&limit=20`
          : isNumeric
            ? `${supabaseUrl}/rest/v1/escrow_deposits?select=tx_hash,campaign_id,depositor,amount,created_at&campaign_id=eq.${q}&limit=20`
            : `${supabaseUrl}/rest/v1/escrow_deposits?select=tx_hash,campaign_id,depositor,amount,created_at&limit=0`;

      const releaseUrl = txLike
        ? `${supabaseUrl}/rest/v1/milestone_releases?select=tx_hash,campaign_id,milestone_index,amount,attestation_uid,created_at&tx_hash=eq.${q}&limit=20`
        : isNumeric
          ? `${supabaseUrl}/rest/v1/milestone_releases?select=tx_hash,campaign_id,milestone_index,amount,attestation_uid,created_at&campaign_id=eq.${q}&limit=20`
          : `${supabaseUrl}/rest/v1/milestone_releases?select=tx_hash,campaign_id,milestone_index,amount,attestation_uid,created_at&limit=0`;

      const [cRes, dRes, rRes] = await Promise.all([
        fetch(campaignUrl, { headers, cache: "no-store" }),
        fetch(depositUrl, { headers, cache: "no-store" }),
        fetch(releaseUrl, { headers, cache: "no-store" }),
      ]);

      if (!cRes.ok || !dRes.ok || !rRes.ok) {
        throw new Error("Search request failed.");
      }

      setCampaigns((await cRes.json()) as Campaign[]);
      setDeposits((await dRes.json()) as Deposit[]);
      setReleases((await rRes.json()) as Release[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-surface-elev rounded-xl p-6">
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search campaign id, wallet, or tx hash"
          className="input-field min-w-[280px] flex-1"
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        <Button variant="primary" compact onClick={runSearch}>
          Search
        </Button>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2">
          <Spinner size={2} accessibilityLabel="Searching" />
          <TextBody as="span" className="app-muted">Searching...</TextBody>
        </div>
      )}
      {error && (
        <TextBody as="p" className="mt-3" style={{ color: "var(--ui-brand-amber)" }}>
          {error}
        </TextBody>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div>
          <TextTitle4 as="p" className="app-text mb-2">Campaigns</TextTitle4>
          <div className="space-y-2">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="app-surface block rounded-lg p-2 text-xs transition-colors hover:border-[var(--ui-brand-brown)]"
              >
                <p className="app-text font-medium">#{c.id}</p>
                <p className="app-muted">owner {c.owner.slice(0, 10)}...</p>
              </Link>
            ))}
            {campaigns.length === 0 && !loading && (
              <TextBody as="p" className="app-muted text-xs">No campaign matches.</TextBody>
            )}
          </div>
        </div>

        <div>
          <TextTitle4 as="p" className="app-text mb-2">Deposits</TextTitle4>
          <div className="space-y-2">
            {deposits.map((d) => (
              <a
                key={d.tx_hash}
                href={`https://basescan.org/tx/${d.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flow-deposit block text-xs"
              >
                <p className="app-text font-medium">Campaign #{d.campaign_id}</p>
                <p className="app-muted">+{d.amount}</p>
              </a>
            ))}
            {deposits.length === 0 && !loading && (
              <TextBody as="p" className="app-muted text-xs">No deposit matches.</TextBody>
            )}
          </div>
        </div>

        <div>
          <TextTitle4 as="p" className="app-text mb-2">Releases</TextTitle4>
          <div className="space-y-2">
            {releases.map((r) => (
              <a
                key={r.tx_hash}
                href={`https://basescan.org/tx/${r.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flow-release block text-xs"
              >
                <p className="brand-brown font-medium">
                  Campaign #{r.campaign_id} · Milestone {r.milestone_index}
                </p>
                <p className="app-muted">-{r.amount}</p>
              </a>
            ))}
            {releases.length === 0 && !loading && (
              <TextBody as="p" className="app-muted text-xs">No release matches.</TextBody>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
