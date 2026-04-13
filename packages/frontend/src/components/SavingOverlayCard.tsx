"use client";

export function SavingOverlayCard({
  open,
  title,
  subtitle,
  spinnerLabel,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  spinnerLabel: string;
}) {
  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-[var(--ui-surface-elev)]/88 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="campaign-card campaign-card-green-border mx-4 w-full max-w-[min(100%,22rem)] px-6 py-8 shadow-[var(--ui-shadow-md)]">
        <div className="flex flex-col items-center gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--ui-surface)] shadow-[inset_0_0_0_1px_var(--ui-border)]">
            <span className="sr-only">{spinnerLabel}</span>
            <div
              className="h-11 w-11 animate-spin rounded-full border-[3px] border-[var(--ui-border)] border-t-[var(--ui-brand-green)]"
              aria-hidden
            />
          </div>
          <div className="w-full space-y-2 text-center">
            <p className="m-0 block w-full text-base font-semibold leading-snug text-[var(--ui-text)]">{title}</p>
            <p className="m-0 block w-full text-sm leading-relaxed text-[var(--ui-muted)]">{subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
