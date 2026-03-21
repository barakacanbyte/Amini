/**
 * Public app logo (`public/logo.png`). Use absolute URL in CDP / iframes when
 * `NEXT_PUBLIC_SITE_URL` is set (e.g. `https://your-domain.com`).
 */
export function getPublicLogoUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (base) return `${base}/logo.png`;
  return "/logo.png";
}
