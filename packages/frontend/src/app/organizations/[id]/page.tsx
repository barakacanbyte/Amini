import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProfileAvatarUrl } from "@/lib/ipfsGatewayUrl";
import { loadOrganizationById, loadOrganizationPublicPage } from "@/lib/loadOrganizationPublic";
import { organizationMetaDescription } from "@/lib/organizationShareLinks";
import { getSiteBaseUrl } from "@/lib/siteBaseUrl";
import { OrganizationProfileClient } from "./OrganizationProfileClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const org = await loadOrganizationById(id);
  if (!org) {
    return { title: "Organization · Amini" };
  }

  const baseUrl = await getSiteBaseUrl();
  const pageUrl = `${baseUrl}/organizations/${id}`;
  const title = `${org.name} · Amini`;
  const description = organizationMetaDescription(org);

  const cover = resolveProfileAvatarUrl(org.cover_image_url);
  const logo = resolveProfileAvatarUrl(org.logo_url);
  const coverOk = Boolean(cover?.startsWith("http"));
  const logoOk = Boolean(logo?.startsWith("http"));
  const ogImageUrl = coverOk ? cover! : logoOk ? logo! : `${baseUrl}/logo.png`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Amini",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          alt: org.name,
          ...(coverOk ? { width: 1200, height: 630 } : {}),
        },
      ],
    },
    twitter: {
      card: coverOk ? "summary_large_image" : "summary",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function OrganizationPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadOrganizationPublicPage(id);
  if (!data) notFound();

  const baseUrl = await getSiteBaseUrl();
  const pageUrl = `${baseUrl}/organizations/${id}`;
  const cover = resolveProfileAvatarUrl(data.organization.cover_image_url);
  const logo = resolveProfileAvatarUrl(data.organization.logo_url);
  const imageForSchema = (cover?.startsWith("http") ? cover : logo?.startsWith("http") ? logo : `${baseUrl}/logo.png`) as string;

  const sameAs: string[] = [];
  const w = data.organization.website_url?.trim();
  if (w) {
    sameAs.push(w.startsWith("http") ? w : `https://${w}`);
  }
  const li = data.organization.linkedin_url?.trim();
  if (li) sameAs.push(li.startsWith("http") ? li : `https://${li}`);
  const tw = data.organization.twitter_handle?.trim();
  if (tw) {
    const h = tw.replace(/^@/, "");
    sameAs.push(`https://twitter.com/${h}`);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: data.organization.name,
    url: pageUrl,
    description: organizationMetaDescription(data.organization),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    logo: imageForSchema,
    image: imageForSchema,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- JSON-LD for crawlers
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <OrganizationProfileClient
        orgId={id}
        initialOrganization={data.organization}
        initialCampaigns={data.campaigns}
      />
    </>
  );
}
