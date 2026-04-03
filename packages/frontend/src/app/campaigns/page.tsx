import Link from "next/link";
import {
  getMockCampaignExplorerRows,
  shouldUseMockCampaigns,
} from "@data/mock-data/campaigns";
import {
  CampaignExplorerClient,
  type CampaignExplorerRow,
  type CampaignRow,
} from "./CampaignExplorerClient";

async function loadCampaigns(): Promise<CampaignRow[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const endpoint =
    `${url}/rest/v1/campaigns?select=id,owner,beneficiary,target_amount,milestone_count,metadata_uri,created_at` +
    `&is_fully_created=eq.true&order=id.desc&limit=100`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: "no-store",
  });

  if (!res.ok) return [];
  return (await res.json()) as CampaignRow[];
}

async function loadDepositTotalsByCampaign(
  url: string,
  anonKey: string
): Promise<Map<number, bigint>> {
  const map = new Map<number, bigint>();
  const res = await fetch(
    `${url}/rest/v1/escrow_deposits?select=campaign_id,amount&limit=10000`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      cache: "no-store",
    }
  );
  if (!res.ok) return map;
  const rows = (await res.json()) as Array<{ campaign_id: number; amount: string }>;
  for (const r of rows) {
    const id = r.campaign_id;
    const amt = BigInt(r.amount || "0");
    map.set(id, (map.get(id) ?? BigInt(0)) + amt);
  }
  return map;
}

async function loadAttestedReleaseCounts(
  url: string,
  anonKey: string
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const res = await fetch(
    `${url}/rest/v1/milestone_releases?select=campaign_id,attestation_uid&limit=10000`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      cache: "no-store",
    }
  );
  if (!res.ok) return map;
  const rows = (await res.json()) as Array<{ campaign_id: number; attestation_uid: string | null }>;
  for (const r of rows) {
    if (!r.attestation_uid) continue;
    map.set(r.campaign_id, (map.get(r.campaign_id) ?? 0) + 1);
  }
  return map;
}

function mergeCampaignRows(
  rows: CampaignRow[],
  raised: Map<number, bigint>,
  attested: Map<number, number>
): CampaignExplorerRow[] {
  return rows.map((c) => ({
    ...c,
    total_raised: (raised.get(c.id) ?? BigInt(0)).toString(),
    attested_releases: attested.get(c.id) ?? 0,
  }));
}

export default async function CampaignsPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const campaigns = await loadCampaigns();
  const useMock = shouldUseMockCampaigns(campaigns);

  let enriched: CampaignExplorerRow[] | null = null;
  if (useMock) {
    enriched = getMockCampaignExplorerRows();
  } else if (campaigns !== null) {
    const [raisedMap, attestedMap] =
      url && anonKey
        ? await Promise.all([
            loadDepositTotalsByCampaign(url, anonKey),
            loadAttestedReleaseCounts(url, anonKey),
          ])
        : [new Map<number, bigint>(), new Map<number, number>()];
    enriched = mergeCampaignRows(campaigns, raisedMap, attestedMap);
  }

  return (
    <main className="app-page px-4 py-8 md:px-8">
      <div className="app-surface mx-auto max-w-7xl rounded-2xl p-6 md:p-8">
        <section className="mb-14">
          <div className="max-w-3xl">
            <h1 className="app-text mb-4 text-4xl font-extrabold tracking-tighter md:text-6xl">
              Campaign <span className="brand-green">Explorer</span>
            </h1>
            <p className="app-muted max-w-2xl text-lg font-medium">
              Browse live campaigns on the ledger. Search, filter, and open any campaign to fund,
              follow releases, and review evidence.
            </p>
          </div>

          {useMock && (
            <div className="callout-brown mt-8">
              <p className="app-text text-sm">
                Showing <strong>demo campaigns</strong> from{" "}
                <code className="app-muted text-xs">data/mock-data/campaigns.ts</code>. Configure
                Supabase and run the indexer to replace these with live on-chain data.
              </p>
            </div>
          )}

          {enriched !== null && enriched.length > 0 && (
            <CampaignExplorerClient campaigns={enriched} />
          )}
        </section>
      </div>
    </main>
  );
}
