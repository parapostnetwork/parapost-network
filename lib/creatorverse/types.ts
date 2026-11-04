export const CREATORVERSE_CATEGORIES = {
  business: 'Business',
  creator: 'Content Creator',
  investigation_team: 'Paranormal Investigation Team',
  podcast: 'Podcast',
  entertainment: 'Entertainment',
  organization: 'Organization',
  community_project: 'Community Project',
  other: 'Other',
} as const;
export type CreatorVerseCategory = keyof typeof CREATORVERSE_CATEGORIES;
export type PageStatus = 'draft' | 'active' | 'suspended' | 'deleted';
export type PublicLink = { label: string; url: string };
export type PageFields = {
  name: string;
  category: CreatorVerseCategory;
  short_bio: string;
  description: string;
  website: string | null;
  social_links: PublicLink[];
  public_email: string | null;
  location: string;
};
/** Deliberately excludes owner identity, account email, moderation and storage internals. */
export type PublicPage = PageFields & { id: string; created_at: string };
export type PageOwnership = { id: string; owner_id: string; status: PageStatus };
export type PagePermissions = { can_manage: boolean; can_publish: boolean };
export type CreatorVersePost = {
  id: string; page_id: string; content: string; created_at: string;
  comments_enabled: boolean;
};
/** Future uploads remain reserved/unpublished until a trusted verifier approves the object. */
export type CreatorVerseMedia = {
  id: string; page_id: string; post_id: string | null;
  purpose: 'logo' | 'cover' | 'post'; media_type: 'image' | 'video';
  storage_path: string; verification: 'pending' | 'verified' | 'rejected';
  byte_size: number | null; duration_seconds: number | null; display_order: number;
};
export type CreatorVerseComment = {
  id: string; post_id: string; author_id: string; parent_id: string | null;
  content: string; created_at: string;
};
export type PageResult = { page: PublicPage; posts: CreatorVersePost[] };
export type DirectoryResult = { pages: PublicPage[]; nextOffset: number | null };
