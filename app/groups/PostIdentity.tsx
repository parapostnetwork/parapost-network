import Link from 'next/link';
import ResponsiveMediaImage from '@/components/ResponsiveMediaImage';
import styles from './groupPosting.module.css';

export type PostProfile = { full_name: string | null; username: string | null; avatar_url: string | null };
export const profileName = (profile?: PostProfile | null) => profile?.full_name?.trim() || profile?.username?.trim() || 'Member';
export function PostAvatar({ id, profile, size = 44 }: { id: string; profile?: PostProfile | null; size?: number }) {
  const name = profileName(profile);
  return <Link href={`/profile/${id}`} className={styles.avatar} style={{ width: size, height: size }} aria-label={`${name}'s Profile`}>
    {profile?.avatar_url ? <ResponsiveMediaImage purpose="avatar" avatarSize={size} src={profile.avatar_url}
      alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : name.charAt(0).toUpperCase()}
  </Link>;
}
