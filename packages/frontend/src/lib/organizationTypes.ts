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
