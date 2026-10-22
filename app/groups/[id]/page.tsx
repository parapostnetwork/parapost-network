import { notFound } from 'next/navigation';
import { UUID } from '@/lib/groups/validation';
import GroupsClient from '../GroupsClient';
export default async function GroupPage({params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  if (!UUID.test(id)) notFound();
  return <GroupsClient groupId={id} />;
}
