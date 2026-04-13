"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useWalletClient } from "wagmi";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { initXmtpClient } from "@/lib/xmtp";

export default function MessagesPage() {
  const { data: walletClient } = useWalletClient();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const env = (process.env.NEXT_PUBLIC_XMTP_ENV ?? "dev") as "dev" | "production";

  const enableMessaging = useCallback(async () => {
    if (!walletClient?.account?.address) {
      setHint("Connect your wallet first.");
      return;
    }
    setBusy(true);
    setHint(null);
    try {
      const result = await initXmtpClient(walletClient, env);
      setReady(result.ok);
      setHint(result.ok ? "XMTP is ready. Open someone’s profile and use the message button to chat." : result.message);
    } catch (e) {
      setHint((e as Error).message);
      setReady(false);
    } finally {
      setBusy(false);
    }
  }, [walletClient, env]);

  return (
    <main className="app-page pt-24 pb-16">
      <div className="mx-auto w-full max-w-lg px-4">
        <TextCaption className="mb-2 block uppercase tracking-wider text-[var(--ui-muted)]">
          Inbox
        </TextCaption>
        <TextTitle2 as="h1" className="text-[var(--ui-text)]">
          Messages
        </TextTitle2>
        <TextBody className="mt-4 text-[var(--ui-muted)]">
          Direct chats use XMTP. To start a conversation, open a member’s public profile and tap the floating message
          control in the corner.
        </TextBody>
        <div className="mt-8 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-6 shadow-[var(--ui-shadow-md)]">
          <TextBody className="text-sm text-[var(--ui-text)]">
            {ready
              ? "You’re set up for messaging. Conversation list will appear here in a future update."
              : "Optional: pre-enable XMTP from this page (you can also enable when you send your first message)."}
          </TextBody>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => void enableMessaging()}
            disabled={busy || !walletClient}
            loading={busy}
          >
            {ready ? "Check XMTP again" : "Enable XMTP"}
          </Button>
          {hint ? (
            <p className="mt-3 text-sm text-[var(--ui-muted)]" role="status">
              {hint}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button as={Link} href="/campaigns" variant="secondary">
            Browse campaigns
          </Button>
          <Button as={Link} href="/" variant="secondary" compact transparent>
            Home
          </Button>
        </div>
      </div>
    </main>
  );
}
