import {
  communityClientTargetAllowed,
  communityServerTargetAllowed,
  isCommunityStagingTarget,
  isCommunityLocalTarget,
  isCommunityProductionTarget
} from '@/lib/community/release-target';

export function isGroupsTestTarget(
  value: string | undefined
): boolean {
  return isCommunityStagingTarget(value) ||
    isCommunityLocalTarget(value);
}

export function groupsNavigationEnabled(): boolean {
  const production = isCommunityProductionTarget(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );

  return (
    production ||
    process.env.NEXT_PUBLIC_GROUPS_ENABLED === 'true'
  ) && communityClientTargetAllowed();
}

export function groupsServerEnabled(): boolean {
  const production = isCommunityProductionTarget(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ) && process.env.VERCEL_ENV === 'production';

  return (
    production ||
    process.env.GROUPS_ENABLED === 'true'
  ) && groupsNavigationEnabled() &&
    communityServerTargetAllowed();
}
