/** Self-reported work done before or outside Amini (stored as JSON on the org row). */
export type OrgPriorProject = {
  title: string;
  summary?: string;
  year?: string;
  link_url?: string;
};

export type OrganizationPublic = {
  id: string;
  wallet: string;
  name: string;
  description: string | null;
  website_url: string | null;
  country: string | null;
  status: string;
  verified_at: string | null;
  official_email: string | null;
  twitter_handle: string | null;
  linkedin_url: string | null;
  ens_name: string | null;
  has_coinbase_verification: boolean | null;
  logo_url: string | null;
  cover_image_url: string | null;
  tagline: string | null;
  /** Parsed from `prior_projects` jsonb; may be absent on older rows. */
  prior_projects?: OrgPriorProject[] | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OrgCampaignRow = {
  id: number;
  title: string | null;
  description: string | null;
  image_url: string | null;
  status: string | null;
  /** Supabase `numeric` is often JSON-deserialized as a number. */
  target_amount: string | number | null;
  region: string | null;
  cause: string | null;
  /** Aggregate from escrow_deposits — set by loadOrganizationPublic. */
  total_raised?: string | null;
  /** Distinct depositor count — set by loadOrganizationPublic. */
  donor_count?: number | null;
};

/** A single entry in the public donor list for a campaign / milestone. */
export type DonorListItem = {
  tx_hash: string;
  amount: string;
  milestone_index: number | null;
  created_at: string;
  is_anonymous: boolean;
  display_name: string | null;
  avatar_url: string | null;
  donor_message: string | null;
};

export type OrganizationPostRow = {
  id: string;
  organization_id: string;
  author_wallet: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationPostMediaRow = {
  id: string;
  post_id: string;
  cid: string | null;
  url: string | null;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
};

export type OrganizationPostEngagement = {
  like_count: number;
  comment_count: number;
  share_count: number;
  liked_by_viewer: boolean;
};

export type OrganizationPostWithExtras = OrganizationPostRow & {
  media: OrganizationPostMediaRow[];
  engagement: OrganizationPostEngagement;
};

export type OrganizationPostCommentRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_wallet: string;
  body: string;
  created_at: string;
  updated_at: string;
};
