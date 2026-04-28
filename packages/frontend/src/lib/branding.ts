/**
 * Public app logo (`public/logo.png`). Use absolute URL in CDP / iframes.
 * Falls back to production URL if NEXT_PUBLIC_SITE_URL is not set.
 */
export function getPublicLogoUrl(): string {
  const envBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const base = envBase || "https://amini-project.vercel.app";
  return `${base}/logo.png`;
}
