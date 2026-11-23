import {
  communityServerTargetAllowed,
  isCommunityStagingTarget,
  isCommunityLocalTarget,
  isCommunityProductionTarget
} from '@/lib/community/release-target';

export function isCreatorVerseTarget(
  value: string | undefined
): boolean {
  return isCommunityStagingTarget(value) ||
    isCommunityLocalTarget(value);
}

export function creatorVerseEnabled(): boolean {
  const target = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const staging = isCommunityStagingTarget(target) &&
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'staging';

  const local = isCreatorVerseTarget(target) &&
    process.env.NODE_ENV === 'development' &&
    process.env.CREATORVERSE_ENABLED === 'true';

  const production = isCommunityProductionTarget(target) &&
    communityServerTargetAllowed(target);

  return staging || local || production;
}
