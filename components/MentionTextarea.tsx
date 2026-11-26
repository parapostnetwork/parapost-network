'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, Ref, TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { activeMentionAtCursor } from '@/lib/mentions/parse';
import { lookupMentionOptions, type MentionContext, type MentionOption } from '@/lib/mentionLookup';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  mentionContext?: MentionContext;
  mentionsDisabled?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
};
const defaultContext: MentionContext = { surface: 'post' };

/** Keeps the native textarea in its original layout; the popup escapes overlay clipping. */
export default function MentionTextarea({ mentionContext = defaultContext, mentionsDisabled = false, ref, ...props }: Props) {
  const input = useRef<HTMLTextAreaElement | null>(null);
  const composing = useRef(false);
  const listId = useId();
  const [active, setActive] = useState<ReturnType<typeof activeMentionAtCursor>>(null);
  const [position, setPosition] = useState<{ left: number; bottom?: number; top?: number; width: number; maxHeight?: number }>({ left: 0, top: 0, width: 0 });
  const [results, setResults] = useState<{ key: string; options: MentionOption[] }>({ key: '', options: [] });
  const [selected, setSelected] = useState(0);
  const enabled = !mentionsDisabled && !props.disabled && !props.readOnly;
  const { surface, containerId, postId, shareId } = mentionContext;
  const query = enabled ? active?.query ?? '' : '';
  const key = JSON.stringify([query, surface, containerId, postId, shareId]);
  const options = query && results.key === key ? results.options : [];
  const open = options.length > 0;

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void lookupMentionOptions(query, { surface, containerId, postId, shareId })
        .then(options => {
          if (!cancelled) { setResults({ key, options }); setSelected(0); }
        }).catch(() => { if (!cancelled) setResults({ key, options: [] }); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, key, surface, containerId, postId, shareId]);

  useEffect(() => {
    if (!active) return;
    const close = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-mention-options]')) return;
      const textarea = input.current;
      const mobile = window.matchMedia('(hover: none), (max-width: 900px)').matches;

      if (mobile && textarea && document.activeElement === textarea) {
        updatePosition(textarea);
        return;
      }

      setActive(null);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.visualViewport?.addEventListener('resize', close);
    window.visualViewport?.addEventListener('scroll', close);

    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.visualViewport?.removeEventListener('resize', close);
      window.visualViewport?.removeEventListener('scroll', close);
    };
  }, [active]);

  function update(textarea: HTMLTextAreaElement) {
    if (!enabled || textarea.selectionStart !== textarea.selectionEnd) { setActive(null); return; }
    setActive(activeMentionAtCursor(textarea.value, textarea.selectionStart));
    updatePosition(textarea);
  }

  function updatePosition(textarea: HTMLTextAreaElement) {
    const rect = textarea.getBoundingClientRect();
    const mobile = window.matchMedia('(hover: none), (max-width: 900px)').matches;

    if (mobile) {
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const left = viewport?.offsetLeft ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const popupWidth = Math.min(Math.max(rect.width, 240), width - 16);
      const above = rect.top - top - 12;
      const below = bottom - rect.bottom - 12;
      const placeAbove = above >= below;
      const maxHeight = Math.max(44, Math.min(220, placeAbove ? above : below));

      setPosition({
        left: Math.max(left + 8, Math.min(rect.left, left + width - popupWidth - 8)),
        width: popupWidth,
        maxHeight,
        ...(placeAbove
          ? { bottom: window.innerHeight - Math.max(top + maxHeight + 8, rect.top - 4) }
          : { top: Math.min(rect.bottom + 4, bottom - maxHeight - 8) })
      });
      return;
    }

    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)),
      ...(rect.top >= 240 ? { bottom: Math.max(8, window.innerHeight - rect.top + 4) } : { top: rect.bottom + 4 }), width: Math.min(Math.max(rect.width, 240), window.innerWidth - 16) });
  }

  function choose(option: MentionOption) {
    const textarea = input.current;
    if (!textarea || !active || !enabled) return;
    const token = activeMentionAtCursor(textarea.value, textarea.selectionStart);
    if (!token || token.start !== active.start || token.query !== active.query) return;
    const value = textarea.value.slice(0, token.start) + '@' + option.username + ' ' + textarea.value.slice(token.end);
    if (props.maxLength != null && value.length > props.maxLength) return;
    textarea.value = value;
    props.onChange?.({ target: textarea, currentTarget: textarea } as ChangeEvent<HTMLTextAreaElement>);
    setActive(null);
    setResults({ key: '', options: [] });
    textarea.focus();
    const cursor = token.start + option.username.length + 2;
    requestAnimationFrame(() => textarea.setSelectionRange(cursor, cursor));
  }

  return <>
    <textarea {...props} ref={node => {
      input.current = node;
      if (typeof ref === 'function') return ref(node);
      if (ref) ref.current = node;
    }}
      aria-autocomplete="list" aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? `${listId}-${selected}` : undefined}
      onChange={event => { props.onChange?.(event); update(event.currentTarget); }}
      onSelect={event => { props.onSelect?.(event); update(event.currentTarget); }}
      onClick={event => { props.onClick?.(event); update(event.currentTarget); }}
      onBlur={event => { setActive(null); setResults({ key: '', options: [] }); props.onBlur?.(event); }}
      onCompositionStart={event => { composing.current = true; props.onCompositionStart?.(event); }}
      onCompositionEnd={event => { composing.current = false; props.onCompositionEnd?.(event); update(event.currentTarget); }}
      onKeyDown={event => {
        if (!event.nativeEvent.isComposing && !composing.current && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (active && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setActive(null); return; }
          if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault(); event.stopPropagation(); setSelected(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length); return;
          }
          if (open && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); choose(options[selected] ?? options[0]); return; }
        }
        props.onKeyDown?.(event);
      }} />
    {open && createPortal(<div id={listId} role="listbox" aria-label="Mention a Parapost member" data-mention-options
      style={{ position: 'fixed', zIndex: 2147483647, maxHeight: 220, boxSizing: 'border-box', ...position, overflowY: 'auto',
        padding: 6, borderRadius: 12, border: '1px solid #555', background: '#20222b', color: '#fff', boxShadow: '0 8px 24px #0006' }}>
      {options.map((option, index) => <button id={`${listId}-${index}`} key={option.id} type="button" role="option"
        tabIndex={-1} aria-selected={selected === index} onPointerDown={event => event.preventDefault()}
        onClick={() => choose(option)} style={{ display: 'block', width: '100%', border: 0, borderRadius: 8,
          padding: '10px 12px', textAlign: 'left', color: 'inherit', cursor: 'pointer', background: selected === index ? '#ffffff22' : 'transparent' }}>
        @{option.username}
      </button>)}
    </div>, document.body)}
  </>;
}
