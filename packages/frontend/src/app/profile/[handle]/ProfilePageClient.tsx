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
  const [copyHint, setCopyHint] = useState<string | null>(null);
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
  };

  function applyServerProfile(p: ApiProfileRow) {
    setName(p.name ?? "");
    setEmail(p.email ?? "");
    setHeadline(p.headline ?? "");
    setBio(p.bio ?? "");
    setLocation(p.location ?? "");
    setAvatarUrl((p.avatar_url ?? "").trim());
    setProfileSlug(p.profile_slug ?? "");
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

  const titleName = useMemo(() => {
    const n = name.trim();
    if (n) return n;
    return shortAddress(wallet);
  }, [name, wallet]);

  return (
    <main className="app-page pt-24 pb-16">
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <TextCaption className="mb-1 block uppercase tracking-wider text-[var(--ui-muted)]">
              Profile
            </TextCaption>
            <TextTitle2 as="h1" className="text-[var(--ui-text)]">
              {titleName}
            </TextTitle2>
            <TextBody className="mt-1 font-mono text-sm text-[var(--ui-muted)]">{wallet}</TextBody>
          </div>
          {isOwner ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-1">
              <Button
                type="button"
                variant={mode === "edit" ? "primary" : "secondary"}
                className="!min-h-9"
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
                  "Cancel"
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="pencil" size="s" />
                    Edit
                  </span>
                )}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] shadow-[var(--ui-shadow-md)]">
          <SavingOverlayCard
            open={saving}
            title="Saving your profile"
            subtitle="Signing and uploading can take a few seconds. You can keep this tab open."
            spinnerLabel="Saving profile"
          />
          <div className="h-28 bg-gradient-to-r from-[var(--ui-brand-green)]/25 to-[var(--ui-brand-brown)]/25" />
          <div className="relative px-6 pb-8 pt-0">
            <div className="-mt-14 flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-8">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-4 border-[var(--ui-surface-elev)] bg-[var(--ui-surface)] shadow-md">
                {showAvatarImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- IPFS / Filebase gateways are not reliably optimized via next/image
                  <img
                    key={displayAvatar ?? ""}
                    src={displayAvatar!}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--ui-muted)]">
                    <Icon name="account" size="l" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1 sm:pb-2">
                {viewMode ? (
                  <div className="flex flex-col">
                    <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-[var(--ui-text)] sm:text-[1.875rem] sm:leading-[1.15]">
                      {name.trim() || "Anonymous donor"}
                    </h2>
                    {headline.trim() ? (
                      <p className="mt-2.5 max-w-2xl text-pretty text-base font-normal leading-relaxed text-[var(--ui-muted)] sm:mt-3 sm:text-lg sm:leading-relaxed">
                        {headline}
                      </p>
                    ) : null}
                    <div
                      className={`flex flex-wrap gap-2 ${headline.trim() ? "mt-4 border-t border-[var(--ui-border)] pt-4" : "mt-4"}`}
                      aria-label="Profile details"
                    >
                      <span className={chipClass}>{shortAddress(wallet)}</span>
                      {location.trim() ? (
                        <span className={chipClass}>
                          <span className="inline-flex items-center gap-1">
                            <Icon name="location" size="s" />
                            {location}
                          </span>
                        </span>
                      ) : null}
                      {email.trim() ? <span className={chipClass}>{email}</span> : null}
                    </div>
                  </div>
                ) : (
                  <TextCaption className="text-[var(--ui-muted)]">
                    Edit fields below, then save.
                  </TextCaption>
                )}
              </div>
            </div>

            {showEditChrome ? (
              <div className="mt-8 space-y-4 border-t border-[var(--ui-border)] pt-8">
                <div>
                  <TextCaption className="mb-2 block text-[var(--ui-muted)]">Display name</TextCaption>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={fieldInputClass}
                    autoComplete="name"
                  />
                </div>
                <div>
                  <TextCaption className="mb-2 block text-[var(--ui-muted)]">Email</TextCaption>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={fieldInputClass}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <TextCaption className="mb-2 block text-[var(--ui-muted)]">Headline</TextCaption>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Climate donor · Base"
                    className={fieldInputClass}
                  />
                </div>
                <div>
                  <TextCaption className="mb-2 block text-[var(--ui-muted)]">Public username</TextCaption>
                  <input
                    type="text"
                    value={profileSlug}
                    onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="e.g. man-of-tomorrow"
                    className={fieldInputClass}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="mt-1.5 text-xs text-[var(--ui-muted)]">{describeProfileSlugRules()} Leave empty to use your wallet address in links.</p>
                </div>
                <div>
                  <TextCaption className="mb-2 block text-[var(--ui-muted)]">Location</TextCaption>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={fieldInputClass}
                    autoComplete="address-level2"
                  />
                </div>
                <div>
                  <TextCaption className="mb-2 block text-[var(--ui-muted)]">Bio</TextCaption>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="A short bio visible on your public profile."
                    rows={5}
                    className={`${fieldInputClass} min-h-[120px] resize-y`}
                  />
                </div>
                {/* Profile photo — same pattern as organization registration logo upload */}
                <div className="mb-2">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-4 w-4 items-center justify-center app-muted">
                        <Icon name="image" size="s" color="currentColor" />
                      </span>
                      <span className="app-text text-sm font-medium">Profile photo</span>
                    </div>
                    <span className="app-muted text-xs font-normal">(optional)</span>
                  </div>

                  <div className="relative group">
                    {avatarPreview ? (
                      <div className="group relative h-32 w-32 overflow-hidden rounded-2xl border-2 border-[var(--ui-brand-green)]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview, same as org register */}
                        <img
                          key={avatarPreview}
                          src={avatarPreview}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={clearAvatar}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Remove selected photo"
                        >
                          <span className="rounded-full bg-white/20 p-2 backdrop-blur-md">
                            <Icon name="trashCan" size="s" className="text-white" />
                          </span>
                        </button>
                      </div>
                    ) : staticResolvedAvatar ? (
                      <label className="relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-[var(--ui-border)] transition-all hover:border-[var(--ui-brand-green)] hover:bg-[var(--ui-brand-green)]/5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          key={staticResolvedAvatar}
                          src={staticResolvedAvatar}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all hover:bg-black/40 hover:opacity-100">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white">Change</span>
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
                      <label className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--ui-border)] transition-all hover:border-[var(--ui-brand-green)] hover:bg-[var(--ui-brand-green)]/5">
                        <Icon name="upload" size="m" className="mb-2 text-[var(--ui-muted)]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ui-muted)]">
                          Upload
                        </span>
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
                  {avatarError ? <div className="mt-2 text-xs font-medium text-red-500">{avatarError}</div> : null}
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button variant="primary" onClick={() => void save()} disabled={saving}>
                    {saving ? "Saving…" : "Save profile"}
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      resetFromInitial();
                      setMode("preview");
                      setMessage(null);
                      setAvatarError(null);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {viewMode && bio.trim() ? (
              <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                <TextCaption className="mb-2 block uppercase tracking-wider text-[var(--ui-muted)]">
                  About
                </TextCaption>
                <TextBody className="whitespace-pre-wrap text-[var(--ui-text)]">{bio}</TextBody>
              </div>
            ) : null}

            {viewMode && activity.organizations.length > 0 ? (
              <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                <TextCaption className="mb-2 block uppercase tracking-wider text-[var(--ui-muted)]">
                  Organizations
                </TextCaption>
                <ul className="space-y-3">
                  {activity.organizations.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/organizations/${o.id}`}
                        className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 transition-colors hover:border-[var(--ui-brand-green)]/50"
                      >
                        <Icon name="peopleGroup" size="s" className="text-[var(--ui-muted)]" />
                        <span className="font-medium text-[var(--ui-text)]">{o.name}</span>
                        <span className={orgStatusChipClass(o.status)}>{o.status}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {viewMode && activity.deposits.length > 0 ? (
              <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                <TextCaption className="mb-2 block uppercase tracking-wider text-[var(--ui-muted)]">
                  Donations &amp; support
                </TextCaption>
                <TextBody className="mb-3 text-sm text-[var(--ui-muted)]">
                  Escrow deposits recorded for this wallet (indexed on-chain activity).
                </TextBody>
                <ul className="space-y-2">
                  {activity.deposits.map((d) => (
                    <li key={d.tx_hash}>
                      <Link
                        href={`/campaigns/${d.campaign_id}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 text-sm transition-colors hover:border-[var(--ui-brand-green)]/50"
                      >
                        <span className="font-medium text-[var(--ui-text)]">
                          {d.campaign_title?.trim() || `Campaign #${d.campaign_id}`}
                        </span>
                        <span className="text-[var(--ui-brand-green)]">
                          +{formatDepositAmount(d.amount)}
                        </span>
                        <span className="w-full text-xs text-[var(--ui-muted)]">
                          {new Date(d.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {viewMode && origin ? (
              <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                <TextCaption className="mb-1 block uppercase tracking-wider text-[var(--ui-muted)]">
                  Share profile
                </TextCaption>
                <TextBody className="text-sm text-[var(--ui-muted)]">
                  {profileSlug.trim()
                    ? "Short link using your public username."
                    : "Link uses your wallet until you set a public username in Edit."}
                </TextBody>
                <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
                  <div className="flex shrink-0 justify-center rounded-xl border border-[var(--ui-border)] bg-white p-3 dark:bg-[var(--ui-surface)] sm:justify-start">
                    <QRCodeSVG value={shareUrl} size={132} level="M" includeMargin={false} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ui-muted)]" htmlFor="profile-share-url">
                        Link
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <input
                          id="profile-share-url"
                          readOnly
                          value={shareUrl}
                          className={`${fieldInputClass} font-mono text-xs sm:flex-1 sm:text-sm`}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          className="shrink-0 sm:px-5"
                          onClick={() => void copyShareLink()}
                        >
                          Copy
                        </Button>
                      </div>
                      {copyHint ? (
                        <p className="mt-2 text-xs text-[var(--ui-brand-green)]" role="status">
                          {copyHint}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {viewMode && !bio.trim() && !headline.trim() && !name.trim() && !initialProfile ? (
              <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                <TextBody className="text-[var(--ui-muted)]">
                  This wallet has not set up a public profile yet.
                </TextBody>
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
    </main>
  );
}
