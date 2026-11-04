import GroupsClient from './GroupsClient';
import CreatorVerseStagingProvider from './CreatorVerseStagingProvider';
import { creatorVerseStagingPreviewEnabled } from '@/lib/creatorverse/staging-preview';
export default function GroupsPage() {
  return (
    <CreatorVerseStagingProvider enabled={creatorVerseStagingPreviewEnabled()}>
      <GroupsClient />
    </CreatorVerseStagingProvider>
  );
}
