import type { OrganizationPublic } from "@/lib/organizationTypes";

export function organizationShareBlurb(org: Pick<OrganizationPublic, "name" | "tagline" | "description">): string {
  const tag = org.tagline?.trim();
  if (tag) return `${org.name} — ${tag}`;
  const desc = org.description?.trim();
  if (desc) {
    const oneLine = desc.replace(/\s+/g, " ");
    return oneLine.length > 160 ? `${oneLine.slice(0, 157)}…` : oneLine;
  }
  return `Support ${org.name} on Amini — transparent campaigns on Base.`;
}

export function organizationMetaDescription(org: Pick<OrganizationPublic, "name" | "tagline" | "description">): string {
  const blurb = organizationShareBlurb(org);
  return blurb.length > 200 ? `${blurb.slice(0, 197)}…` : blurb;
}

export type SocialShareUrls = {
  whatsapp: string;
  x: string;
  linkedin: string;
  facebook: string;
  telegram: string;
  email: string;
};

export function buildSocialShareUrls(pageUrl: string, blurb: string, emailSubject: string): SocialShareUrls {
  const body = `${blurb}\n\n${pageUrl}`;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(body)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(blurb)}&url=${encodeURIComponent(pageUrl)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(blurb)}`,
    email: `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`,
  };
}
