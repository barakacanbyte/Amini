"use client";

import { Button } from "@coinbase/cds-web/buttons/Button";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useAminiSigning } from "@/context/AminiSigningContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignOutButton } from "@coinbase/cdp-react";
import { CdpEmbeddedAuth } from "@/components/CdpEmbeddedAuth";
import {
  Wallet,
  ConnectWallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Dropdown, MenuItem } from "@coinbase/cds-web/dropdown";
import { Icon } from "@coinbase/cds-web/icons";
import { Activity, Bell, MessageCircle } from "lucide-react";
import { getCdpWalletConfig } from "@/lib/cdpWalletConfig";
import { cn } from "@/lib/cn";
import { RequireAuthButtonLink } from "@/components/RequireAuthButtonLink";

const NAV_ITEMS = [
  { href: "/#overview", label: "Overview", match: (path: string) => path === "/" },
  { href: "/campaigns", label: "Campaigns", match: (path: string) => path.startsWith("/campaigns") },
  { href: "/activity", label: "Activity feed", match: (path: string) => path === "/activity" },
] as const;

const navBaseClass =
  "relative rounded-md px-3 py-2 text-[15px] font-medium transition-colors duration-200 focus-brand";
const navActiveClass =
  "brand-green font-semibold after:absolute after:bottom-1 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-emerald";
const navIdleClass =
  "text-[color-mix(in_oklab,var(--ui-text)_80%,transparent)] hover:text-[var(--ui-text)] dark:text-[color-mix(in_oklab,var(--ui-text)_88%,transparent)] dark:hover:text-[var(--ui-text)]";

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

type OrgRow = { id: string; name: string; status: string };

function useCompactHeaderNav() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return compact;
}

function ProfileMenu() {
  const pathname = usePathname();
  const compactNav = useCompactHeaderNav();
  const cdpConfigured = Boolean(getCdpWalletConfig());
  const { address, isConnected } = useAminiSigning();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [publicProfileSlug, setPublicProfileSlug] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !isConnected) {
      setOrgs([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/organizations?wallet=${encodeURIComponent(address)}&list=1`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; organizations?: OrgRow[] }) => {
        if (!cancelled && j.ok && Array.isArray(j.organizations)) setOrgs(j.organizations);
      })
      .catch(() => {
        if (!cancelled) setOrgs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  useEffect(() => {
    if (!address || !isConnected) {
      setPublicProfileSlug(null);
      setAvatarUrl(null);
      setProfileName(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/profiles/${encodeURIComponent(address.toLowerCase())}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          profile?: { profile_slug?: string | null; avatar_url?: string | null; name?: string | null } | null;
        }) => {
        if (cancelled) return;
        const slug = j?.ok && j.profile?.profile_slug ? String(j.profile.profile_slug).trim() : "";
        setPublicProfileSlug(slug || null);
        const avatar =
          j?.ok && j.profile?.avatar_url ? String(j.profile.avatar_url).trim() : "";
        setAvatarUrl(avatar || null);
        const name = j?.ok && j.profile?.name ? String(j.profile.name).trim() : "";
        setProfileName(name || null);
      })
      .catch(() => {
        if (!cancelled) setPublicProfileSlug(null);
        if (!cancelled) setAvatarUrl(null);
        if (!cancelled) setProfileName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  const profileHref = address
    ? `/profile/${encodeURIComponent(publicProfileSlug ?? address.toLowerCase())}`
    : "/dashboard/donor";

  const displayName = profileName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Account");
  const displayEmail = address || "Connect wallet";
  const displayEmailCompact = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connect wallet";
  const menuItemClass =
    "flex items-center gap-3 px-3 py-1.5 text-[13px] font-medium rounded-xl transition-colors hover:bg-black/5 dark:hover:bg-white/5";
  const sectionLabelClass =
    "px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-muted)]";

  return (
    <div className="group relative">
      <Dropdown
        maxHeight={compactNav ? 520 : 9999}
        content={
          <div className="flex max-h-[70vh] min-w-[240px] max-w-[calc(100vw-2rem)] flex-col overflow-auto rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-2 shadow-xl dark:bg-[var(--ui-surface)]">
            {compactNav ? (
              <>
                {address ? (
                  <MenuItem
                    as={Link}
                    href={profileHref}
                    value="profile"
                    className="mb-1 flex items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 transition-colors hover:bg-black/5 dark:bg-[var(--ui-surface)] dark:hover:bg-white/5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--ui-brand-green)]/10">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Icon name="account" size="m" className="text-[var(--ui-brand-green)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold leading-tight text-[var(--ui-text)]">
                        {displayName}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] leading-tight text-[var(--ui-muted)]">
                        {displayEmailCompact}
                      </div>
                    </div>
                  </MenuItem>
                ) : (
                  <div className="mb-1 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 dark:bg-[var(--ui-surface)]">
                    <div className="text-[12px] font-semibold leading-tight text-[var(--ui-text)]">
                      {displayName}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] leading-tight text-[var(--ui-muted)]">
                      {displayEmailCompact}
                    </div>
                  </div>
                )}

                <div className={sectionLabelClass}>Browse</div>
                {NAV_ITEMS.filter((item) => item.href !== "/activity").map((item) => {
                  const isActive = item.match(pathname);
                  return (
                    <MenuItem
                      key={item.href}
                      as={Link}
                      href={item.href}
                      value={`nav-${item.href}`}
                      className={cn(
                        menuItemClass,
                        isActive && "brand-green font-semibold bg-[var(--ui-brand-green)]/10",
                      )}
                    >
                      {item.label}
                    </MenuItem>
                  );
                })}
                <div className="my-2 h-px w-full bg-[var(--ui-border)]" />
              </>
            ) : null}
            
            {/* Wallet / CDP: on sm+ the trigger already shows the user label — hide duplicate CDP row when signed in */}
            {!compactNav ? (
              <div
                className={cn(
                  "amini-header-wallet border-b border-[var(--ui-border)] px-2 pb-3 pt-1",
                  cdpConfigured && address && "sm:hidden",
                )}
              >
                {cdpConfigured ? (
                  <div className="amini-header-cdp-login flex flex-col items-stretch" aria-label="Account">
                    <CdpEmbeddedAuth />
                  </div>
                ) : (
                  <div className="flex justify-center px-1">
                    <Wallet>
                      <ConnectWallet disconnectedLabel="Log in" />
                      <WalletDropdown>
                        <WalletDropdownDisconnect />
                      </WalletDropdown>
                    </Wallet>
                  </div>
                )}
              </div>
            ) : null}

            {address ? (
              <>
                {/* Organizations Section */}
                {orgs.length > 0 ? (
                  <>
                    <div className={sectionLabelClass}>Organizations</div>
                    {orgs.map((o) => (
                      <MenuItem
                        key={o.id}
                        as={Link}
                        href={`/organizations/${o.id}`}
                        value={`org-${o.id}`}
                        className={menuItemClass}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ui-brand-brown)]/10">
                          <Icon name="peopleGroup" size="m" className="text-[var(--ui-brand-brown)]" />
                        </div>
                        <span className="min-w-0 truncate">{o.name}</span>
                      </MenuItem>
                    ))}
                  </>
                ) : null}

                <div className="my-1.5 h-px w-full bg-gradient-to-r from-transparent via-[var(--ui-border)] to-transparent" />
              </>
            ) : null}

            {/* Dashboards Section */}
            <div className={sectionLabelClass}>Dashboards</div>
            <MenuItem
              as={Link}
              href="/dashboard/donor"
              value="donor"
              className={menuItemClass}
            >
              <Icon name="account" size="m" className="text-[var(--ui-muted)]" />
              <span>Donor</span>
            </MenuItem>
            <MenuItem
              as={Link}
              href="/dashboard/organization"
              value="organization"
              className={menuItemClass}
            >
              <Icon name="peopleGroup" size="m" className="text-[var(--ui-muted)]" />
              <span>Organization</span>
            </MenuItem>

            <div className="my-1.5 h-px w-full bg-gradient-to-r from-transparent via-[var(--ui-border)] to-transparent" />
            
            {/* Actions Section */}
            <div className={sectionLabelClass}>Actions</div>
            <MenuItem
              as={Link}
              href="/organizations/register"
              value="register"
              className={menuItemClass}
            >
              <Icon name="document" size="m" className="text-[var(--ui-muted)]" />
              <span>Get Verified</span>
            </MenuItem>

            {cdpConfigured && address ? (
              <div className="hidden border-t border-[var(--ui-border)] px-2 pt-2 sm:block">
                <SignOutButton
                  className="flex min-h-10 w-full shrink-0 items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold"
                  variant="secondary"
                >
                  Sign out
                </SignOutButton>
              </div>
            ) : null}

            {compactNav ? (
              <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1.5 dark:bg-[var(--ui-surface)]">
                <span className="text-[12px] text-[var(--ui-muted)]">Theme</span>
                <ThemeToggle />
              </div>
            ) : null}

            {compactNav ? (
              <div className="amini-header-wallet mt-1.5 border-t border-[var(--ui-border)] px-2 pt-1.5 sm:hidden">
                {cdpConfigured ? (
                  <div className="amini-header-cdp-login flex flex-col items-stretch" aria-label="Account">
                    <CdpEmbeddedAuth signedInContent={<span className="text-[13px] font-semibold">Sign out</span>} />
                  </div>
                ) : (
                  <div className="flex justify-center px-1">
                    <Wallet>
                      <ConnectWallet disconnectedLabel="Log in" />
                      <WalletDropdown>
                        <WalletDropdownDisconnect />
                      </WalletDropdown>
                    </Wallet>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        }
        contentPosition={{ placement: "bottom-end", gap: 0 }}
      >
        {/* Trigger: mobile = avatar + green ring only; sm+ = card with name */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-label="Open account and navigation menu"
          title="Account menu"
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none transition-all duration-200 focus-brand active:scale-[0.98]",
            "sm:justify-start sm:gap-3 sm:rounded-2xl sm:border sm:border-[var(--ui-border)] sm:bg-[var(--ui-surface-elev)] sm:p-2 sm:pr-3 sm:shadow-sm",
            "sm:hover:border-[color-mix(in_oklab,var(--ui-text)_22%,var(--ui-border))] sm:hover:bg-black/[0.06] sm:hover:shadow-md sm:dark:hover:bg-white/[0.08]",
          )}
        >
          {/* Avatar ring: solid green on small screens; brand gradient from sm up */}
          <div className="relative">
            <div className="h-10 w-10 rounded-full bg-[var(--ui-brand-green)] p-[2px] sm:bg-gradient-to-br sm:from-[var(--ui-brand-green)] sm:via-[var(--ui-brand-green)] sm:to-[var(--ui-brand-brown)]">
              <div className="h-full w-full overflow-hidden rounded-full bg-[var(--ui-surface)]">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-opacity duration-150 group-hover:opacity-90"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--ui-surface-elev)]">
                    <Icon name="account" size="m" className="text-[var(--ui-muted)]" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Name/Address display */}
          <div className="hidden text-left sm:block">
            <div className="text-sm font-medium text-[var(--ui-text)] tracking-tight leading-tight">
              {displayName}
            </div>
            <div className="text-xs text-[var(--ui-muted)] tracking-tight leading-tight truncate max-w-[120px]">
              {displayEmail}
            </div>
          </div>
        </button>
      </Dropdown>

      {/* Bending line — only beside the expanded sm+ trigger */}
      <div
        className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 opacity-60 transition-all duration-200 group-hover:opacity-100 sm:block"
        aria-hidden="true"
      >
        <svg
          width="12"
          height="24"
          viewBox="0 0 12 24"
          fill="none"
          className="text-[var(--ui-muted)] transition-all duration-200 group-hover:scale-110 group-hover:text-[var(--ui-brand-green)]"
        >
          <path
            d="M2 4C6 8 6 16 2 20"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
    </div>
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
      <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6 md:px-8">
        <div className="app-surface flex items-center justify-between gap-2 rounded-[18px] px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3 md:flex-nowrap md:px-6">
          <Link
            href="/"
            className="group shrink-0 flex items-center gap-2 rounded-lg py-1 pr-1 transition-opacity hover:opacity-95 focus-brand sm:gap-2.5"
            aria-label="Amini home"
          >
            <Image
              src="/logo.png"
              alt=""
              width={140}
              height={40}
              className="h-7 w-auto max-h-8 object-contain object-left transition-transform duration-200 group-hover:scale-[1.02] sm:h-9 sm:max-h-10"
              priority
            />
            <span className="brand-green text-base font-bold tracking-tight sm:text-xl">Amini</span>
          </Link>

          <nav
            className="hidden md:flex md:w-auto md:items-center md:justify-center md:gap-0.5"
            aria-label="Main"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} href={item.href} isActive={item.match(pathname)}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions amini-header-wallet flex shrink-0 items-center gap-1">
            <Dropdown
              maxHeight={9999}
              content={
                <div className="flex min-w-[240px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] py-3 shadow-xl dark:bg-[var(--ui-surface)]">
                  <p className="px-4 text-sm text-[var(--ui-muted)]">No notifications yet.</p>
                </div>
              }
              contentPosition={{ placement: "bottom-end", gap: 8 }}
            >
              <button
                type="button"
                className="hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] text-[var(--ui-text)] transition-colors hover:bg-black/5 focus:outline-none sm:flex dark:hover:bg-white/5"
                aria-label="Notifications"
              >
                <Bell className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </button>
            </Dropdown>
            <Link
              href="/messages"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] text-[var(--ui-text)] transition-colors hover:bg-black/5 focus-brand dark:hover:bg-white/5 ${
                pathname === "/messages" || pathname?.startsWith("/messages/")
                  ? "border-[var(--ui-brand-green)]/50 bg-[var(--ui-brand-green)]/10 brand-green"
                  : ""
              }`}
              aria-label="Messages"
              title="Messages"
            >
              <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </Link>
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <Link
              href="/activity"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] text-[var(--ui-text)] transition-colors hover:bg-black/5 focus-brand md:hidden dark:hover:bg-white/5 ${
                pathname === "/activity"
                  ? "border-[var(--ui-brand-green)]/50 bg-[var(--ui-brand-green)]/10 brand-green"
                  : ""
              }`}
              aria-label="Activity feed"
              title="Activity feed"
            >
              <Activity className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </Link>
            <Button
              as="span"
              variant="primary"
              compact
              font="label1"
              className="inline-flex shrink-0 whitespace-nowrap"
            >
              <RequireAuthButtonLink
                href="/campaigns/create"
                variant="primary"
                compact
                className="inline-flex shrink-0 whitespace-nowrap"
              >
                <span className="md:hidden">Start</span>
                <span className="hidden md:inline">Start a campaign</span>
              </RequireAuthButtonLink>
            </Button>

            <ProfileMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
