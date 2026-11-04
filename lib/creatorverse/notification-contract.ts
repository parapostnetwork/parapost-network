import 'server-only';
import { pageId } from './validation';
/** Adapter plan for the EXISTING notifications table/webhook. Never accepted from a client.
 * A future trusted transactional event source supplies committed identities and visibility.
 * No sender, database insert, push request or new notification subsystem is installed.
 */
export type CreatorVerseNotificationEvent = {
  eventId: string; kind: 'like' | 'unlike' | 'comment' | 'reply' | 'share';
  pageId: string; postId: string; actorId: string; pageOwnerId: string;
  parentAuthorId?: string; recipientCanRead: Readonly<Record<string, boolean>>;
};
export function planCreatorVerseNotifications(event: CreatorVerseNotificationEvent) {
  for (const id of [event.eventId, event.pageId, event.postId, event.actorId, event.pageOwnerId, ...(event.parentAuthorId ? [event.parentAuthorId] : [])]) pageId(id);
  const recipients = [...new Set([event.pageOwnerId, ...(event.kind === 'reply' && event.parentAuthorId ? [event.parentAuthorId] : [])])];
  return recipients.filter(id => id !== event.actorId && (event.kind === 'unlike' || event.recipientCanRead[id] === true)).map(userId => ({
    user_id: userId, actor_id: event.actorId,
    type: `creatorverse_${event.kind === 'unlike' ? 'like' : event.kind}`,
    operation: event.kind === 'unlike' ? 'remove' as const : 'upsert' as const,
    // Like lifecycle is unique by actor/post/recipient; retry events use one stable event ID.
    deduplicationKey: `creatorverse:${event.kind === 'like' || event.kind === 'unlike' ? `like:${event.postId}:${event.actorId}` : `${event.kind}:${event.eventId}`}:${userId}`,
    target: { kind: 'creatorverse' as const, pageId: event.pageId, postId: event.postId, href: `/creatorverse/${event.pageId}` },
    dispatchEnabled: false as const,
  }));
}
