'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { GroupMember } from '@/lib/groups/types';
import styles from './groupMembers.module.css';

type MemberAction =
  | 'approve'
  | 'reject'
  | 'remove'
  | 'ban'
  | 'restore'
  | 'role';

type AssignableRole = 'member' | 'moderator' | 'admin';

type Props = {
  members: GroupMember[];
  viewerId: string;
  owner: boolean;
  busy: boolean;
  loading: boolean;
  memberOffset: number;
  onOffsetChange: (offset: number) => void;
  onAction: (
    action: MemberAction,
    member: GroupMember,
    role?: AssignableRole
  ) => void;
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function roleLabel(role: string) {
  return role === 'admin' ? 'Administrator' : titleCase(role);
}

export default function GroupMembersPanel({
  members,
  viewerId,
  owner,
  busy,
  loading,
  memberOffset,
  onOffsetChange,
  onAction
}: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const activeMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuAbove, setMenuAbove] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!openMenu) return;

    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !activeMenuRef.current?.contains(event.target)
      ) {
        setOpenMenu(null);
      }
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);

    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [openMenu]);

  useEffect(() => {
    setOpenMenu(null);
  }, [members]);

  // Reposition the menu before the browser paints it.
  useLayoutEffect(() => {
    if (!openMenu) return;

    const updatePosition = () => {
      const anchor = activeMenuRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;

      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      const bottom = top + height;
      const rect = anchor.getBoundingClientRect();

      const roomAbove = Math.max(0, rect.top - top - 12);
      const roomBelow = Math.max(0, bottom - rect.bottom - 12);
      const desired = Math.min(
        menu.scrollHeight,
        440,
        height * 0.7
      );

      const above = roomBelow < desired && roomAbove > roomBelow;
      const available = above ? roomAbove : roomBelow;

      setMenuAbove(above);
      setMenuMaxHeight(
        Math.max(0, Math.floor(Math.min(available, 440, height * 0.7)))
      );
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [openMenu]);

  const act = (
    action: MemberAction,
    member: GroupMember,
    role?: AssignableRole
  ) => {
    setOpenMenu(null);
    onAction(action, member, role);
  };

  const confirmAction = (
    action: MemberAction,
    member: GroupMember,
    message: string
  ) => {
    if (window.confirm(message)) act(action, member);
  };

  return (
    <section
      className={styles.panel}
      id="group-panel-members"
      role="tabpanel"
      aria-labelledby="group-tab-members"
      tabIndex={0}
    >
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>GROUP COMMUNITY</p>
          <h2>Group Members</h2>
          <p className={styles.subtitle}>
            View members and manage Group access.
          </p>
        </div>
        <span className={styles.count}>
          {loading ? 'Loading…' : `${members.length} on this page`}
        </span>
      </header>

      <div className={styles.list} aria-busy={loading}>
        {!loading && members.map(member => {
          const name = member.display_name?.trim() || 'Member';
          const initials = name
            .split(/\s+/)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join('');

          const canManage =
            member.user_id !== viewerId &&
            member.role !== 'owner' &&
            (owner || member.role === 'member');

          const hasActions =
            canManage && (member.status !== 'banned' || owner);

          const menuOpen = openMenu === member.user_id;

          return (
            <article className={styles.person} key={member.user_id}>
              <Link
                href={`/profile/${member.user_id}`}
                className={styles.avatar}
                aria-label={`View ${name}'s profile`}
              >
                {initials || 'M'}
              </Link>

              <div className={styles.identity}>
                <Link
                  className={styles.name}
                  href={`/profile/${member.user_id}`}
                >
                  {name}
                </Link>
                <span className={styles.memberDescription}>
                  {member.status === 'approved'
                    ? 'Active member'
                    : titleCase(member.status)}
                </span>
              </div>

              <div className={styles.badges}>
                <span
                  className={`${styles.roleBadge} ${
                    member.role === 'owner' ? styles.ownerBadge : ''
                  }`}
                >
                  {roleLabel(member.role)}
                </span>

                {member.status !== 'approved' && (
                  <span className={styles.statusBadge}>
                    {titleCase(member.status)}
                  </span>
                )}
              </div>

              {hasActions && (
                <div
                  className={styles.actionArea}
                  ref={menuOpen ? activeMenuRef : null}
                >
                  <button
                    type="button"
                    className={styles.moreButton}
                    disabled={busy}
                    aria-label={`Manage ${name}`}
                    aria-expanded={menuOpen}
                    aria-controls={`member-actions-${member.user_id}`}
                    onClick={() => {
                      setMenuAbove(false);
                      setMenuMaxHeight(null);
                      setOpenMenu(menuOpen ? null : member.user_id);
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>

                  {menuOpen && (
                    <div
                      ref={menuRef}
                      className={`${styles.menu} ${menuAbove ? styles.menuAbove : ''}`}
                      id={`member-actions-${member.user_id}`}
                      style={menuMaxHeight === null
                        ? undefined
                        : { maxHeight: `${menuMaxHeight}px` }}
                    >
                      <p className={styles.menuTitle}>
                        Manage {name}
                      </p>

                      {member.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act('approve', member)}
                          >
                            Approve request
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => confirmAction(
                              'reject',
                              member,
                              `Reject ${name}'s membership request?`
                            )}
                          >
                            Reject request
                          </button>
                        </>
                      )}

                      {owner && member.status === 'approved' && (
                        <label className={styles.roleControl}>
                          Change role
                          <select
                            value={member.role}
                            disabled={busy}
                            onChange={event => act(
                              'role',
                              member,
                              event.target.value as AssignableRole
                            )}
                          >
                            <option value="member">Member</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Administrator</option>
                          </select>
                        </label>
                      )}

                      {member.status === 'approved' && (
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => confirmAction(
                            'remove',
                            member,
                            `Remove ${name} from this Group?`
                          )}
                        >
                          Remove member
                        </button>
                      )}

                      {member.status !== 'banned' && (
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => confirmAction(
                            'ban',
                            member,
                            `Ban ${name} from this Group?`
                          )}
                        >
                          Ban member
                        </button>
                      )}

                      {owner &&
                        ['rejected', 'removed', 'banned'].includes(
                          member.status
                        ) && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act('restore', member)}
                          >
                            Restore to pending
                          </button>
                        )}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {loading && (
          <p className={styles.empty} role="status">
            Loading Group members…
          </p>
        )}

        {!loading && members.length === 0 && (
          <p className={styles.empty}>
            No members on this page.
          </p>
        )}
      </div>

      <footer className={styles.footer}>
        {memberOffset > 0 && (
          <button
            type="button"
            disabled={loading}
            onClick={() => onOffsetChange(
              Math.max(0, memberOffset - 50)
            )}
          >
            Previous members
          </button>
        )}

        {members.length === 50 && (
          <button
            type="button"
            disabled={loading}
            onClick={() => onOffsetChange(memberOffset + 50)}
          >
            More members
          </button>
        )}
      </footer>

      <p className={styles.help}>
        Only the Group owner can assign roles or restore removed,
        rejected or banned memberships.
      </p>
    </section>
  );
}
