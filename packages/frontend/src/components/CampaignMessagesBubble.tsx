"use client";

import { useEffect, useRef } from "react";
import { MessageCircle, X, ChevronDown } from "lucide-react";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextHeadline } from "@coinbase/cds-web/typography/TextHeadline";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";

export type XmtpBubbleMessage = {
  id: string;
  senderInboxId: string;
  text: string;
  sentAt: string;
};

type CampaignMessagesBubbleProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isConnected: boolean;
  busy: boolean;
  /** Shown when something went wrong or we need a wallet action; omit technical provider names. */
  statusHint: string;
  xmtpDraft: string;
  onDraftChange: (value: string) => void;
  xmtpPeerAddress: `0x${string}`;
  xmtpInboxId: string | null;
  messages: XmtpBubbleMessage[];
  onSend: () => void;
  /** Panel heading (default: campaign chat). */
  panelTitle?: string;
  /** Accessible name for the dialog region. */
  dialogAriaLabel?: string;
};

/**
 * Fixed bottom-right campaign wallet chat: FAB opens a panel (CDS + Amini tokens).
 */
export function CampaignMessagesBubble({
  open,
  onOpenChange,
  isConnected,
  busy,
  statusHint,
  xmtpDraft,
  onDraftChange,
  xmtpPeerAddress,
  xmtpInboxId,
  messages,
  onSend,
  panelTitle = "Campaign messages",
  dialogAriaLabel = "Campaign messages",
}: CampaignMessagesBubbleProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const peerInvalid =
    xmtpPeerAddress === "0x0000000000000000000000000000000000000000";
  const peerShort = peerInvalid
    ? null
    : `${xmtpPeerAddress.slice(0, 8)}…${xmtpPeerAddress.slice(-4)}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-[100] flex flex-col items-end gap-3 p-4 md:p-6">
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={dialogAriaLabel}
          className="pointer-events-auto flex max-h-[min(520px,calc(100vh-7rem))] w-[min(100vw-2rem,400px)] flex-col overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] shadow-[var(--ui-shadow-lg)]"
          style={{ boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--ui-border)] px-4 py-3"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--ui-brand-green) 12%, var(--ui-surface-elev)) 0%, var(--ui-surface-elev) 100%)",
            }}
          >
            <div className="min-w-0">
              <TextHeadline as="h2" className="truncate text-base text-[var(--ui-text)]">
                {panelTitle}
              </TextHeadline>
              <TextCaption as="p" className="mt-0.5 truncate text-[var(--ui-muted)]">
                {peerShort
                  ? `Chat with ${peerShort}`
                  : isConnected
                    ? "Campaign wallets are not available for chat yet"
                    : "Connect your wallet to chat"}
              </TextCaption>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg)] text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface)]"
              aria-label="Minimize messages"
            >
              <ChevronDown className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-[140px] flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-[var(--ui-muted)]">No messages in this thread yet.</p>
              ) : (
                messages.map((m) => {
                  const mine = Boolean(xmtpInboxId && m.senderInboxId === xmtpInboxId);
                  return (
                    <div
                      key={m.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          mine
                            ? "rounded-br-md bg-[var(--ui-brand-green)] text-white"
                            : "rounded-bl-md border border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text)]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p
                          className={`mt-1 text-[10px] ${mine ? "text-white/80" : "text-[var(--ui-muted)]"}`}
                        >
                          {new Date(m.sentAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="shrink-0 border-t border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
              {statusHint ? (
                <p className="mb-2 text-xs text-[var(--ui-muted)]" role="status">
                  {statusHint}
                </p>
              ) : null}
              <textarea
                value={xmtpDraft}
                onChange={(e) => onDraftChange(e.target.value)}
                rows={2}
                placeholder={isConnected ? "Write a message…" : "Connect your wallet to send a message"}
                disabled={!isConnected || busy}
                className="mb-2 w-full resize-none rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-3 py-2 text-sm text-[var(--ui-text)] placeholder-[var(--ui-muted)] focus:border-[var(--ui-brand-green)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus-ring)] disabled:opacity-50"
              />
              <Button
                variant="primary"
                compact
                className="w-full"
                onClick={() => {
                  onSend();
                }}
                disabled={!isConnected || !xmtpDraft.trim() || busy || peerInvalid}
                loading={busy}
              >
                {busy ? "…" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-[color-mix(in_oklab,var(--ui-brand-green)_50%,var(--ui-border))] bg-[var(--ui-brand-green)] text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus-ring)]"
        style={{ boxShadow: "0 8px 24px -4px rgba(16, 185, 129, 0.55)" }}
        aria-expanded={open}
        aria-label={open ? `Close ${panelTitle.toLowerCase()}` : `Open ${panelTitle.toLowerCase()}`}
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <MessageCircle className="h-7 w-7" aria-hidden />}
      </button>
    </div>
  );
}
