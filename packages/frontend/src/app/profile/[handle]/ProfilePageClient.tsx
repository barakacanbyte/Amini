"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getAddress } from "viem";
import { useWalletClient } from "wagmi";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { Icon } from "@coinbase/cds-web/icons";
import { useAminiSigning } from "@/context/AminiSigningContext";
import { CampaignMessagesBubble } from "@/components/CampaignMessagesBubble";
import { SavingOverlayCard } from "@/components/SavingOverlayCard";
import { buildAminiVerificationAuth } from "@/lib/aminiWalletAuth";
import { formatUsdc } from "@/lib/contracts";
import type { LoadedProfile } from "@/lib/loadProfile";
import { normalizeProfileWallet } from "@/lib/profileWallet";
import { resolveProfileAvatarUrl } from "@/lib/ipfsGatewayUrl";
import { describeProfileSlugRules, isValidProfileSlug } from "@/lib/profileSlug";
import type { ProfileDepositRow, ProfileOrgRow } from "@/lib/loadProfilePublicActivity";
import {
  initXmtpClient,
  loadDirectDmMessages,
  sendDirectDmMessage,
} from "@/lib/xmtp";

type Mode = "preview" | "edit";

function shortAddress(w: string) {
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

const chipClass =
  "inline-flex items-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--ui-text)]";

/** Native fields (same treatment as Bio textarea) — avoids CDS TextInput / NativeInput token issues on Amini surfaces. */
const fieldInputClass =
  "w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] outline-none focus-visible:border-[var(--ui-brand-green)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus-ring)]";

function hintForMessagingInitFailure(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("user rejected")
  ) {
    return "Signature cancelled. Approve the request in your wallet to enable chat.";
  }
  if (lower.includes("no wallet") || lower.includes("account")) {
    return "Connect your wallet and try again.";
  }
  return "Could not start chat. Try again in a moment.";
}

function hintForMessagingSendFailure(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("user rejected")
  ) {
    return "Signature cancelled.";
  }
  return "Could not send your message. Try again.";
}

function formatDepositAmount(raw: string): string {
  const s = raw.replace(/,/g, "").trim();
  if (!s) return raw;
  try {
    const whole = s.split(".")[0] ?? s;
    if (!/^-?\d+$/.test(whole)) return `${raw} USDC`;
    return `${formatUsdc(BigInt(whole))} USDC`;
  } catch {
    return `${raw} USDC`;
  }
}

function orgStatusChipClass(status: string): string {
  if (status === "approved") {
    return `${chipClass} border-emerald-500/40 text-emerald-700 dark:text-emerald-400`;
  }
  if (status === "pending") {
    return `${chipClass} border-amber-500/40 text-amber-800 dark:text-amber-200`;
  }
  return `${chipClass} border-[var(--ui-border)] text-[var(--ui-muted)]`;
}

export function ProfilePageClient({
  wallet,
  routeHandle,
  initialProfile,
  activity,
}: {
  wallet: string;
  /** Raw `[handle]` segment from the URL (wallet or slug). */
  routeHandle: string;
  initialProfile: LoadedProfile;
  activity: { organizations: ProfileOrgRow[]; deposits: ProfileDepositRow[] };
}) {
  const router = useRouter();
  const { data: walletClient } = useWalletClient();
  const { address, isConnected, getCdpAccessToken, signMessageAsync } = useAminiSigning();
  const isOwner = Boolean(
    address && isConnected && address.toLowerCase() === wallet.toLowerCase(),
  );

  const [mode, setMode] = useState<Mode>("preview");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarFileInputKey, setAvatarFileInputKey] = useState(0);

  const [name, setName] = useState(initialProfile?.name ?? "");
  const [email, setEmail] = useState(initialProfile?.email ?? "");
  const [headline, setHeadline] = useState(initialProfile?.headline ?? "");
  const [bio, setBio] = useState(initialProfile?.bio ?? "");
  const [location, setLocation] = useState(initialProfile?.location ?? "");
  const [avatarUrl, setAvatarUrl] = useState((initialProfile?.avatar_url ?? "").trim());
  const [profileSlug, setProfileSlug] = useState(initialProfile?.profile_slug ?? "");
  const [xUrl, setXUrl] = useState(initialProfile?.x_url ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initialProfile?.linkedin_url ?? "");
  const [instagramUrl, setInstagramUrl] = useState(initialProfile?.instagram_url ?? "");
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  /** Same resolution everywhere (preview header + edit thumbnail): bare CID + gateway env, trim, normalize path. */
  const staticResolvedAvatar = useMemo(() => {
    const u = (avatarUrl ?? "").trim();
    if (!u) return null;
    return resolveProfileAvatarUrl(u) ?? u;
  }, [avatarUrl]);

  const displayAvatar = avatarPreview || staticResolvedAvatar;
  const showAvatarImage = Boolean(displayAvatar && !avatarLoadFailed);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [displayAvatar]);

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const sharePathSegment = (profileSlug.trim() || wallet).trim();
  const shareUrl = origin ? `${origin}/profile/${encodeURIComponent(sharePathSegment)}` : "";

  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyHint("Copied to clipboard.");
      window.setTimeout(() => setCopyHint(null), 2500);
    } catch {
      setCopyHint("Could not copy. Select the link manually.");
      window.setTimeout(() => setCopyHint(null), 3500);
    }
  }, [shareUrl]);

  const peerWallet = useMemo(() => getAddress(wallet) as `0x${string}`, [wallet]);
  /** XMTP DM with the profile wallet (not shown on your own profile). */
  const showProfileDm = Boolean(
    isConnected && address && address.toLowerCase() !== wallet.toLowerCase(),
  );

  const [xmtpStatus, setXmtpStatus] = useState("");
  const [xmtpReady, setXmtpReady] = useState(false);
  const [xmtpDraft, setXmtpDraft] = useState("");
  const [xmtpInboxId, setXmtpInboxId] = useState<string | null>(null);
  const [xmtpBusy, setXmtpBusy] = useState(false);
  const [xmtpMessages, setXmtpMessages] = useState<
    Array<{ id: string; senderInboxId: string; text: string; sentAt: string }>
  >([]);
  const [xmtpPanelOpen, setXmtpPanelOpen] = useState(false);
  const messagingInitPromiseRef = useRef<Promise<boolean> | null>(null);

  const xmtpEnv = (process.env.NEXT_PUBLIC_XMTP_ENV ?? "dev") as "dev" | "production";

  const ensureMessagingClient = useCallback(async (): Promise<boolean> => {
    if (xmtpReady) return true;
    if (!walletClient?.account?.address) return false;
    if (messagingInitPromiseRef.current) {
      return messagingInitPromiseRef.current;
    }
    const wc = walletClient;
    const p = (async () => {
      const result = await initXmtpClient(wc, xmtpEnv);
      setXmtpReady(result.ok);
      setXmtpInboxId(result.inboxId ?? null);
      if (!result.ok) {
        setXmtpStatus(hintForMessagingInitFailure(result.message));
      } else {
        setXmtpStatus("");
      }
      return result.ok;
    })().finally(() => {
      messagingInitPromiseRef.current = null;
    });
    messagingInitPromiseRef.current = p;
    return p;
  }, [walletClient, xmtpReady, xmtpEnv]);

  const handleSendProfileDm = useCallback(async () => {
    if (!walletClient || !xmtpDraft.trim()) return;
    setXmtpBusy(true);
    setXmtpStatus("");
    try {
      const ok = await ensureMessagingClient();
      if (!ok) return;
      const messages = await sendDirectDmMessage(
        walletClient,
        xmtpEnv,
        peerWallet,
        xmtpDraft,
      );
      setXmtpMessages(messages);
      setXmtpDraft("");
      setXmtpStatus("");
    } catch (error) {
      setXmtpStatus(hintForMessagingSendFailure((error as Error).message));
    } finally {
      setXmtpBusy(false);
    }
  }, [walletClient, xmtpDraft, ensureMessagingClient, xmtpEnv, peerWallet]);

  useEffect(() => {
    if (!xmtpReady || !walletClient || !showProfileDm) return;
    let cancelled = false;

    async function refreshThread() {
      try {
        const messages = await loadDirectDmMessages(walletClient, xmtpEnv, peerWallet);
        if (!cancelled) setXmtpMessages(messages);
      } catch {
        /* best-effort */
      }
    }

    void refreshThread();
    const interval = window.setInterval(() => {
      void refreshThread();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [xmtpReady, walletClient, showProfileDm, xmtpEnv, peerWallet]);

  useEffect(() => {
    if (!xmtpPanelOpen || !showProfileDm) return;
    void ensureMessagingClient();
  }, [xmtpPanelOpen, showProfileDm, ensureMessagingClient]);

  const resetFromInitial = useCallback(() => {
    setName(initialProfile?.name ?? "");
    setEmail(initialProfile?.email ?? "");
    setHeadline(initialProfile?.headline ?? "");
    setBio(initialProfile?.bio ?? "");
    setLocation(initialProfile?.location ?? "");
    setAvatarUrl((initialProfile?.avatar_url ?? "").trim());
    setProfileSlug(initialProfile?.profile_slug ?? "");
    setXUrl(initialProfile?.x_url ?? "");
    setLinkedinUrl(initialProfile?.linkedin_url ?? "");
    setInstagramUrl(initialProfile?.instagram_url ?? "");
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarError(null);
  }, [initialProfile]);

  /** Same validation + preview flow as organization registration (`handleLogoChange`). */
  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setAvatarError(null);
    setMessage(null);
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError("Invalid format. Please use JPG, PNG, or WEBP.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("File too large. Max size is 2MB.");
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearAvatar() {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarError(null);
    setAvatarFileInputKey((k) => k + 1);
  }

  type ApiProfileRow = {
    name?: string | null;
    email?: string | null;
    headline?: string | null;
    bio?: string | null;
    location?: string | null;
    avatar_url?: string | null;
    profile_slug?: string | null;
    x_url?: string | null;
    linkedin_url?: string | null;
    instagram_url?: string | null;
  };

  function applyServerProfile(p: ApiProfileRow) {
    setName(p.name ?? "");
    setEmail(p.email ?? "");
    setHeadline(p.headline ?? "");
    setBio(p.bio ?? "");
    setLocation(p.location ?? "");
    setAvatarUrl((p.avatar_url ?? "").trim());
    setProfileSlug(p.profile_slug ?? "");
    setXUrl(p.x_url ?? "");
    setLinkedinUrl(p.linkedin_url ?? "");
    setInstagramUrl(p.instagram_url ?? "");
  }

  const save = async () => {
    const slugCheck = profileSlug.trim().toLowerCase();
    if (slugCheck && !isValidProfileSlug(slugCheck)) {
      setMessage({ kind: "err", text: `Invalid public username. ${describeProfileSlugRules()}` });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const auth = await buildAminiVerificationAuth("Update Profile", wallet, {
        signMessageAsync,
        getCdpAccessToken,
      });
      const path = `/api/profiles/${wallet}`;

      type PatchJson = {
        ok?: boolean;
        message?: string;
        profile?: ApiProfileRow;
        warnings?: unknown;
      };

      let json: PatchJson;
      if (avatarFile) {
        const fd = new FormData();
        fd.append("name", name);
        fd.append("email", email);
        fd.append("headline", headline);
        fd.append("bio", bio);
        fd.append("location", location);
        fd.append("profile_slug", profileSlug.trim());
        fd.append("x_url", xUrl.trim());
        fd.append("linkedin_url", linkedinUrl.trim());
        fd.append("instagram_url", instagramUrl.trim());
        fd.append("avatar", avatarFile);
        fd.append("signature", auth.signature);
        fd.append("signatureTimestamp", auth.signatureTimestamp);
        if (auth.cdpAccessToken) fd.append("cdpAccessToken", auth.cdpAccessToken);
        const res = await fetch(path, { method: "PATCH", body: fd });
        json = (await res.json()) as PatchJson;
        setAvatarFile(null);
        setAvatarPreview(null);
      } else {
        const res = await fetch(path, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name || null,
            email: email || null,
            headline: headline || null,
            bio: bio || null,
            location: location || null,
            profile_slug: profileSlug.trim() || null,
            x_url: xUrl.trim() || null,
            linkedin_url: linkedinUrl.trim() || null,
            instagram_url: instagramUrl.trim() || null,
            signature: auth.signature,
            signatureTimestamp: auth.signatureTimestamp,
            ...(auth.cdpAccessToken ? { cdpAccessToken: auth.cdpAccessToken } : {}),
          }),
        });
        json = (await res.json()) as PatchJson;
      }

      if (!json.ok) throw new Error(json.message ?? "Save failed");

      let p = json.profile;
      if (!p) {
        const gr = await fetch(path, { cache: "no-store" });
        const gj = (await gr.json()) as PatchJson;
        if (gj?.ok && gj.profile) p = gj.profile;
      }
      if (p) {
        applyServerProfile(p);
        const slugNow = (p.profile_slug ?? "").trim();
        if (slugNow && normalizeProfileWallet(routeHandle)) {
          router.replace(`/profile/${encodeURIComponent(slugNow)}`);
        }
      }

      const warnList = Array.isArray(json.warnings)
        ? json.warnings.filter((w): w is string => typeof w === "string" && w.trim().length > 0)
        : [];
      setMessage({
        kind: warnList.length ? "warn" : "ok",
        text: warnList.length ? `Profile saved. ${warnList.join(" ")}` : "Profile saved.",
      });
      setMode("preview");
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const showEditChrome = isOwner && mode === "edit";
  const viewMode = !isOwner || mode === "preview";

  return (
    <main className="app-page pt-6 pb-14 sm:pt-8 sm:pb-16">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
        {/* Main Profile Card */}
        <div className="relative mt-3 overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] shadow-lg">
          <SavingOverlayCard
            open={saving}
            title="Saving your profile"
            subtitle="Signing and uploading can take a few seconds. You can keep this tab open."
            spinnerLabel="Saving profile"
          />

          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--ui-brand-green)]/5 via-transparent to-transparent" />

          {isOwner ? (
            <Button
              type="button"
              variant={mode === "edit" ? "primary" : "secondary"}
              compact
              accessibilityLabel={mode === "edit" ? "Cancel editing" : "Edit profile"}
              className="absolute right-4 top-4 z-10 !flex !h-9 !w-9 !min-h-9 !max-w-9 !items-center !justify-center !rounded-full !p-0 shadow-md ring-2 ring-[var(--ui-surface-elev)] sm:right-5 sm:top-5"
              onClick={() => {
                if (mode === "edit") {
                  resetFromInitial();
                  setMode("preview");
                  setMessage(null);
                  setAvatarError(null);
                  return;
                }
                setMode("edit");
                setMessage(null);
                setAvatarError(null);
              }}
            >
              {mode === "edit" ? (
                <Icon name="close" size="s" aria-hidden />
              ) : (
                <Icon name="pencil" size="s" aria-hidden />
              )}
            </Button>
          ) : null}

          <div className="relative px-6 py-10 sm:px-10 sm:py-12">
            {/* Avatar - Centered */}
            <div className="mx-auto mb-6 flex justify-center">
              <div className="relative inline-block">
                <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-[var(--ui-surface-elev)] bg-[var(--ui-surface)] shadow-md sm:h-32 sm:w-32">
                  {showAvatarImage ? (
                    <img
                      key={displayAvatar ?? ""}
                      src={displayAvatar!}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                      onError={() => setAvatarLoadFailed(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--ui-muted)]">
                      <Icon name="account" size="l" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-3 border-[var(--ui-surface-elev)] bg-[var(--ui-brand-green)]" />
              </div>
            </div>

            {/* Profile Info - Centered */}
            <div className="text-center">
              {viewMode ? (
                <>
                  <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-[var(--ui-text)] sm:text-3xl">
                    {name.trim() || "Anonymous donor"}
                  </h1>
                  {headline.trim() ? (
                    <p className="mx-auto mt-2 max-w-md text-pretty text-base font-medium text-[var(--ui-brand-green)]">
                      {headline}
                    </p>
                  ) : null}

                  {/* Contact Chips */}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1 text-xs text-[var(--ui-muted)]">
                      <Icon name="wallet" size="s" />
                      {shortAddress(wallet)}
                    </span>
                    {location.trim() ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1 text-xs text-[var(--ui-muted)]">
                        <Icon name="location" size="s" />
                        {location}
                      </span>
                    ) : null}
                    {email.trim() ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1 text-xs text-[var(--ui-muted)]">
                        <Icon name="email" size="s" />
                        {email}
                      </span>
                    ) : null}
                  </div>

                  {/* Social Icons */}
                  {(xUrl.trim() || linkedinUrl.trim() || instagramUrl.trim()) ? (
                    <div className="mt-5 flex items-center justify-center gap-3">
                      {xUrl.trim() && (
                        <a
                          href={xUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--ui-text)] transition-all hover:scale-110 hover:bg-black/5"
                          aria-label="X (Twitter)"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </a>
                      )}
                      {linkedinUrl.trim() && (
                        <a
                          href={linkedinUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--ui-text)] transition-all hover:scale-110 hover:bg-black/5"
                          aria-label="LinkedIn"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        </a>
                      )}
                      {instagramUrl.trim() && (
                        <a
                          href={instagramUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--ui-text)] transition-all hover:scale-110 hover:bg-black/5"
                          aria-label="Instagram"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                        </a>
                      )}
                    </div>
                  ) : null}

                  {/* Action Buttons */}
                  {origin && (
                    <div className="mt-6 flex items-center justify-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setShareOpen(true)}
                        className="!min-h-9"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="share" size="s" />
                          Share
                        </span>
                      </Button>
                      {showProfileDm && (
                        <Button
                          variant="primary"
                          onClick={() => setXmtpPanelOpen(true)}
                          className="!min-h-9"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Icon name="comment" size="s" />
                            Message
                          </span>
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <TextCaption className="text-[var(--ui-muted)]">
                  Edit your profile below
                </TextCaption>
              )}
            </div>

            {/* Edit Form */}
            {showEditChrome ? (
              <div className="mt-8 space-y-5 border-t border-[var(--ui-border)] pt-8">
                {/* Avatar Upload */}
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="relative">
                    {avatarPreview ? (
                      <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-[var(--ui-brand-green)]">
                        <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={clearAvatar}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100"
                          aria-label="Remove"
                        >
                          <Icon name="trashCan" size="s" className="text-white" />
                        </button>
                      </div>
                    ) : staticResolvedAvatar ? (
                      <label className="relative block h-24 w-24 cursor-pointer overflow-hidden rounded-full border-4 border-[var(--ui-border)] transition-all hover:border-[var(--ui-brand-green)]">
                        <img src={staticResolvedAvatar} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all hover:bg-black/40 hover:opacity-100">
                          <Icon name="pencil" size="s" className="text-white" />
                        </span>
                        <input
                          key={avatarFileInputKey}
                          type="file"
                          className="hidden"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleAvatarChange}
                        />
                      </label>
                    ) : (
                      <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-full border-4 border-dashed border-[var(--ui-border)] transition-all hover:border-[var(--ui-brand-green)] hover:bg-[var(--ui-brand-green)]/5">
                        <Icon name="camera" size="m" className="text-[var(--ui-muted)]" />
                        <input
                          key={avatarFileInputKey}
                          type="file"
                          className="hidden"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleAvatarChange}
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <TextCaption className="text-[var(--ui-muted)]">Profile photo</TextCaption>
                    {avatarError ? <p className="mt-1 text-xs text-red-500">{avatarError}</p> : null}
                  </div>
                </div>

                {/* Form Fields - 2 columns on desktop */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <TextCaption className="mb-1.5 block text-[var(--ui-muted)]">Display name</TextCaption>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldInputClass} />
                  </div>
                  <div>
                    <TextCaption className="mb-1.5 block text-[var(--ui-muted)]">Public username</TextCaption>
                    <input
                      type="text"
                      value={profileSlug}
                      onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="e.g. john-doe"
                      className={fieldInputClass}
                    />
                    <p className="mt-1 text-xs text-[var(--ui-muted)]">{describeProfileSlugRules()}</p>
                  </div>
                </div>

                <div>
                  <TextCaption className="mb-1.5 block text-[var(--ui-muted)]">Headline</TextCaption>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Climate donor · Base"
                    className={fieldInputClass}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <TextCaption className="mb-1.5 block text-[var(--ui-muted)]">Email</TextCaption>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldInputClass} />
                  </div>
                  <div>
                    <TextCaption className="mb-1.5 block text-[var(--ui-muted)]">Location</TextCaption>
                    <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={fieldInputClass} />
                  </div>
                </div>

                <div>
                  <TextCaption className="mb-1.5 block text-[var(--ui-muted)]">Bio</TextCaption>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={4}
                    className={`${fieldInputClass} min-h-[100px] resize-y`}
                  />
                </div>

                {/* Social Links */}
                <div className="border-t border-[var(--ui-border)] pt-4">
                  <TextCaption className="mb-3 block text-[var(--ui-muted)]">Social Links</TextCaption>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white text-xs font-bold">X</span>
                      <input
                        type="url"
                        value={xUrl}
                        onChange={(e) => setXUrl(e.target.value)}
                        placeholder="https://x.com/username"
                        className={fieldInputClass}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0A66C2] text-white text-xs font-bold">in</span>
                      <input
                        type="url"
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        placeholder="https://linkedin.com/in/username"
                        className={fieldInputClass}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 text-white text-xs font-bold">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                      </span>
                      <input
                        type="url"
                        value={instagramUrl}
                        onChange={(e) => setInstagramUrl(e.target.value)}
                        placeholder="https://instagram.com/username"
                        className={fieldInputClass}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button variant="primary" onClick={() => void save()} disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                  <Button variant="secondary" onClick={() => { resetFromInitial(); setMode("preview"); setMessage(null); setAvatarError(null); }} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {/* About Section */}
            {viewMode && bio.trim() ? (
              <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                <TextCaption className="mb-3 block uppercase tracking-wider text-[var(--ui-muted)]">About</TextCaption>
                <TextBody className="whitespace-pre-wrap text-[var(--ui-text)]">{bio}</TextBody>
              </div>
            ) : null}

            {/* Organizations Section */}
            {viewMode && activity.organizations.length > 0 ? (
              <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                <TextCaption className="mb-3 block uppercase tracking-wider text-[var(--ui-muted)]">Organizations</TextCaption>
                <div className="grid gap-2 sm:grid-cols-2">
                  {activity.organizations.map((o) => (
                    <Link
                      key={o.id}
                      href={`/organizations/${o.id}`}
                      className="flex items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 transition-colors hover:border-[var(--ui-brand-green)]/50"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ui-brand-brown)]/10">
                        <Icon name="peopleGroup" size="s" className="text-[var(--ui-brand-brown)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[var(--ui-text)]">{o.name}</p>
                        <span className={orgStatusChipClass(o.status)}>{o.status}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Donations Section */}
            {viewMode && activity.deposits.length > 0 ? (
              <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                <TextCaption className="mb-3 block uppercase tracking-wider text-[var(--ui-muted)]">Donations & Support</TextCaption>
                <div className="space-y-2">
                  {activity.deposits.slice(0, 5).map((d) => (
                    <Link
                      key={d.tx_hash}
                      href={`/campaigns/${d.campaign_id}`}
                      className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 transition-colors hover:border-[var(--ui-brand-green)]/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[var(--ui-text)]">
                          {d.campaign_title?.trim() || `Campaign #${d.campaign_id}`}
                        </p>
                        <p className="text-xs text-[var(--ui-muted)]">
                          {new Date(d.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <span className="ml-2 shrink-0 font-semibold text-[var(--ui-brand-green)]">
                        +{formatDepositAmount(d.amount)}
                      </span>
                    </Link>
                  ))}
                </div>
                {activity.deposits.length > 5 && (
                  <p className="mt-3 text-center text-sm text-[var(--ui-muted)]">
                    +{activity.deposits.length - 5} more donations
                  </p>
                )}
              </div>
            ) : null}

            {/* Empty State */}
            {viewMode && !bio.trim() && !headline.trim() && !name.trim() && !initialProfile ? (
              <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                <div className="text-center">
                  <Icon name="account" size="l" className="mx-auto mb-3 text-[var(--ui-muted)]" />
                  <TextBody className="text-[var(--ui-muted)]">This wallet hasn't set up a profile yet.</TextBody>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {message ? (
          <p
            className={`mt-4 text-sm ${
              message.kind === "ok"
                ? "text-[var(--ui-brand-green)]"
                : message.kind === "warn"
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-red-500"
            }`}
            role="status"
          >
            {message.text}
          </p>
        ) : null}
      </div>

      {showProfileDm ? (
        <CampaignMessagesBubble
          open={xmtpPanelOpen}
          onOpenChange={setXmtpPanelOpen}
          isConnected={isConnected}
          busy={xmtpBusy}
          statusHint={xmtpStatus}
          xmtpDraft={xmtpDraft}
          onDraftChange={setXmtpDraft}
          xmtpPeerAddress={peerWallet}
          xmtpInboxId={xmtpInboxId}
          messages={xmtpMessages}
          onSend={() => void handleSendProfileDm()}
          panelTitle="Direct messages"
          dialogAriaLabel="Direct messages"
        />
      ) : null}

      {/* Share Modal */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShareOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Share profile"
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-6 py-4">
              <TextCaption className="uppercase tracking-wider text-[var(--ui-muted)]">Share Profile</TextCaption>
              <button
                onClick={() => setShareOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ui-muted)] transition-colors hover:bg-black/5 hover:text-[var(--ui-text)]"
                aria-label="Close"
              >
                <Icon name="close" size="s" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-8 text-center">
              {/* QR Code */}
              <div className="mx-auto mb-6 inline-block rounded-2xl border border-[var(--ui-border)] bg-white p-4 dark:bg-[var(--ui-surface)]">
                <QRCodeSVG value={shareUrl} size={160} level="M" includeMargin={false} />
              </div>

              {/* Description */}
              <p className="mb-6 text-sm text-[var(--ui-muted)]">
                {profileSlug.trim()
                  ? "Scan to visit this profile directly."
                  : "Scan to visit this wallet's profile."}
              </p>

              {/* Link Input */}
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className={`${fieldInputClass} flex-1 text-xs`}
                />
                <Button
                  variant="primary"
                  onClick={() => {
                    void copyShareLink();
                    window.setTimeout(() => setShareOpen(false), 800);
                  }}
                  className="shrink-0"
                >
                  {copyHint ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
