"use client";

import Link from "next/link";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { ExplorerClient } from "./ExplorerClient";

export default function ExplorerPage() {
  return (
    <main className="app-page px-4 py-8 md:px-8">
      <div className="app-surface mx-auto max-w-6xl rounded-2xl p-6 md:p-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <TextTitle2 as="h1" className="brand-brown">
            Transparency Explorer
          </TextTitle2>
          <Button as={Link} href="/campaigns" variant="secondary" compact>
            Campaigns
          </Button>
        </div>
        <TextBody as="p" className="app-muted mb-6">
          Search by campaign ID, wallet address, or transaction hash. Data is read from
          Supabase-indexed chain events.
        </TextBody>
        <ExplorerClient />
      </div>
    </main>
  );
}
