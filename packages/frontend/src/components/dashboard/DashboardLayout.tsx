"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Sidebar, DashboardRole } from "@/components/dashboard/Sidebar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Determine initial role from pathname
  const getInitialRole = (): DashboardRole => {
    if (pathname?.startsWith("/dashboard/admin")) return "admin";
    if (pathname?.startsWith("/dashboard/organization")) return "organization";
    return "donor";
  };

  const [role, setRole] = useState<DashboardRole>(getInitialRole());

  // Update role if pathname changes externally
  useEffect(() => {
    setRole(getInitialRole());
  }, [pathname]);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Esc to close + body scroll lock while open
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const handleRoleChange = (newRole: DashboardRole) => {
    setRole(newRole);
    router.push(`/dashboard/${newRole}`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--ui-bg)] lg:flex-row">
      {/* Desktop sidebar (always in DOM at lg+) */}
      <div className="hidden lg:flex">
        <Sidebar role={role} onRoleChange={handleRoleChange} />
      </div>

      {/* Mobile topbar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-[var(--ui-border)] bg-[var(--ui-bg)]/95 px-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open dashboard menu"
          aria-expanded={drawerOpen}
          aria-controls="dashboard-drawer"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] text-[var(--ui-text)] transition-colors hover:bg-black/5 focus-brand dark:hover:bg-white/5"
        >
          <Menu className="h-[20px] w-[20px]" strokeWidth={2} aria-hidden />
        </button>
        <Link href="/" className="flex items-center gap-2 focus-brand" aria-label="Amini home">
          <Image src="/logo.png" alt="" width={100} height={28} className="h-7 w-auto" priority />
          <span className="brand-green text-base font-bold tracking-tight">Amini</span>
        </Link>
        <div className="w-11" aria-hidden />
      </header>

      {/* Mobile drawer */}
      <div
        id="dashboard-drawer"
        className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          aria-label="Close dashboard menu"
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity motion-reduce:transition-none ${drawerOpen ? "opacity-100" : "opacity-0"}`}
          tabIndex={drawerOpen ? 0 : -1}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard navigation"
          className={`absolute left-0 top-0 h-full w-[85vw] max-w-[288px] overflow-y-auto shadow-2xl transition-transform duration-200 motion-reduce:transition-none ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <Sidebar role={role} onRoleChange={handleRoleChange} />
        </div>
      </div>

      <main className="min-h-screen flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 md:p-8 lg:p-10">
          {children}
        </div>
      </main>
    </div>
  );
}
