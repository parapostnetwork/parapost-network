import {
  communityClientTargetAllowed,
  communityServerTargetAllowed,
  isCommunityStagingTarget,
  isCommunityLocalTarget
} from '@/lib/community/release-target';

export function isGroupsTestTarget(
  value: string | undefined
): boolean {
  return isCommunityStagingTarget(value) ||
    isCommunityLocalTarget(value);
}

export function groupsNavigationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GROUPS_ENABLED === 'true' &&
    communityClientTargetAllowed();
}

export function groupsServerEnabled(): boolean {
  return process.env.GROUPS_ENABLED === 'true' &&
    groupsNavigationEnabled() &&
    communityServerTargetAllowed();
}
