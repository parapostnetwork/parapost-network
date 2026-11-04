import type { DiscoveryPage } from '@/lib/creatorverse/discovery';
/** Fictional public-page samples, development-only routes. Never loaded by hosted discovery. */
export const CREATORVERSE_SAMPLES: DiscoveryPage[] = [
  ['81000000-0000-4000-8000-000000000001', 'The Creator Studio', 'creator', 'Original videos, creative projects and stories.', 'Behind the scenes of independent filmmaking and visual storytelling.', 'Maya Rivers'],
  ['81000000-0000-4000-8000-000000000002', 'Beyond the Mic', 'podcast', 'Conversations, episodes and community updates.', 'Listen to thoughtful conversations about unexplained experiences and local history.', 'Alex Morgan'],
  ['81000000-0000-4000-8000-000000000003', 'Community Spotlight', 'community_project', 'A dedicated space for a growing audience.', 'Meet the volunteers documenting and preserving stories from their communities.', 'Community Spotlight Team'],
].map(([id, name, category, short_bio, description, creator]) => ({
  page: { id, name, category: category as DiscoveryPage['page']['category'], short_bio, description, website: null, social_links: [], public_email: null, location: '', created_at: '2026-11-03T12:00:00Z' },
  creator: { name: creator, profileId: null, canViewProfile: false }, sample: true,
}));
