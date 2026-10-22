import { notFound } from 'next/navigation';
import { groupsServerEnabled } from '@/lib/groups/config';
export const dynamic = 'force-dynamic';
export default function GroupsLayout({children}:{children:React.ReactNode}) {
  if (!groupsServerEnabled()) notFound();
  return children;
}
