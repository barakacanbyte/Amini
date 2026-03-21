"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { Tag } from "@coinbase/cds-web/tag/Tag";
import { Spinner } from "@coinbase/cds-web/loaders/Spinner";

type HealthResponse = {
  ok: boolean;
  missing: string[];
};

export default function WorldIdDebugPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/world-id/health", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Health endpoint returned ${res.status}`);
      }
      const json = (await res.json()) as HealthResponse;
      setHealth(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="app-page px-4 py-8 md:px-8">
      <div className="app-surface mx-auto max-w-3xl rounded-2xl p-6 md:p-8">
        <Button as={Link} href="/" variant="secondary" compact transparent className="mb-4">
          ← Home
        </Button>
        <TextTitle2 as="h1" className="brand-brown">
          World ID Debug
        </TextTitle2>
        <TextBody as="p" className="app-muted mt-1">
          Backend configuration required for World ID verification.
        </TextBody>

        <div className="app-surface-elev mt-6 rounded-xl p-6">
          {loading ? (
            <div className="flex items-center gap-3">
              <Spinner size={3} accessibilityLabel="Checking health" />
              <TextBody as="p" className="app-muted">Checking health...</TextBody>
            </div>
          ) : error ? (
            <Tag colorScheme="red" emphasis="high">Error: {error}</Tag>
          ) : health?.ok ? (
            <Tag colorScheme="green" emphasis="high">World ID config is healthy</Tag>
          ) : (
            <div>
              <Tag colorScheme="yellow" emphasis="high">World ID config is incomplete</Tag>
              <ul className="app-muted mt-3 list-disc pl-5 text-sm">
                {(health?.missing ?? []).map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </div>
          )}

          <Button
            variant="secondary"
            compact
            className="mt-4"
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        </div>
      </div>
    </main>
  );
}
