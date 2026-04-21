"use client";

import Image from "next/image";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { IconType } from "react-icons";
import {
  FaFacebook,
  FaLinkedin,
  FaTelegram,
  FaWhatsapp,
  FaXTwitter,
} from "react-icons/fa6";
import { MdOutlineMail } from "react-icons/md";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@coinbase/cds-web/buttons/Button";
import { Modal } from "@coinbase/cds-web/overlays/modal/Modal";
import { ModalBody } from "@coinbase/cds-web/overlays/modal/ModalBody";
import { ModalFooter } from "@coinbase/cds-web/overlays/modal/ModalFooter";
import { ModalHeader } from "@coinbase/cds-web/overlays/modal/ModalHeader";
import { TextBody } from "@coinbase/cds-web/typography/TextBody";
import { TextCaption } from "@coinbase/cds-web/typography/TextCaption";
import { TextTitle2 } from "@coinbase/cds-web/typography/TextTitle2";
import { TextTitle3 } from "@coinbase/cds-web/typography/TextTitle3";
import { Icon } from "@coinbase/cds-web/icons";
import { useAminiSigning } from "@/context/AminiSigningContext";
import { SavingOverlayCard } from "@/components/SavingOverlayCard";
import { buildAminiVerificationAuth } from "@/lib/aminiWalletAuth";
import { resolveProfileAvatarUrl } from "@/lib/ipfsGatewayUrl";
import type {
  OrganizationPostCommentRow,
  OrganizationPublic,
  OrgCampaignRow,
  OrgPriorProject,
  OrganizationPostWithExtras,
} from "@/lib/organizationTypes";
import {
  buildSocialShareUrls,
  organizationShareBlurb,
  type SocialShareUrls,
} from "@/lib/organizationShareLinks";
import { formatUsdc } from "@/lib/contracts";

const sharePlatformButtons: {
  id: keyof SocialShareUrls;
  label: string;
  Icon: IconType;
  iconClass: string;
  buttonClass?: string;
}[] = [
  { id: "whatsapp", label: "Share on WhatsApp", Icon: FaWhatsapp, iconClass: "text-[#25D366]" },
  {
    id: "x",
    label: "Share on X",
    Icon: FaXTwitter,
    iconClass: "text-white",
    buttonClass: "bg-black hover:bg-black/90 border-black/30 hover:border-black/40",
  },
  { id: "linkedin", label: "Share on LinkedIn", Icon: FaLinkedin, iconClass: "text-[#0A66C2]" },
  { id: "facebook", label: "Share on Facebook", Icon: FaFacebook, iconClass: "text-[#1877F2]" },
  { id: "telegram", label: "Share on Telegram", Icon: FaTelegram, iconClass: "text-[#26A5E4]" },
  {
    id: "email",
    label: "Share by email",
    Icon: MdOutlineMail,
    iconClass: "text-[var(--ui-muted)]",
  },
];

type Mode = "preview" | "edit";

function campaignTitle(c: OrgCampaignRow): string {
  const t = c.title?.trim();
  if (t) return t;
  return `Campaign ${c.id}`;
}

const chipClass =
  "inline-flex items-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--ui-text)]";

const fieldInputClass =
  "w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] outline-none focus-visible:border-[var(--ui-brand-green)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus-ring)]";

const MAX_PRIOR_PROJECTS_UI = 24;

function normalizePriorProjects(raw: unknown): OrgPriorProject[] {
  if (!Array.isArray(raw)) return [];
  const out: OrgPriorProject[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    const row: OrgPriorProject = { title: title.slice(0, 200) };
    if (typeof o.summary === "string" && o.summary.trim()) {
      row.summary = o.summary.trim().slice(0, 800);
    }
    if (typeof o.year === "string" && o.year.trim()) {
      row.year = o.year.trim().slice(0, 32);
    }
    if (typeof o.link_url === "string" && o.link_url.trim()) {
      row.link_url = o.link_url.trim().slice(0, 2048);
    }
    out.push(row);
  }
  return out;
}

function goalLabel(target: string | number | null | undefined): string | null {
  if (target == null || target === "") return null;
  const raw =
    typeof target === "number"
      ? Number.isFinite(target)
        ? String(Math.trunc(target))
        : ""
      : String(target).trim().replace(/,/g, "");
  if (!raw) return null;
  const intPart = raw.split(".")[0] ?? raw;
  try {
    return `${formatUsdc(BigInt(intPart || "0"))} USDC`;
  } catch {
    return `${raw} USDC`;
  }
}

export function OrganizationProfileClient({
  orgId,
  initialOrganization,
  initialCampaigns,
}: {
  orgId: string;
  initialOrganization: OrganizationPublic;
  initialCampaigns: OrgCampaignRow[];
}) {
  const { address, isConnected, getCdpAccessToken, signMessageAsync } = useAminiSigning();
  const isOwner = Boolean(
    address &&
      isConnected &&
      address.toLowerCase() === initialOrganization.wallet.toLowerCase(),
  );

  const [mode, setMode] = useState<Mode>("preview");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [org, setOrg] = useState(initialOrganization);
  const [campaigns] = useState(initialCampaigns);
  const [posts, setPosts] = useState<OrganizationPostWithExtras[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  const [name, setName] = useState(org.name);
  const [tagline, setTagline] = useState(org.tagline ?? "");
  const [description, setDescription] = useState(org.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(org.website_url ?? "");
  const [country, setCountry] = useState(org.country ?? "");
  const [twitterHandle, setTwitterHandle] = useState(org.twitter_handle ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(org.linkedin_url ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [priorProjects, setPriorProjects] = useState<OrgPriorProject[]>(() =>
    normalizePriorProjects(initialOrganization.prior_projects),
  );

  const [postDraft, setPostDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postImages, setPostImages] = useState<File[]>([]);
  const [postImagePreviews, setPostImagePreviews] = useState<string[]>([]);
  const [postImageError, setPostImageError] = useState<string | null>(null);
  const postImagesInputRef = useRef<HTMLInputElement | null>(null);

  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comments, setComments] = useState<OrganizationPostCommentRow[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<OrganizationPostCommentRow | null>(null);

  const [origin, setOrigin] = useState("");
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [postCopyHint, setPostCopyHint] = useState<string | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [postShareOpen, setPostShareOpen] = useState(false);
  const [postShareId, setPostShareId] = useState<string | null>(null);
  const [postShareUrl, setPostShareUrl] = useState<string>("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
    setCanNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

  const shareUrl = origin ? `${origin}/organizations/${orgId}` : "";
  const featuredCampaign = useMemo(() => campaigns[0] ?? null, [campaigns]);
  const savedPriorProjects = useMemo(
    () => normalizePriorProjects(org.prior_projects),
    [org.prior_projects],
  );
  const shareBlurb = useMemo(() => organizationShareBlurb(org), [org.name, org.tagline, org.description]);
  const socialLinks = useMemo(() => {
    if (!shareUrl) return null;
    return buildSocialShareUrls(shareUrl, shareBlurb, `${org.name} on Amini`);
  }, [shareUrl, shareBlurb, org.name]);

  const postSocialLinks = useMemo(() => {
    if (!postShareUrl) return null;
    return buildSocialShareUrls(postShareUrl, shareBlurb, `${org.name} update on Amini`);
  }, [postShareUrl, shareBlurb, org.name]);

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

  const copyPostShareLink = useCallback(async () => {
    if (!postShareUrl) return;
    try {
      await navigator.clipboard.writeText(postShareUrl);
      setPostCopyHint("Copied to clipboard.");
      window.setTimeout(() => setPostCopyHint(null), 2500);
    } catch {
      setPostCopyHint("Could not copy. Select the link manually.");
      window.setTimeout(() => setPostCopyHint(null), 3500);
    }
  }, [postShareUrl]);

  const nativeShare = useCallback(async () => {
    if (!shareUrl || !canNativeShare) return;
    try {
      await navigator.share({
        title: org.name,
        text: shareBlurb,
        url: shareUrl,
      });
    } catch {
      /* user cancelled or share failed */
    }
  }, [shareUrl, canNativeShare, org.name, shareBlurb]);

  const nativeSharePost = useCallback(async () => {
    if (!postShareUrl || !canNativeShare) return;
    try {
      await navigator.share({
        title: org.name,
        text: shareBlurb,
        url: postShareUrl,
      });
    } catch {
      /* user cancelled or share failed */
    }
  }, [postShareUrl, canNativeShare, org.name, shareBlurb]);

  const resetForm = useCallback(() => {
    setName(org.name);
    setTagline(org.tagline ?? "");
    setDescription(org.description ?? "");
    setWebsiteUrl(org.website_url ?? "");
    setCountry(org.country ?? "");
    setTwitterHandle(org.twitter_handle ?? "");
    setLinkedinUrl(org.linkedin_url ?? "");
    setLogoFile(null);
    setCoverFile(null);
    setLogoPreview(null);
    setCoverPreview(null);
    setPriorProjects(normalizePriorProjects(org.prior_projects));
  }, [org]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPostsLoading(true);
      try {
        const viewer = address && isConnected ? `&viewerWallet=${encodeURIComponent(address.toLowerCase())}` : "";
        const res = await fetch(`/api/organizations/${orgId}/posts?limit=30${viewer}`);
        const json = await res.json();
        if (!cancelled && json.ok && Array.isArray(json.posts)) setPosts(json.posts);
      } catch {
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setPostsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, address, isConnected]);

  const clearPostImages = useCallback(() => {
    setPostImages([]);
    setPostImagePreviews([]);
    setPostImageError(null);
    if (postImagesInputRef.current) postImagesInputRef.current.value = "";
  }, []);

  const onPickPostImages = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const MAX_IMAGES = 4;
    const MAX_BYTES = 5 * 1024 * 1024;
    const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

    const next = files.slice(0, MAX_IMAGES);
    for (const f of next) {
      if (!ALLOWED.has(f.type)) {
        setPostImageError("Unsupported image type. Use JPG, PNG, WEBP, or GIF.");
        return;
      }
      if (f.size <= 0 || f.size > MAX_BYTES) {
        setPostImageError("Image too large. Max 5MB each.");
        return;
      }
    }

    setPostImageError(null);
    setPostImages(next);
    setPostImagePreviews(next.map((f) => URL.createObjectURL(f)));
  }, []);

  const displayLogo =
    logoPreview ||
    (org.logo_url?.trim() ? resolveProfileAvatarUrl(org.logo_url) ?? org.logo_url : null);
  const displayCover =
    coverPreview ||
    (org.cover_image_url?.trim() ? resolveProfileAvatarUrl(org.cover_image_url) ?? org.cover_image_url : null);

  const saveOrg = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const auth = await buildAminiVerificationAuth("Update Organization", org.wallet, {
        signMessageAsync,
        getCdpAccessToken,
      });
      const fd = new FormData();
      fd.append("name", name);
      fd.append("tagline", tagline);
      fd.append("description", description);
      fd.append("websiteUrl", websiteUrl);
      fd.append("country", country);
      fd.append("twitterHandle", twitterHandle);
      fd.append("linkedinUrl", linkedinUrl);
      if (logoFile) fd.append("logo", logoFile);
      if (coverFile) fd.append("cover", coverFile);
      fd.append("signature", auth.signature);
      fd.append("signatureTimestamp", auth.signatureTimestamp);
      if (auth.cdpAccessToken) fd.append("cdpAccessToken", auth.cdpAccessToken);

      const priorPayload = priorProjects
        .filter((p) => p.title.trim())
        .map((p) => ({
          title: p.title.trim(),
          ...(p.summary?.trim() ? { summary: p.summary.trim() } : {}),
          ...(p.year?.trim() ? { year: p.year.trim() } : {}),
          ...(p.link_url?.trim() ? { link_url: p.link_url.trim() } : {}),
        }));
      fd.append("priorProjects", JSON.stringify(priorPayload));

      const res = await fetch(`/api/organizations/${orgId}`, { method: "PATCH", body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? "Save failed");
      if (json.organization) {
        setOrg(json.organization);
        setName(json.organization.name);
        setTagline(json.organization.tagline ?? "");
        setDescription(json.organization.description ?? "");
        setWebsiteUrl(json.organization.website_url ?? "");
        setCountry(json.organization.country ?? "");
        setTwitterHandle(json.organization.twitter_handle ?? "");
        setLinkedinUrl(json.organization.linkedin_url ?? "");
        setPriorProjects(normalizePriorProjects(json.organization.prior_projects));
      }
      setLogoFile(null);
      setCoverFile(null);
      setLogoPreview(null);
      setCoverPreview(null);
      setMessage({ kind: "ok", text: "Organization page updated." });
      setMode("preview");
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const submitPost = async () => {
    const body = postDraft.trim();
    if (!body || org.status !== "approved") return;
    setPosting(true);
    setMessage(null);
    try {
      const auth = await buildAminiVerificationAuth("Create Organization Post", org.wallet, {
        signMessageAsync,
        getCdpAccessToken,
      });
      const fd = new FormData();
      fd.append("body", body);
      fd.append("signature", auth.signature);
      fd.append("signatureTimestamp", auth.signatureTimestamp);
      if (auth.cdpAccessToken) fd.append("cdpAccessToken", auth.cdpAccessToken);
      for (const img of postImages) fd.append("images", img);

      const res = await fetch(`/api/organizations/${orgId}/posts`, { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? "Could not publish");
      setPostDraft("");
      clearPostImages();
      if (json.post) setPosts((prev) => [json.post, ...prev]);
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = useCallback(
    async (post: OrganizationPostWithExtras) => {
      if (!address || !isConnected) {
        setMessage({ kind: "err", text: "Connect your wallet to like posts." });
        return;
      }
      const w = address.toLowerCase();
      const nextLiked = !post.engagement.liked_by_viewer;
      setPosts((prev) =>
        prev.map((p) =>
          p.id !== post.id
            ? p
            : {
                ...p,
                engagement: {
                  ...p.engagement,
                  liked_by_viewer: nextLiked,
                  like_count: Math.max(0, p.engagement.like_count + (nextLiked ? 1 : -1)),
                },
              },
        ),
      );
      try {
        const auth = await buildAminiVerificationAuth(
          nextLiked ? "Like Organization Post" : "Unlike Organization Post",
          w,
          { signMessageAsync, getCdpAccessToken },
        );
        const res = await fetch(`/api/organizations/${orgId}/posts/${post.id}/likes`, {
          method: nextLiked ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: w,
            signature: auth.signature,
            signatureTimestamp: auth.signatureTimestamp,
            ...(auth.cdpAccessToken ? { cdpAccessToken: auth.cdpAccessToken } : {}),
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.message ?? "Like failed");
      } catch (e) {
        // revert on failure
        setPosts((prev) =>
          prev.map((p) =>
            p.id !== post.id
              ? p
              : {
                  ...p,
                  engagement: {
                    ...p.engagement,
                    liked_by_viewer: !nextLiked,
                    like_count: Math.max(0, p.engagement.like_count + (nextLiked ? -1 : 1)),
                  },
                },
          ),
        );
        setMessage({ kind: "err", text: (e as Error).message });
      }
    },
    [address, isConnected, buildAminiVerificationAuth, getCdpAccessToken, orgId, signMessageAsync],
  );

  const openComments = useCallback(
    async (postId: string) => {
      setCommentsOpenFor(postId);
      setComments([]);
      setCommentDraft("");
      setReplyTo(null);
      setCommentsLoading(true);
      try {
        const res = await fetch(`/api/organizations/${orgId}/posts/${postId}/comments?limit=100`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.comments)) setComments(json.comments);
      } finally {
        setCommentsLoading(false);
      }
    },
    [orgId],
  );

  const submitComment = useCallback(async () => {
    const postId = commentsOpenFor;
    const body = commentDraft.trim();
    if (!postId || !body) return;
    if (!address || !isConnected) {
      setMessage({ kind: "err", text: "Connect your wallet to comment." });
      return;
    }
    setCommentPosting(true);
    try {
      const w = address.toLowerCase();
      const auth = await buildAminiVerificationAuth("Comment on Organization Post", w, {
        signMessageAsync,
        getCdpAccessToken,
      });
      const res = await fetch(`/api/organizations/${orgId}/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: w,
          body,
          ...(replyTo?.id ? { parentId: replyTo.id } : {}),
          signature: auth.signature,
          signatureTimestamp: auth.signatureTimestamp,
          ...(auth.cdpAccessToken ? { cdpAccessToken: auth.cdpAccessToken } : {}),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? "Comment failed");
      const c = json.comment as OrganizationPostCommentRow | null;
      if (c) {
        setComments((prev) => [...prev, c]);
        setPosts((prev) =>
          prev.map((p) =>
            p.id !== postId
              ? p
              : { ...p, engagement: { ...p.engagement, comment_count: p.engagement.comment_count + 1 } },
          ),
        );
      }
      setCommentDraft("");
      setReplyTo(null);
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setCommentPosting(false);
    }
  }, [
    commentsOpenFor,
    commentDraft,
    address,
    isConnected,
    orgId,
    buildAminiVerificationAuth,
    signMessageAsync,
    getCdpAccessToken,
    replyTo,
  ]);

  const sharePost = useCallback(
    async (postId: string) => {
      const url = origin ? `${origin}/activity?post=${postId}` : "";
      if (!url) return;
      setPostShareId(postId);
      setPostShareUrl(url);
      setPostCopyHint(null);
      setPostShareOpen(true);
    },
    [origin],
  );

  const recordPostShare = useCallback(
    async (postId: string) => {
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
        if (!json.ok) return;
        if (json.counted) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id !== postId
                ? p
                : { ...p, engagement: { ...p.engagement, share_count: p.engagement.share_count + 1 } },
            ),
          );
        }
      } catch {
        /* ignore */
      }
    },
    [address, isConnected, orgId, buildAminiVerificationAuth, signMessageAsync, getCdpAccessToken],
  );

  const deletePost = async (postId: string) => {
    if (!confirm("Delete this post?")) return;
    try {
      const auth = await buildAminiVerificationAuth("Delete Organization Post", org.wallet, {
        signMessageAsync,
        getCdpAccessToken,
      });
      const res = await fetch(`/api/organizations/${orgId}/posts/${postId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: auth.signature,
          signatureTimestamp: auth.signatureTimestamp,
          ...(auth.cdpAccessToken ? { cdpAccessToken: auth.cdpAccessToken } : {}),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? "Delete failed");
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    }
  };

  const onLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return;
    if (file.size > 2 * 1024 * 1024) return;
    setLogoFile(file);
    const r = new FileReader();
    r.onloadend = () => setLogoPreview(r.result as string);
    r.readAsDataURL(file);
  };

  const onCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return;
    if (file.size > 3 * 1024 * 1024) return;
    setCoverFile(file);
    const r = new FileReader();
    r.onloadend = () => setCoverPreview(r.result as string);
    r.readAsDataURL(file);
  };

  const showEdit = isOwner && mode === "edit";
  const viewMode = !isOwner || mode === "preview";

  const statusTag =
    org.status === "approved" ? (
      <span className={`${chipClass} border-emerald-500/40 text-emerald-700 dark:text-emerald-400`}>
        Verified organization
      </span>
    ) : org.status === "pending" ? (
      <span className={`${chipClass} border-amber-500/40 text-amber-800 dark:text-amber-200`}>
        Pending review
      </span>
    ) : (
      <span className={`${chipClass} border-red-500/40 text-red-700 dark:text-red-400`}>
        Not verified
      </span>
    );

  return (
    <main className="app-page pt-16 pb-12 sm:pt-24 sm:pb-16">
      <div className="mx-auto w-full max-w-5xl px-3 sm:px-4">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start justify-between gap-4 lg:justify-start">
            <div className="min-w-0">
              <TextCaption className="mb-1 block uppercase tracking-wider text-[var(--ui-muted)]">
                Organization
              </TextCaption>
              <div className="flex items-center gap-3">
                <TextTitle2 as="h1" className="text-[var(--ui-text)]">
                  {org.name}
                </TextTitle2>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">{statusTag}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {!isOwner && featuredCampaign ? (
              <Button
                as={Link}
                href={`/campaigns/${featuredCampaign.id}`}
                variant="primary"
                className="w-full shrink-0 sm:w-auto"
              >
                Fund with USDC
              </Button>
            ) : null}
            {isOwner ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-1">
                <Button
                  type="button"
                  variant={mode === "preview" ? "primary" : "secondary"}
                  className="!min-h-9"
                  onClick={() => {
                    setMode("preview");
                    resetForm();
                    setMessage(null);
                  }}
                >
                  Preview
                </Button>
                <Button
                  type="button"
                  variant={mode === "edit" ? "primary" : "secondary"}
                  className="!min-h-9"
                  onClick={() => {
                    setMode("edit");
                    setMessage(null);
                  }}
                >
                  Edit
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] shadow-[var(--ui-shadow-md)]">
              <SavingOverlayCard
                open={saving}
                title="Saving organization"
                subtitle="Signing and uploads can take a few seconds. You can keep this tab open."
                spinnerLabel="Saving organization"
              />
              <div className="relative h-40 w-full bg-[var(--ui-surface)] sm:h-48">
                {displayCover ? (
                  <Image src={displayCover} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <div className="h-full w-full bg-gradient-to-r from-[var(--ui-brand-green)]/20 to-[var(--ui-brand-brown)]/30" />
                )}
                {showEdit ? (
                  <label className="absolute bottom-3 right-3 cursor-pointer rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-elev)]/90 px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] backdrop-blur">
                    Cover photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onCoverPick} />
                  </label>
                ) : null}
              </div>
              <div className="relative px-6 pb-6 pt-0">
                {viewMode && origin && socialLinks ? (
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="absolute right-6 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] text-[var(--ui-muted)] shadow-[var(--ui-shadow-sm)] transition-colors hover:border-[var(--ui-brand-green)]/30 hover:bg-[var(--ui-brand-green)]/10 hover:text-[var(--ui-brand-green)]"
                    aria-label="Share organization"
                    title="Share organization"
                  >
                    <Icon name="share" size="s" />
                  </button>
                ) : null}
                <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border-4 border-[var(--ui-surface-elev)] bg-[var(--ui-surface)] shadow-md sm:h-28 sm:w-28">
                    {displayLogo ? (
                      <Image src={displayLogo} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--ui-muted)]">
                        <Icon name="peopleGroup" size="l" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    {viewMode ? (
                      <>
                        <TextTitle3 as="h2" className="text-[var(--ui-text)]">
                          {org.name}
                        </TextTitle3>
                        {org.tagline?.trim() ? (
                          <TextBody className="mt-1 text-[var(--ui-muted)]">{org.tagline}</TextBody>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {org.country?.trim() ? (
                            <span className={chipClass}>
                              <span className="inline-flex items-center gap-1">
                                <Icon name="location" size="s" />
                                {org.country}
                              </span>
                            </span>
                          ) : null}
                          {org.website_url?.trim() ? (
                            <a
                              href={org.website_url.startsWith("http") ? org.website_url : `https://${org.website_url}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--ui-brand-green)] hover:underline"
                            >
                              Website <Icon name="externalLink" size="s" />
                            </a>
                          ) : null}
                          {org.twitter_handle?.trim() ? (
                            <a
                              href={`https://twitter.com/${org.twitter_handle.replace(/^@/, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-[var(--ui-brand-green)] hover:underline"
                            >
                              @{org.twitter_handle.replace(/^@/, "")}
                            </a>
                          ) : null}
                          {org.linkedin_url?.trim() ? (
                            <a
                              href={org.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-[var(--ui-brand-green)] hover:underline"
                            >
                              LinkedIn
                            </a>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <TextCaption className="text-[var(--ui-muted)]">
                        Adjust how sponsors and donors see your organization.
                      </TextCaption>
                    )}
                  </div>
                </div>

                {showEdit ? (
                  <div className="mt-8 space-y-4 border-t border-[var(--ui-border)] pt-8">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--ui-border)] px-4 py-2 text-sm">
                      <Icon name="upload" size="s" />
                      Logo
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onLogoPick} />
                    </label>
                    <div>
                      <TextCaption className="mb-2 block text-[var(--ui-muted)]">Organization name</TextCaption>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={fieldInputClass}
                        autoComplete="organization"
                      />
                    </div>
                    <div>
                      <TextCaption className="mb-2 block text-[var(--ui-muted)]">Tagline</TextCaption>
                      <input
                        type="text"
                        value={tagline}
                        onChange={(e) => setTagline(e.target.value)}
                        placeholder="One line under your name"
                        className={fieldInputClass}
                      />
                    </div>
                    <div>
                      <TextCaption className="mb-2 block text-[var(--ui-muted)]">Website URL</TextCaption>
                      <input
                        type="url"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        className={fieldInputClass}
                        placeholder="https://"
                      />
                    </div>
                    <div>
                      <TextCaption className="mb-2 block text-[var(--ui-muted)]">Country / region</TextCaption>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className={fieldInputClass}
                      />
                    </div>
                    <div>
                      <TextCaption className="mb-2 block text-[var(--ui-muted)]">Twitter handle</TextCaption>
                      <input
                        type="text"
                        value={twitterHandle}
                        onChange={(e) => setTwitterHandle(e.target.value)}
                        className={fieldInputClass}
                        placeholder="@organization"
                      />
                    </div>
                    <div>
                      <TextCaption className="mb-2 block text-[var(--ui-muted)]">LinkedIn URL</TextCaption>
                      <input
                        type="url"
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        className={fieldInputClass}
                      />
                    </div>
                    <div>
                      <TextCaption className="mb-2 block text-[var(--ui-muted)]">About</TextCaption>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={6}
                        className={`${fieldInputClass} min-h-[140px] resize-y`}
                        placeholder="Mission, impact focus, and how sponsorships help."
                      />
                    </div>
                    <div id="edit-prior-projects" className="scroll-mt-28 border-t border-[var(--ui-border)] pt-6">
                      <TextCaption className="mb-1 block text-[var(--ui-text)]">
                        Past work (off-platform)
                      </TextCaption>
                      <TextBody className="mb-4 text-xs text-[var(--ui-muted)]">
                        List completed projects from before Amini or outside this platform. Sponsors use this as
                        context—keep it accurate. Optional link per row (https only).
                      </TextBody>
                      <div className="space-y-4">
                        {priorProjects.map((row, i) => (
                          <div
                            key={i}
                            className="space-y-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3"
                          >
                            <input
                              type="text"
                              value={row.title}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPriorProjects((prev) => {
                                  const next = [...prev];
                                  next[i] = { ...next[i], title: v };
                                  return next;
                                });
                              }}
                              placeholder="Project title"
                              className={fieldInputClass}
                              maxLength={200}
                            />
                            <input
                              type="text"
                              value={row.year ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPriorProjects((prev) => {
                                  const next = [...prev];
                                  next[i] = { ...next[i], year: v };
                                  return next;
                                });
                              }}
                              placeholder="Year or range (e.g. 2023 or 2021–2024)"
                              className={fieldInputClass}
                              maxLength={32}
                            />
                            <textarea
                              value={row.summary ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPriorProjects((prev) => {
                                  const next = [...prev];
                                  next[i] = { ...next[i], summary: v };
                                  return next;
                                });
                              }}
                              placeholder="Short description (optional)"
                              rows={2}
                              className={`${fieldInputClass} min-h-[72px] resize-y`}
                              maxLength={800}
                            />
                            <input
                              type="url"
                              value={row.link_url ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPriorProjects((prev) => {
                                  const next = [...prev];
                                  next[i] = { ...next[i], link_url: v };
                                  return next;
                                });
                              }}
                              placeholder="https://… (optional)"
                              className={fieldInputClass}
                            />
                            <button
                              type="button"
                              className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                              onClick={() => setPriorProjects((prev) => prev.filter((_, j) => j !== i))}
                            >
                              Remove project
                            </button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            setPriorProjects((prev) =>
                              prev.length >= MAX_PRIOR_PROJECTS_UI
                                ? prev
                                : [...prev, { title: "" }],
                            )
                          }
                          disabled={priorProjects.length >= MAX_PRIOR_PROJECTS_UI}
                        >
                          Add past project
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="primary" onClick={() => void saveOrg()} disabled={saving}>
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => {
                          resetForm();
                          setMode("preview");
                          setMessage(null);
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}

                {viewMode && org.description?.trim() ? (
                  <div className="mt-8 border-t border-[var(--ui-border)] pt-8">
                    <TextCaption className="mb-2 block uppercase tracking-wider text-[var(--ui-muted)]">
                      About
                    </TextCaption>
                    <TextBody className="whitespace-pre-wrap text-[var(--ui-text)]">{org.description}</TextBody>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-6 shadow-[var(--ui-shadow-md)]">
              <div className="mb-4 flex items-center justify-between gap-2">
                <TextTitle3 as="h2" className="text-[var(--ui-text)]">
                  Updates
                </TextTitle3>
                {org.status !== "approved" ? (
                  <TextCaption className="text-[var(--ui-muted)]">Posts go live after approval.</TextCaption>
                ) : null}
              </div>

              {isOwner && org.status === "approved" ? (
                <div className="mb-6 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
                  <textarea
                    value={postDraft}
                    onChange={(e) => setPostDraft(e.target.value)}
                    rows={4}
                    placeholder="Share milestones, sponsorship asks, or impact stories…"
                    className={`${fieldInputClass} mb-3 min-h-[100px] resize-y`}
                  />
                  {postImagePreviews.length > 0 ? (
                    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {postImagePreviews.map((src, idx) => (
                        <div
                          key={src}
                          className="relative aspect-square overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              const nextFiles = postImages.filter((_, i) => i !== idx);
                              setPostImages(nextFiles);
                              setPostImagePreviews((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white hover:bg-black/70"
                            aria-label="Remove image"
                            title="Remove"
                          >
                            <Icon name="close" size="s" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {postImageError ? (
                    <p className="mb-3 text-xs font-medium text-red-500">{postImageError}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] px-3 py-2 text-xs font-semibold text-[var(--ui-text)] hover:bg-black/5 dark:hover:bg-white/5">
                      <Icon name="image" size="s" />
                      Add images
                      <input
                        ref={postImagesInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        multiple
                        className="hidden"
                        onChange={onPickPostImages}
                      />
                    </label>
                    {postImages.length > 0 ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-[var(--ui-muted)] hover:underline"
                        onClick={() => clearPostImages()}
                      >
                        Clear
                      </button>
                    ) : null}
                  <Button variant="primary" onClick={() => void submitPost()} disabled={posting || !postDraft.trim()}>
                    {posting ? "Posting…" : "Post"}
                  </Button>
                  </div>
                </div>
              ) : null}

              {postsLoading ? (
                <TextBody className="text-[var(--ui-muted)]">Loading updates…</TextBody>
              ) : posts.length === 0 ? (
                <TextBody className="text-[var(--ui-muted)]">No posts yet.</TextBody>
              ) : (
                <ul className="space-y-4">
                  {posts.map((p) => (
                    <li
                      key={p.id}
                      id={`post-${p.id}`}
                      className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)]"
                    >
                      <div className="p-4 pb-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-elev)]">
                              {displayLogo ? (
                                <Image src={displayLogo} alt="" fill className="object-cover" unoptimized />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[var(--ui-muted)]">
                                  <Icon name="peopleGroup" size="s" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[var(--ui-text)]">{org.name}</p>
                              <TextCaption className="truncate text-[var(--ui-muted)]">
                                {new Date(p.created_at).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </TextCaption>
                            </div>
                          </div>
                          {isOwner ? (
                            <button
                              type="button"
                              className="shrink-0 text-xs font-medium text-red-500 hover:underline"
                              onClick={() => void deletePost(p.id)}
                            >
                              Delete
                            </button>
                          ) : null}
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
                                : p.media.length === 3
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
                              : "text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                          }`}
                        >
                          <Icon name="thumbsUpOutline" size="s" />
                          Like
                          <span className="font-mono text-[11px]">{p.engagement?.like_count ?? 0}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void openComments(p.id)}
                          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--ui-muted)] transition-colors hover:text-[var(--ui-text)]"
                        >
                          <Icon name="comment" size="s" />
                          Comment
                          <span className="font-mono text-[11px]">{p.engagement?.comment_count ?? 0}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void sharePost(p.id)}
                          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--ui-muted)] transition-colors hover:text-[var(--ui-text)]"
                        >
                          <Icon name="share" size="s" />
                          Share
                          <span className="font-mono text-[11px]">{p.engagement?.share_count ?? 0}</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            {viewMode && origin && postSocialLinks && postShareId ? (
              <Modal
                visible={postShareOpen}
                onRequestClose={() => setPostShareOpen(false)}
                className="rounded-2xl overflow-hidden"
              >
                <ModalHeader title="Share this post" closeAccessibilityLabel="Close" />
                <ModalBody className="px-5 py-4 sm:px-6">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ui-muted)]" htmlFor="post-share-url">
                          Link
                        </label>
                        <input
                          id="post-share-url"
                          readOnly
                          value={postShareUrl}
                          className={`${fieldInputClass} font-mono text-xs sm:text-sm`}
                        />
                        {postCopyHint ? (
                          <p className="mt-2 text-xs text-[var(--ui-brand-green)]" role="status">
                            {postCopyHint}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          compact
                          className="min-h-9"
                          onClick={() => {
                            void copyPostShareLink();
                            void recordPostShare(postShareId);
                          }}
                        >
                          Copy link
                        </Button>
                        {canNativeShare ? (
                          <Button
                            type="button"
                            variant="secondary"
                            compact
                            className="min-h-9"
                            onClick={() => {
                              void nativeSharePost();
                              void recordPostShare(postShareId);
                            }}
                          >
                            Share…
                          </Button>
                        ) : null}
                      </div>

                      <div>
                        <TextCaption className="mb-2 block text-[var(--ui-muted)]">Share via</TextCaption>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                          {sharePlatformButtons.map(({ id, label, Icon, iconClass }) => {
                            const href = postSocialLinks[id];
                            const isMail = href.startsWith("mailto:");
                            return (
                              <a
                                key={id}
                                href={href}
                                aria-label={label}
                                title={label}
                                onClick={() => void recordPostShare(postShareId)}
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
                  </div>
                </ModalBody>
                <ModalFooter
                  primaryAction={
                    <Button type="button" onClick={() => setPostShareOpen(false)}>
                      Done
                    </Button>
                  }
                />
              </Modal>
            ) : null}

            {viewMode && origin && socialLinks ? (
              <Modal
                visible={shareOpen}
                onRequestClose={() => setShareOpen(false)}
                className="rounded-2xl overflow-hidden"
              >
                <ModalHeader title="Share organization" closeAccessibilityLabel="Close" />
                <ModalBody className="px-5 py-4 sm:px-6">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                      <div className="flex shrink-0 justify-center rounded-xl border border-[var(--ui-border)] bg-white p-3 dark:bg-[var(--ui-surface)] sm:justify-start">
                        <QRCodeSVG value={shareUrl} size={140} level="M" includeMargin={false} />
                      </div>

                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--ui-muted)]" htmlFor="org-share-url">
                            Link
                          </label>
                          <input
                            id="org-share-url"
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
                        <Button type="button" variant="primary" compact className="min-h-9" onClick={() => void copyShareLink()}>
                            Copy link
                          </Button>
                          {canNativeShare ? (
                          <Button type="button" variant="secondary" compact className="min-h-9" onClick={() => void nativeShare()}>
                              Share…
                            </Button>
                          ) : null}
                        </div>

                        <div>
                          <TextCaption className="mb-2 block text-[var(--ui-muted)]">Share via</TextCaption>
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                            {sharePlatformButtons.map(({ id, label, Icon, iconClass }) => {
                              const href = socialLinks[id];
                              const isMail = href.startsWith("mailto:");
                              return (
                                <a
                                  key={id}
                                  href={href}
                                  aria-label={label}
                                  title={label}
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

            {viewMode && (savedPriorProjects.length > 0 || isOwner) ? (
              <div
                id="org-prior-projects"
                className="scroll-mt-28 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5 shadow-[var(--ui-shadow-md)]"
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <TextTitle3 as="h2" className="text-[var(--ui-text)]">
                    Past work &amp; experience
                  </TextTitle3>
                  {isOwner && savedPriorProjects.length === 0 ? (
                    <Button
                      variant="secondary"
                      compact
                      onClick={() => {
                        setMode("edit");
                        window.setTimeout(() => {
                          document.getElementById("edit-prior-projects")?.scrollIntoView({ behavior: "smooth" });
                        }, 100);
                      }}
                    >
                      Add work
                    </Button>
                  ) : null}
                </div>
                <TextBody className="mb-5 text-sm text-[var(--ui-muted)]">
                  Highlights supplied by this organization—including projects completed before or outside Amini.
                  Always verify claims independently when it matters.
                </TextBody>
                
                {savedPriorProjects.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 text-center">
                    <TextBody className="text-sm text-[var(--ui-muted)]">
                      No past projects listed yet. Add a short track record to help sponsors trust your work.
                    </TextBody>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {savedPriorProjects.map((p, idx) => (
                      <li
                        key={`${p.title}-${idx}`}
                        className="group relative rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 transition-colors hover:border-[var(--ui-brand-green)]/30"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[var(--ui-text)]">{p.title}</p>
                            {p.year?.trim() ? (
                              <p className="mt-0.5 text-xs font-medium text-[var(--ui-muted)]">{p.year.trim()}</p>
                            ) : null}
                          </div>
                          {p.link_url?.trim() ? (
                            <a
                              href={p.link_url.trim()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-full bg-[var(--ui-surface-elev)] p-2 text-[var(--ui-muted)] transition-colors hover:bg-[var(--ui-brand-green)]/10 hover:text-[var(--ui-brand-green)]"
                              aria-label={`Visit link for ${p.title}`}
                              title="Visit project link"
                            >
                              <Icon name="externalLink" size="s" />
                            </a>
                          ) : null}
                        </div>
                        {p.summary?.trim() ? (
                          <TextBody className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ui-muted)]">
                            {p.summary.trim()}
                          </TextBody>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div
              id="org-campaigns"
              className="scroll-mt-28 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-5 shadow-[var(--ui-shadow-md)]"
            >
              <TextTitle3 as="h2" className="text-[var(--ui-text)]">
                Fund &amp; campaigns
              </TextTitle3>
              <TextBody className="mt-2 text-sm text-[var(--ui-muted)]">
                Donations go to{" "}
                <strong className="font-medium text-[var(--ui-text)]">milestone escrow on Base</strong> (USDC). Funds
                move when milestones are completed and attested (EAS)—the same flow as every Amini campaign.
              </TextBody>

              {featuredCampaign && !isOwner ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    as={Link}
                    href={`/campaigns/${featuredCampaign.id}`}
                    variant="primary"
                    className="w-full sm:flex-1"
                  >
                    {campaigns.length > 1 ? "Fund latest campaign" : "Open campaign to fund"}
                  </Button>
                  {campaigns.length > 1 ? (
                    <Button as={Link} href="#org-campaign-list" variant="secondary" className="w-full sm:w-auto">
                      All campaigns
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {campaigns.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
                  {isOwner ? (
                    <>
                      <TextBody className="text-sm text-[var(--ui-muted)]">
                        No campaign is linked to this organization yet. Create one from your wallet so donors land here
                        and fund through transparent milestones.
                      </TextBody>
                      <Button as={Link} href="/campaigns/create" variant="primary" className="mt-3 w-full">
                        Create campaign
                      </Button>
                    </>
                  ) : (
                    <>
                      <TextBody className="text-sm text-[var(--ui-muted)]">
                        This organization does not have a public campaign linked yet. Browse other campaigns on Amini to
                        fund with USDC.
                      </TextBody>
                      <Button as={Link} href="/campaigns" variant="secondary" className="mt-3 w-full">
                        Explore campaigns
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <TextCaption className="mb-2 mt-5 block uppercase tracking-wider text-[var(--ui-muted)]">
                    Linked campaigns
                  </TextCaption>
                  <ul id="org-campaign-list" className="scroll-mt-28 space-y-3">
                    {campaigns.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="block rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 transition-colors hover:border-[var(--ui-brand-green)]/40"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-[var(--ui-text)]">{campaignTitle(c)}</p>
                            <span className="shrink-0 text-xs font-semibold text-[var(--ui-brand-green)]">Fund →</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-xs text-[var(--ui-muted)]">
                            {goalLabel(c.target_amount) ? (
                              <span>Goal {goalLabel(c.target_amount)}</span>
                            ) : null}
                            {c.total_raised && BigInt(c.total_raised) > 0n ? (
                              <span className="font-semibold text-[var(--ui-brand-green)]">
                                Raised {formatUsdc(BigInt(c.total_raised))} USDC
                              </span>
                            ) : null}
                            {(c.donor_count ?? 0) > 0 ? (
                              <span>{c.donor_count} donor{c.donor_count !== 1 ? "s" : ""}</span>
                            ) : null}
                          </div>
                          {c.region?.trim() || c.cause?.trim() ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {c.region?.trim() ? (
                                <span className={`${chipClass} !py-0.5 text-[10px]`}>{c.region}</span>
                              ) : null}
                              {c.cause?.trim() ? (
                                <span className={`${chipClass} !py-0.5 text-[10px]`}>{c.cause}</span>
                              ) : null}
                            </div>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {isOwner && campaigns.length > 0 ? (
                <Button as={Link} href="/campaigns/create" variant="secondary" className="mt-4 w-full">
                  Create another campaign
                </Button>
              ) : null}

              {!isOwner && campaigns.length > 0 ? (
                <Button as={Link} href="/campaigns" variant="secondary" className="mt-4 w-full">
                  Explore all campaigns
                </Button>
              ) : null}
            </div>
          </aside>
        </div>

        {message ? (
          <p
            className={`mt-6 text-sm ${message.kind === "ok" ? "text-[var(--ui-brand-green)]" : "text-red-500"}`}
            role="status"
          >
            {message.text}
          </p>
        ) : null}
      </div>

      <Modal visible={Boolean(commentsOpenFor)} onRequestClose={() => setCommentsOpenFor(null)} className="rounded-2xl overflow-hidden">
        <ModalHeader title="Comments" closeAccessibilityLabel="Close" />
        <ModalBody className="px-5 py-4 sm:px-6">
          {commentsLoading ? (
            <TextBody className="text-sm text-[var(--ui-muted)]">Loading…</TextBody>
          ) : comments.length === 0 ? (
            <TextBody className="text-sm text-[var(--ui-muted)]">No comments yet.</TextBody>
          ) : (
            <div className="space-y-3">
              {(() => {
                const roots = comments.filter((c) => !c.parent_id);
                const repliesByParent = new Map<string, OrganizationPostCommentRow[]>();
                for (const c of comments) {
                  if (!c.parent_id) continue;
                  const list = repliesByParent.get(c.parent_id) ?? [];
                  list.push(c);
                  repliesByParent.set(c.parent_id, list);
                }
                for (const list of repliesByParent.values()) {
                  list.sort((a, b) => a.created_at.localeCompare(b.created_at));
                }
                const renderComment = (c: OrganizationPostCommentRow, depth: 0 | 1) => {
                  const replies = repliesByParent.get(c.id) ?? [];
                  return (
                    <div key={c.id} className={depth === 1 ? "ml-5 border-l border-[var(--ui-border)] pl-4" : ""}>
                      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <TextCaption className="font-mono text-[10px] text-[var(--ui-muted)]">
                            {c.author_wallet.slice(0, 6)}…{c.author_wallet.slice(-4)}
                          </TextCaption>
                          <TextCaption className="text-[10px] text-[var(--ui-muted)]">
                            {new Date(c.created_at).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </TextCaption>
                        </div>
                        <TextBody className="whitespace-pre-wrap text-sm text-[var(--ui-text)]">{c.body}</TextBody>
                        <div className="mt-2 flex items-center justify-between">
                          <button
                            type="button"
                            className="text-xs font-semibold text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                            onClick={() => {
                              setReplyTo(c);
                            }}
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                      {depth === 0 && replies.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {replies.map((r) => renderComment(r, 1))}
                        </div>
                      ) : null}
                    </div>
                  );
                };
                return <div className="space-y-3">{roots.map((c) => renderComment(c, 0))}</div>;
              })()}
            </div>
          )}

          <div className="mt-4 border-t border-[var(--ui-border)] pt-4">
            <TextCaption className="mb-2 block text-[var(--ui-muted)]">Add a comment</TextCaption>
            {replyTo ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2">
                <TextCaption className="text-[var(--ui-muted)]">
                  Replying to <span className="font-mono">{replyTo.author_wallet.slice(0, 6)}…{replyTo.author_wallet.slice(-4)}</span>
                </TextCaption>
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--ui-muted)] hover:text-[var(--ui-text)]"
                  onClick={() => setReplyTo(null)}
                >
                  Cancel
                </button>
              </div>
            ) : null}
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              rows={3}
              className={`${fieldInputClass} min-h-[84px] resize-y`}
              placeholder="Write a comment…"
            />
          </div>
        </ModalBody>
        <ModalFooter
          primaryAction={
            <Button onClick={() => void submitComment()} disabled={commentPosting || !commentDraft.trim()}>
              {commentPosting ? "Posting…" : "Post comment"}
            </Button>
          }
          secondaryAction={
            <Button variant="secondary" onClick={() => setCommentsOpenFor(null)} disabled={commentPosting}>
              Close
            </Button>
          }
        />
      </Modal>
    </main>
  );
}
