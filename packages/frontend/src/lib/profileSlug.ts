/**
 * Public profile path segment: /profile/{profile_slug}
 * Lowercase letters, digits, hyphens; 3–32 chars; not a reserved app path.
 */

const RESERVED = new Set([
  "api",
  "admin",
  "campaigns",
  "create",
  "dashboard",
  "debug",
  "donor",
  "explorer",
  "messages",
  "organizations",
  "profile",
  "register",
  "settings",
  "start",
  "u",
  "wallet",
  "_next",
  "favicon",
  "robots",
  "sitemap",
]);

export function normalizeProfileSlugInput(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidProfileSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (s.length < 3 || s.length > 32) return false;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)) return false;
  if (RESERVED.has(s)) return false;
  if (s.includes("--")) return false;
  return true;
}

export function describeProfileSlugRules(): string {
  return "3–32 characters: lowercase letters, numbers, and single hyphens (not at the start or end).";
}
