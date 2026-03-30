"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@coinbase/cds-web/icons";
import Image from "next/image";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppTheme } from "@/context/AppThemeContext";
import { useAminiSigning } from "@/context/AminiSigningContext";

export type DashboardRole = "donor" | "organization" | "admin";

interface SidebarProps {
  role: DashboardRole;
  onRoleChange: (role: DashboardRole) => void;
}

export function Sidebar({ role, onRoleChange }: SidebarProps) {
  const pathname = usePathname();
  const { address } = useAminiSigning();
  const { mounted } = useAppTheme();

  const navItems = {
    donor: [
      { name: "General", href: "/dashboard/donor", icon: "dashboard" as const },
      { name: "My Donations", href: "/dashboard/donor/donations", icon: "activity" as const },
      { name: "Tax Receipts", href: "/dashboard/donor/receipts", icon: "document" as const },
      { name: "Settings", href: "/dashboard/donor/settings", icon: "settings" as const },
    ],
    organization: [
      { name: "General", href: "/dashboard/organization", icon: "dashboard" as const },
      { name: "My Campaigns", href: "/dashboard/organization/campaigns", icon: "megaphone" as const },
      { name: "Disbursements", href: "/dashboard/organization/disbursements", icon: "activity" as const },
      { name: "Settings", href: "/dashboard/organization/settings", icon: "settings" as const },
    ],
    admin: [
      { name: "Overview", href: "/dashboard/admin", icon: "dashboard" as const },
      { name: "All Campaigns", href: "/dashboard/admin/campaigns", icon: "megaphone" as const },
      { name: "Users", href: "/dashboard/admin/users", icon: "peopleGroup" as const },
      { name: "Verification", href: "/dashboard/admin/verification", icon: "securityShield" as const },
      { name: "Settings", href: "/dashboard/admin/settings", icon: "settings" as const },
    ],
  };

  const currentNav = navItems[role];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-[var(--ui-border)] bg-[var(--ui-surface)]">
      <div className="flex h-16 shrink-0 items-center px-6">
        <Link href="/" className="flex items-center gap-2 focus-brand">
          <Image src="/logo.png" alt="Amini" width={100} height={28} className="h-7 w-auto" />
          <span className="brand-green text-lg font-bold tracking-tight">Amini</span>
        </Link>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* Role Switcher */}
        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-1">
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value as DashboardRole)}
            className="w-full rounded-lg bg-transparent px-3 py-2 text-sm font-medium text-[var(--ui-text)] outline-none focus:ring-2 focus:ring-[var(--ui-focus-ring)]"
          >
            <option value="donor">Donor View</option>
            <option value="organization">Organization View</option>
            <option value="admin">Admin View</option>
          </select>
        </div>

        {/* Wallet Status */}
        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">Wallet Status</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[var(--ui-brand-green)]"></div>
            <p className="font-mono text-sm text-[var(--ui-text)]">
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {currentNav.map((item) => {
          const isExactMatch = pathname === item.href;
          const isSubpageMatch = item.href !== `/dashboard/${role}` && pathname?.startsWith(`${item.href}/`);
          const isActive = isExactMatch || isSubpageMatch;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--ui-brand-green)] text-white"
                  : "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-elev)] hover:text-[var(--ui-text)]"
              }`}
            >
              <Icon name={item.icon} size="m" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--ui-border)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--ui-muted)]">
            {mounted ? "Theme" : ""}
          </span>
          <ThemeToggle />
        </div>
        <div className="flex justify-between text-xs text-[var(--ui-muted)]">
          <Link href="/privacy" className="hover:text-[var(--ui-text)]">Privacy</Link>
          <Link href="/terms" className="hover:text-[var(--ui-text)]">Terms</Link>
        </div>
      </div>
    </aside>
  );
}
