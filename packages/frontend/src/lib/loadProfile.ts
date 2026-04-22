import { resolveProfileAvatarUrl } from "@/lib/ipfsGatewayUrl";
import { isValidProfileSlug, normalizeProfileSlugInput } from "@/lib/profileSlug";
import { normalizeProfileWallet } from "@/lib/profileWallet";
import { getSupabaseServiceConfig, supabaseServiceHeaders } from "@/lib/supabaseService";

export { normalizeProfileWallet } from "@/lib/profileWallet";

export type LoadedProfile = {
  wallet: string;
  roles: string[] | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  profile_slug: string | null;
  x_url: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  created_at: string | null;
  updated_at: string | null;
} | null;

type ProfileRow = Exclude<LoadedProfile, null>;

const SELECT =
  "wallet,roles,name,email,avatar_url,headline,bio,location,profile_slug,x_url,linkedin_url,instagram_url,created_at,updated_at";

function mapRow(row: ProfileRow): LoadedProfile {
  return {
    ...row,
    avatar_url: resolveProfileAvatarUrl(row.avatar_url),
  };
}

export async function loadProfileByWallet(rawWallet: string): Promise<LoadedProfile> {
  const wallet = normalizeProfileWallet(rawWallet);
  if (!wallet) return null;

  const cfg = getSupabaseServiceConfig();
  if (!cfg) return null;

  const res = await fetch(
    `${cfg.supabaseUrl}/rest/v1/profiles?wallet=eq.${encodeURIComponent(wallet)}&select=${SELECT}&limit=1`,
    { headers: supabaseServiceHeaders(cfg.serviceRole), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as ProfileRow[];
  const row = rows[0];
  if (!row) return null;
  return mapRow(row);
}

export async function loadProfileBySlug(rawSlug: string): Promise<LoadedProfile> {
  const slug = normalizeProfileSlugInput(rawSlug);
  if (!isValidProfileSlug(slug)) return null;

  const cfg = getSupabaseServiceConfig();
  if (!cfg) return null;

  const res = await fetch(
    `${cfg.supabaseUrl}/rest/v1/profiles?profile_slug=eq.${encodeURIComponent(slug)}&select=${SELECT}&limit=1`,
    { headers: supabaseServiceHeaders(cfg.serviceRole), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as ProfileRow[];
  const row = rows[0];
  if (!row) return null;
  return mapRow(row);
}

export type LoadProfilePageResult = {
  profile: NonNullable<LoadedProfile>;
  wallet: string;
  matchedBy: "wallet" | "slug";
};

/** When a wallet has no `profiles` row yet, still render `/profile/0x…` so the owner can save (PATCH upserts). */
export function defaultProfileForWallet(wallet: string): NonNullable<LoadedProfile> {
  return {
    wallet,
    roles: ["guest"],
    name: null,
    email: null,
    avatar_url: null,
    headline: null,
    bio: null,
    location: null,
    profile_slug: null,
    x_url: null,
    linkedin_url: null,
    instagram_url: null,
    created_at: null,
    updated_at: null,
  };
}

/**
 * Resolve `/profile/[handle]` where handle is either a checksummed/lowercase wallet or a public profile_slug.
 */
export async function loadProfileForPage(rawHandle: string): Promise<LoadProfilePageResult | null> {
  const decoded = decodeURIComponent(rawHandle.trim());
  const asWallet = normalizeProfileWallet(decoded);
  if (asWallet) {
    const profile = await loadProfileByWallet(asWallet);
    if (profile) return { profile, wallet: profile.wallet, matchedBy: "wallet" };
    return { profile: defaultProfileForWallet(asWallet), wallet: asWallet, matchedBy: "wallet" };
  }
  const profile = await loadProfileBySlug(decoded);
  if (!profile) return null;
  return { profile, wallet: profile.wallet, matchedBy: "slug" };
}
