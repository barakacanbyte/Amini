"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@coinbase/cds-web/icons/Icon";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { Modal } from "@coinbase/cds-web/overlays/modal/Modal";
import { ModalBody } from "@coinbase/cds-web/overlays/modal/ModalBody";
import { ModalFooter } from "@coinbase/cds-web/overlays/modal/ModalFooter";
import { ModalHeader } from "@coinbase/cds-web/overlays/modal/ModalHeader";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { Spinner } from "@coinbase/cds-web/loaders/Spinner";
import { useAminiSigning } from "@/context/AminiSigningContext";
import { buildAminiVerificationAuth } from "@/lib/aminiWalletAuth";
import {
  buildSocialShareUrls,
  type SocialShareUrls,
} from "@/lib/organizationShareLinks";
import type { IconType } from "react-icons";
import {
  FaFacebook,
  FaLinkedin,
  FaTelegram,
  FaWhatsapp,
  FaXTwitter,
} from "react-icons/fa6";
import { MdOutlineMail } from "react-icons/md";

const sharePlatformButtons: {
  id: keyof SocialShareUrls;
  label: string;
  Icon: IconType;
  iconClass: string;
  buttonClass?: string;
}[] = [
  { id: "whatsapp", label: "WhatsApp", Icon: FaWhatsapp, iconClass: "text-[#25D366]" },
  {
    id: "x",
    label: "X",
    Icon: FaXTwitter,
    iconClass: "text-white",
    buttonClass: "bg-black hover:bg-black/90 border-black/30 hover:border-black/40",
  },
  { id: "linkedin", label: "LinkedIn", Icon: FaLinkedin, iconClass: "text-[#0A66C2]" },
  { id: "facebook", label: "Facebook", Icon: FaFacebook, iconClass: "text-[#1877F2]" },
  { id: "telegram", label: "Telegram", Icon: FaTelegram, iconClass: "text-[#26A5E4]" },
  { id: "email", label: "Email", Icon: MdOutlineMail, iconClass: "text-[var(--ui-muted)]" },
];

const PAGE_SIZE = 20;

type FeedPost = {
  id: string;
  organization_id: string;
  author_wallet: string;
  body: string;
  created_at: string;
  updated_at: string;
  org_name: string;
  org_logo_url: string | null;
  org_wallet: string;
  media: Array<{
    id: string;
    cid: string | null;
    url: string | null;
    content_type: string;
    width: number | null;
    height: number | null;
  }>;
  engagement: {
    like_count: number;
    comment_count: number;
    share_count: number;
    liked_by_viewer: boolean;
  };
  _score?: number;
};

type Cursor = { cursorScore: number; cursorId: string } | null;

const fieldInputClass =
  "w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] outline-none focus-visible:border-[var(--ui-brand-green)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus-ring)]";

export function ActivityClient() {
  const { address, isConnected, signMessageAsync, getCdpAccessToken } = useAminiSigning();
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("post");

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [highlightedPost, setHighlightedPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<Cursor>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [sharePostId, setSharePostId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [shareSocial, setShareSocial] = useState<SocialShareUrls | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // --- Fetch highlighted post if arriving via share link ---
  useEffect(() => {
    if (!highlightPostId) return;
    let cancelled = false;
    (async () => {
      try {
        const viewer = address && isConnected ? `&viewerWallet=${encodeURIComponent(address)}` : "";
        const res = await fetch(`/api/feed/post?id=${encodeURIComponent(highlightPostId)}${viewer}`);
        const json = await res.json();
        if (!cancelled && json.ok && json.post) {
          setHighlightedPost(json.post);
        }
      } catch {
        /* non-critical */
      }
    })();
    return () => { cancelled = true; };
  }, [highlightPostId, address, isConnected]);

  // --- Feed loader ---
  const loadFeed = useCallback(async (cursor?: Cursor) => {
    const isFirst = !cursor;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    setError(null);
    try {
      const viewer = address && isConnected ? `&viewerWallet=${encodeURIComponent(address)}` : "";
      let url = `/api/feed?limit=${PAGE_SIZE}${viewer}`;
      if (cursor) {
        url += `&cursorScore=${cursor.cursorScore}&cursorId=${encodeURIComponent(cursor.cursorId)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? "Failed to load feed");
      const newPosts: FeedPost[] = json.posts || [];
      if (isFirst) {
        setPosts(newPosts);
      } else {
        setPosts((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...newPosts.filter((p) => !ids.has(p.id))];
        });
      }
      setNextCursor(json.nextCursor ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (isFirst) setLoading(false); else setLoadingMore(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  // --- Infinite scroll via IntersectionObserver ---
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor && !loadingMore) {
          void loadFeed(nextCursor);
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, loadingMore, loadFeed]);

  // --- Auto-scroll to highlighted post ---
  useEffect(() => {
    if (!highlightPostId || hasScrolled) return;
    const el = document.getElementById(`post-${highlightPostId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHasScrolled(true);
    }
  }, [highlightPostId, hasScrolled, highlightedPost, posts]);

  // --- Toast auto-clear ---
  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 3000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // --- Like ---
  const toggleLike = async (post: FeedPost) => {
    if (!address || !isConnected) {
      setToastMsg({ kind: "err", text: "Connect your wallet to like posts." });
      return;
    }
    const isLiking = !post.engagement.liked_by_viewer;
    const method = isLiking ? "POST" : "DELETE";
    const w = address.toLowerCase();

    const optimistic = (target: FeedPost[], liking: boolean) =>
      target.map((p) =>
        p.id !== post.id
          ? p
          : {
              ...p,
              engagement: {
                ...p.engagement,
                liked_by_viewer: liking,
                like_count: Math.max(0, p.engagement.like_count + (liking ? 1 : -1)),
              },
            },
      );

    setPosts((prev) => optimistic(prev, isLiking));
    if (highlightedPost?.id === post.id) {
      setHighlightedPost((prev) => prev ? optimistic([prev], isLiking)[0] : prev);
    }

    try {
      const auth = await buildAminiVerificationAuth(
        isLiking ? "Like Organization Post" : "Unlike Organization Post",
        w,
        { signMessageAsync, getCdpAccessToken },
      );
      const res = await fetch(`/api/organizations/${post.organization_id}/posts/${post.id}/likes`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: w,
          signature: auth.signature,
          signatureTimestamp: auth.signatureTimestamp,
          ...(auth.cdpAccessToken ? { cdpAccessToken: auth.cdpAccessToken } : {}),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? "Failed to update like");
    } catch (e) {
      setToastMsg({ kind: "err", text: (e as Error).message });
      setPosts((prev) => optimistic(prev, !isLiking));
      if (highlightedPost?.id === post.id) {
        setHighlightedPost((prev) => prev ? optimistic([prev], !isLiking)[0] : prev);
      }
    }
  };

  // --- Share modal ---
  const openShareModal = useCallback(
    (post: FeedPost) => {
      const url = origin ? `${origin}/activity?post=${post.id}` : "";
      if (!url) return;
      setSharePostId(post.id);
      setShareUrl(url);
      setShareSocial(buildSocialShareUrls(url, `Check out this update on Amini!`, `${post.org_name} update`));
      setCopyHint(null);
      setShareOpen(true);
    },
    [origin],
  );

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

  const nativeShare = useCallback(async () => {
    if (!shareUrl || !canNativeShare) return;
    try {
      await navigator.share({ title: "Amini", text: "Check out this update on Amini!", url: shareUrl });
    } catch { /* user cancelled */ }
  }, [shareUrl, canNativeShare]);

  const recordShareOnce = useCallback(
    async (postId: string, orgId: string) => {
      try {
        const w = address && isConnected ? address.toLowerCase() : "";
        const payload: Record<string, unknown> = {};
        if (w) {
          const auth = await buildAminiVerificationAuth("Share Organization Post", w, {
            signMessageAsync,
            getCdpAccessToken,
          });
          payload.wallet = w;
          payload.signature = auth.signature;
          payload.signatureTimestamp = auth.signatureTimestamp;
          if (auth.cdpAccessToken) payload.cdpAccessToken = auth.cdpAccessToken;
        }
        const res = await fetch(`/api/organizations/${orgId}/posts/${postId}/shares`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; counted?: boolean };
        if (json.ok && json.counted) {
          const bump = (arr: FeedPost[]) =>
            arr.map((p) =>
              p.id !== postId
                ? p
                : { ...p, engagement: { ...p.engagement, share_count: p.engagement.share_count + 1 } },
            );
          setPosts(bump);
          if (highlightedPost?.id === postId) {
            setHighlightedPost((prev) => prev ? bump([prev])[0] : prev);
          }
        }
      } catch { /* ignore */ }
    },
    [address, isConnected, signMessageAsync, getCdpAccessToken, highlightedPost],
  );

  const onShareAction = useCallback(
    (action: "copy" | "native" | "platform") => {
      if (!sharePostId) return;
      const post = highlightedPost?.id === sharePostId
        ? highlightedPost
        : posts.find((p) => p.id === sharePostId);
      if (!post) return;
      if (action === "copy") void copyShareLink();
      if (action === "native") void nativeShare();
      void recordShareOnce(post.id, post.organization_id);
    },
    [sharePostId, highlightedPost, posts, copyShareLink, nativeShare, recordShareOnce],
  );

  // --- Build the combined list: highlighted post first, then feed (deduplicated) ---
  const allPosts: FeedPost[] = [];
  if (highlightedPost && highlightPostId) {
    allPosts.push(highlightedPost);
  }
  const seenIds = new Set(allPosts.map((p) => p.id));
  for (const p of posts) {
    if (!seenIds.has(p.id)) {
      allPosts.push(p);
      seenIds.add(p.id);
    }
  }

  // --- Render a single post card ---
  const renderPost = (p: FeedPost, isHighlighted: boolean) => (
    <li
      key={p.id}
      id={`post-${p.id}`}
      className={`overflow-hidden rounded-2xl border bg-[var(--ui-surface)] shadow-[var(--ui-shadow-sm)] transition-all ${
        isHighlighted
          ? "border-[var(--ui-brand-green)] ring-2 ring-[var(--ui-brand-green)]/20"
          : "border-[var(--ui-border)] hover:shadow-[var(--ui-shadow-md)]"
      }`}
    >
      <div className="p-4 pb-3 sm:p-5 sm:pb-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <Link
            href={`/organizations/${p.organization_id}`}
            className="flex min-w-0 items-center gap-3 transition-opacity hover:opacity-80"
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-elev)]">
              {p.org_logo_url ? (
                <Image src={p.org_logo_url} alt="" fill className="object-cover" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--ui-muted)]">
                  <Icon name="peopleGroup" size="s" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--ui-text)]">{p.org_name}</p>
              <TextCaption className="truncate text-[var(--ui-muted)]">
                {new Date(p.created_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </TextCaption>
            </div>
          </Link>
        </div>
        <TextBody className="whitespace-pre-wrap text-[var(--ui-text)]">{p.body}</TextBody>
      </div>

      {p.media && p.media.length > 0 ? (
        <div
          className={`grid gap-0.5 border-y border-[var(--ui-border)] bg-[var(--ui-border)] ${
            p.media.length === 1
              ? "grid-cols-1"
              : p.media.length === 2
                ? "grid-cols-2"
                : "grid-cols-2"
          }`}
        >
          {p.media.slice(0, 4).map((m, i, arr) => {
            const src = (m.url ?? m.cid ?? "").trim();
            if (!src) return null;
            const isThreeAndFirst = arr.length === 3 && i === 0;
            return (
              <div
                key={m.id}
                className={`relative bg-[var(--ui-surface-elev)] ${
                  isThreeAndFirst ? "col-span-2 aspect-[2/1]" : arr.length === 1 ? "" : "aspect-square"
                } ${arr.length === 1 ? "max-h-[400px] w-full" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className={`w-full ${arr.length === 1 ? "max-h-[400px] object-contain bg-black/5 dark:bg-white/5" : "h-full object-cover"}`}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5 sm:py-3">
        <button
          type="button"
          onClick={() => void toggleLike(p)}
          className={`inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
            p.engagement?.liked_by_viewer
              ? "text-[var(--ui-brand-green)]"
              : "text-[var(--ui-muted)] hover:bg-black/5 hover:text-[var(--ui-text)] dark:hover:bg-white/5"
          }`}
        >
          <Icon name="thumbsUpOutline" size="s" />
          Like
          <span className="font-mono text-[11px]">{p.engagement?.like_count ?? 0}</span>
        </button>

        <Link
          href={`/organizations/${p.organization_id}#post-${p.id}`}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--ui-muted)] transition-colors hover:bg-black/5 hover:text-[var(--ui-text)] dark:hover:bg-white/5"
        >
          <Icon name="comment" size="s" />
          Comment
          <span className="font-mono text-[11px]">{p.engagement?.comment_count ?? 0}</span>
        </Link>

        <button
          type="button"
          onClick={() => openShareModal(p)}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--ui-muted)] transition-colors hover:bg-black/5 hover:text-[var(--ui-text)] dark:hover:bg-white/5"
        >
          <Icon name="share" size="s" />
          Share
          <span className="font-mono text-[11px]">{p.engagement?.share_count ?? 0}</span>
        </button>
      </div>
    </li>
  );

  return (
    <main className="app-page px-3 py-6 sm:px-4 sm:py-8 md:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <TextTitle2 as="h1" className="brand-brown">
            Activity Feed
          </TextTitle2>
        </div>

        {/* Toast */}
        {toastMsg ? (
          <div
            className={`mb-4 rounded-xl border px-4 py-2 text-sm font-medium ${
              toastMsg.kind === "ok"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
            }`}
            role="status"
          >
            {toastMsg.text}
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size={2} />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/30 dark:bg-red-900/10">
            <TextBody className="text-red-600 dark:text-red-400">{error}</TextBody>
            <Button variant="secondary" onClick={() => void loadFeed()} className="mt-4">
              Try again
            </Button>
          </div>
        ) : allPosts.length === 0 ? (
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-12 text-center shadow-[var(--ui-shadow-sm)]">
            <TextTitle2 as="h2" className="mb-2 text-[var(--ui-text)]">
              No activity yet
            </TextTitle2>
            <TextBody className="text-[var(--ui-muted)]">
              When verified organizations post updates, they will appear here.
            </TextBody>
          </div>
        ) : (
          <>
            <ul className="space-y-6">
              {allPosts.map((p) => renderPost(p, p.id === highlightPostId))}
            </ul>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="flex justify-center py-6">
              {loadingMore ? <Spinner size={2} /> : nextCursor ? (
                <TextCaption className="text-[var(--ui-muted)]">Scroll for more</TextCaption>
              ) : posts.length > 0 ? (
                <TextCaption className="text-[var(--ui-muted)]">You&apos;re all caught up</TextCaption>
              ) : null}
            </div>
          </>
        )}

        {/* Share modal */}
        {shareSocial && sharePostId ? (
          <Modal
            visible={shareOpen}
            onRequestClose={() => setShareOpen(false)}
            className="rounded-2xl overflow-hidden"
          >
            <ModalHeader title="Share this post" closeAccessibilityLabel="Close" />
            <ModalBody className="px-5 py-4 sm:px-6">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ui-muted)]" htmlFor="feed-share-url">
                    Link
                  </label>
                  <input
                    id="feed-share-url"
                    readOnly
                    value={shareUrl}
                    className={`${fieldInputClass} font-mono text-xs sm:text-sm`}
                  />
                  {copyHint ? (
                    <p className="mt-2 text-xs text-[var(--ui-brand-green)]" role="status">
                      {copyHint}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    compact
                    className="min-h-9"
                    onClick={() => onShareAction("copy")}
                  >
                    Copy link
                  </Button>
                  {canNativeShare ? (
                    <Button
                      type="button"
                      variant="secondary"
                      compact
                      className="min-h-9"
                      onClick={() => onShareAction("native")}
                    >
                      Share…
                    </Button>
                  ) : null}
                </div>

                <div>
                  <TextCaption className="mb-2 block text-[var(--ui-muted)]">Share via</TextCaption>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {sharePlatformButtons.map(({ id, label, Icon, iconClass }) => {
                      const href = shareSocial[id];
                      const isMail = href.startsWith("mailto:");
                      return (
                        <a
                          key={id}
                          href={href}
                          aria-label={label}
                          title={label}
                          onClick={() => onShareAction("platform")}
                          {...(isMail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                          className={[
                            "flex h-12 items-center justify-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] transition-colors hover:border-[var(--ui-brand-green)]/40 hover:bg-[var(--ui-brand-green)]/8",
                            sharePlatformButtons.find((b) => b.id === id)?.buttonClass ?? "",
                          ].join(" ")}
                        >
                          <Icon className={`h-6 w-6 shrink-0 ${iconClass}`} aria-hidden />
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter
              primaryAction={
                <Button type="button" onClick={() => setShareOpen(false)}>
                  Done
                </Button>
              }
            />
          </Modal>
        ) : null}
      </div>
    </main>
  );
}
