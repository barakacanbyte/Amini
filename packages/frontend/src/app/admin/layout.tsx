import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-page">
      <div className="border-b border-[var(--ui-border)] bg-[var(--ui-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/admin" className="app-text text-lg font-semibold">
            Amini · Team
          </Link>
          <Link
            href="/"
            className="app-muted text-sm transition-colors hover:text-[var(--ui-text)]"
          >
            Back to site
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}
