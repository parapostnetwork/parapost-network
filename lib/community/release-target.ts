const STAGING = 'vmgelrgrtpghmvqgufzz';
const PRODUCTION = 'luzesphgdqazqhmqlniy';

function project(value: string | undefined, id: string): boolean {
  try {
    const u = new URL(value ?? '');
    return u.protocol === 'https:' &&
      u.hostname === `${id}.supabase.co` &&
      !u.port && !u.username && !u.password &&
      !u.search && !u.hash && u.pathname === '/';
  } catch {
    return false;
  }
}

export const isCommunityStagingTarget =
  (value: string | undefined) => project(value, STAGING);

export const isCommunityProductionTarget =
  (value: string | undefined) => project(value, PRODUCTION);

export function isCommunityLocalTarget(
  value: string | undefined
): boolean {
  try {
    const u = new URL(value ?? '');
    return u.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      !u.username && !u.password &&
      !u.search && !u.hash && u.pathname === '/';
  } catch {
    return false;
  }
}

export function communityClientTargetAllowed(
  value: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): boolean {
  if (isCommunityStagingTarget(value)) return true;
  if (
    process.env.NODE_ENV === 'development' &&
    isCommunityLocalTarget(value)
  ) return true;

  return isCommunityProductionTarget(value) &&
    process.env.NEXT_PUBLIC_COMMUNITY_PRODUCTION_ENABLED === 'true';
}

export function communityServerTargetAllowed(
  value: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): boolean {
  if (isCommunityStagingTarget(value)) {
    return (
      process.env.VERCEL_ENV === 'preview' &&
      process.env.VERCEL_GIT_COMMIT_REF === 'staging'
    ) || (
      process.env.NODE_ENV === 'development' &&
      process.env.VERCEL_ENV === undefined
    );
  }

  if (isCommunityLocalTarget(value)) {
    return process.env.NODE_ENV === 'development' &&
      process.env.VERCEL_ENV === undefined;
  }

  return isCommunityProductionTarget(value) &&
    process.env.VERCEL_ENV === 'production' &&
    process.env.NEXT_PUBLIC_COMMUNITY_PRODUCTION_ENABLED === 'true' &&
    process.env.COMMUNITY_PRODUCTION_RELEASE_APPROVED === 'true';
}

export function communityStorageNamespace(): string {
  return isCommunityProductionTarget(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ) ? PRODUCTION : STAGING;
}
