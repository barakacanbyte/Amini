import Link from "next/link";
import { CampaignExplorerClient } from "./CampaignExplorerClient";
import { CampaignsHero, CampaignsSectionDivider } from "./CampaignsHero";
import { loadCampaignsForExplorer } from "@/lib/loadCampaignsExplorer";

export default async function CampaignsPage() {
  const result = await loadCampaignsForExplorer();

  return (
    <main className="app-page px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <CampaignsHero />

        {result.kind === "unconfigured" && (
          <div className="callout-brown mt-6">
            <p className="app-text text-sm">
              Campaign data is not available: set{" "}
              <code className="app-muted text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="app-muted text-xs">SUPABASE_SERVICE_ROLE_KEY</code> on the server
              (same as campaign creation) so the explorer can load from the database.
            </p>
          </div>
        )}

        {result.kind === "error" && (
          <div className="callout-brown mt-6">
            <p className="app-text text-sm">
              Could not load campaigns from the database.{" "}
              <span className="app-muted font-mono text-xs">{result.message}</span>
            </p>
          </div>
        )}

        {result.kind === "ok" && result.rows.length === 0 && (
          <>
            <CampaignsSectionDivider />
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-6 py-14 text-center shadow-[var(--ui-shadow-md)]">
              <p className="app-muted mb-4 text-base">
                No published campaigns yet. Create one to see it listed here after it is saved to the
                database.
              </p>
              <Link
                href="/campaigns/create"
                className="btn-green btn-base inline-block rounded-full font-bold"
              >
                Start a campaign
              </Link>
            </div>
          </>
        )}

        {result.kind === "ok" && result.rows.length > 0 && (
          <CampaignExplorerClient campaigns={result.rows} />
        )}
      </div>
    </main>
  );
}
