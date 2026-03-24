"use client";

import { Button } from "@coinbase/cds-web/buttons/Button";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CdpEmbeddedAuth } from "@/components/CdpEmbeddedAuth";
import {
  Wallet,
  ConnectWallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Dropdown, MenuItem } from "@coinbase/cds-web/dropdown";
import { Icon } from "@coinbase/cds-web/icons";

const cdpConfigured = Boolean((process.env.NEXT_PUBLIC_CDP_PROJECT_ID ?? "").trim());

const NAV_ITEMS = [
  { href: "/#overview", label: "Overview", match: (path: string) => path === "/" },
  { href: "/dashboard/donor", label: "Dashboard", match: (path: string) => path.startsWith("/dashboard") },
  { href: "/campaigns", label: "Campaigns", match: (path: string) => path.startsWith("/campaigns") },
  { href: "/explorer", label: "Activity feed", match: (path: string) => path === "/explorer" },
] as const;

const navBaseClass =
  "relative rounded-md px-3 py-2 text-[15px] font-medium transition-colors duration-200 focus-brand";
const navActiveClass =
  "brand-green font-semibold after:absolute after:bottom-1 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-emerald";
const navIdleClass = "app-muted hover:text-emerald";

function NavLink({
  href,
  children,
  isActive,
}: {
  href: string;
  children: ReactNode;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={[navBaseClass, isActive ? navActiveClass : navIdleClass].join(" ")}
    >
      {children}
    </Link>
  );
}

function ProfileMenu() {
  return (
    <Dropdown
      content={
        <div className="flex flex-col min-w-[220px] rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] py-2 shadow-xl dark:bg-[var(--ui-surface)]">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">
            Dashboards
          </div>
          <MenuItem
            as={Link}
            href="/dashboard/donor"
            value="donor"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Icon name="account" size="m" className="text-[var(--ui-muted)]" /> Donor
          </MenuItem>
          <MenuItem
            as={Link}
            href="/dashboard/organization"
            value="organization"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Icon name="peopleGroup" size="m" className="text-[var(--ui-muted)]" /> Organization
          </MenuItem>
          <MenuItem
            as={Link}
            href="/dashboard/admin"
            value="admin"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Icon name="securityShield" size="m" className="text-[var(--ui-muted)]" /> Admin
          </MenuItem>

          <div className="my-1 h-px w-full bg-[var(--ui-border)]" />
          
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--ui-muted)]">
            Actions
          </div>
          <MenuItem
            as={Link}
            href="/organizations/register"
            value="register"
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Icon name="document" size="m" className="text-[var(--ui-muted)]" /> Get Verified
          </MenuItem>
        </div>
      }
      contentPosition={{ placement: "bottom-end", gap: 8 }}
    >
      <button className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] transition-colors hover:bg-black/5 focus:outline-none dark:hover:bg-white/5">
        <Icon name="menu" size="m" className="text-[var(--ui-text)]" />
      </button>
    </Dropdown>
  );
}

export function SiteHeader() {
  const pathname = usePathname();

  // Hide SiteHeader on dashboard routes to allow full-height sidebar
  if (pathname?.startsWith("/dashboard")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[var(--ui-bg)]/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 md:px-8">
        <div className="app-surface flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-4 py-3 sm:gap-4 md:flex-nowrap md:px-6">
          <Link
            href="/"
            className="group shrink-0 flex items-center gap-2.5 rounded-lg py-1 pr-1 transition-opacity hover:opacity-95 focus-brand"
            aria-label="Amini home"
          >
            <Image
              src="/logo.png"
              alt=""
              width={140}
              height={40}
              className="h-8 w-auto max-h-9 object-contain object-left transition-transform duration-200 group-hover:scale-[1.02] sm:h-9 sm:max-h-10"
              priority
            />
            <span className="brand-green text-lg font-bold tracking-tight sm:text-xl">Amini</span>
          </Link>

          <nav
            className="order-3 flex w-full flex-wrap items-center justify-center gap-0.5 md:order-none md:w-auto md:justify-center"
            aria-label="Main"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} href={item.href} isActive={item.match(pathname)}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions amini-header-wallet shrink-0">
            <ThemeToggle />
            {cdpConfigured ? (
              <div
                className="amini-header-cdp-login flex shrink-0 items-center"
                aria-label="Account"
              >
                <CdpEmbeddedAuth />
              </div>
            ) : (
              <Wallet>
                <ConnectWallet disconnectedLabel="Log in" />
                <WalletDropdown>
                  <WalletDropdownDisconnect />
                </WalletDropdown>
              </Wallet>
            )}

            <Button
              as={Link}
              href="/campaigns/create"
              variant="primary"
              compact
              font="label1"
              className="shrink-0 whitespace-nowrap"
            >
              Start a campaign
            </Button>
             <ProfileMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
