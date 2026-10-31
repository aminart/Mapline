// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from 'react';
import { useT } from '../store';
import { MAX_TAG_LENGTH } from '../model/ops';
import { TAG_PALETTE, tagColor } from '../model/theme';
import { CloseIcon, NoteIcon, PlusIcon } from './Icons';
import { cls } from './cls';

/**
 * A note kept off the board: a small marker on the card, the text in a
 * bubble. `onChange` is told when the change comes from typing (`live`), to
 * merge keystrokes into one undo step.
 */
export function NoteButton({ note, onChange }: { note: string; onChange: (note: string, live: boolean) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const has = note.trim().length > 0;
  return (
    <div ref={ref} className={cls('note no-export', has && 'has-note', open && 'is-open')}>
      <button
        className="note-btn"
        aria-label={has ? t('note.edit', { note }) : t('note.add')}
        title={has ? t('note.edit', { note }) : t('note.add')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <NoteIcon size={12} />
      </button>
      {open && (
        <div className="note-panel" role="dialog" aria-label={t('note.title')}>
          <div className="note-head">
            <span>{t('note.title')}</span>
            <button className="icon-btn" aria-label={t('note.close')} onClick={() => setOpen(false)}>
              <CloseIcon size={12} />
            </button>
          </div>
          <textarea
            autoFocus
            rows={5}
            value={note}
            placeholder={t('note.placeholder')}
            onChange={(e) => onChange(e.target.value, true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          />
          {has && (
            <button
              className="text-btn"
              onClick={() => {
                onChange('', false);
                setOpen(false);
              }}
            >
              {t('note.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A card's tags, with an input to add one; suggestions come from the datalist `listId`. Clicking a tag edits its name and colour. */
export function TagRow(props: {
  tags: string[];
  colors: Record<string, number> | undefined;
  listId: string;
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  /** Renames a tag on this card, or on every card of the document. */
  onRename: (from: string, to: string, everywhere: boolean) => void;
  onColor: (tag: string, color: number) => void;
  /** How many cards of the document carry the tag. */
  uses: (tag: string) => number;
}) {
  const t = useT();
  const { tags, colors, listId, onAdd, onRemove } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const commit = (keepOpen: boolean) => {
    if (draft?.trim()) onAdd(draft);
    setDraft(keepOpen ? '' : null);
  };

  if (tags.length === 0 && draft === null) {
    return (
      <div className="tags tags-empty no-export">
        <button className="tag-add" aria-label={t('board.addTagLabel')} onClick={() => setDraft('')}>
          <PlusIcon size={10} /> {t('board.addTag')}
        </button>
      </div>
    );
  }
  return (
    <div className="tags">
      {tags.map((tag) => {
        const c = tagColor(tag, colors);
        return (
          <span key={tag} className="tag tag-pickable" style={{ background: c.bg, color: c.fg }}>
            <button className="tag-name" aria-label={t('tags.edit', { tag })} title={t('tags.edit', { tag })} aria-expanded={editing === tag} onClick={() => setEditing(tag)}>
              {tag}
            </button>
            <button className="tag-x no-export" aria-label={t('board.removeTag', { tag })} onClick={() => onRemove(tag)}>
              <CloseIcon size={9} />
            </button>
            {editing === tag && <TagEditor tag={tag} {...props} onClose={() => setEditing(null)} />}
          </span>
        );
      })}
      {draft === null ? (
        <button className="tag-add tag-add-icon no-export" aria-label={t('board.addTagLabel')} title={t('board.addTagLabel')} onClick={() => setDraft('')}>
          <PlusIcon size={10} />
        </button>
      ) : (
        <input
          className="tag-input no-export"
          list={listId}
          autoFocus
          maxLength={MAX_TAG_LENGTH}
          aria-label={t('board.addTagLabel')}
          placeholder={t('board.tagPlaceholder')}
          value={draft}
          size={Math.max(8, draft.length + 1)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(true);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setDraft(null);
            } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
              onRemove(tags[tags.length - 1]);
            }
          }}
          onBlur={() => commit(false)}
        />
      )}
    </div>
  );
}

/** A tag's name and colour, edited from the card: renamed on this card or on all of them. */
export function TagEditor(props: {
  tag: string;
  colors: Record<string, number> | undefined;
  onRename: (from: string, to: string, everywhere: boolean) => void;
  onColor: (tag: string, color: number) => void;
  uses: (tag: string) => number;
  onClose: () => void;
}) {
  const t = useT();
  const { tag, colors, onRename, onColor, uses, onClose } = props;
  const [name, setName] = useState(tag);
  const count = uses(tag);
  const [everywhere, setEverywhere] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const c = tagColor(tag, colors);
  // Latest values, for the outside click that closes the editor.
  const latest = useRef({ name, everywhere });
  latest.current = { name, everywhere };

  const done = () => {
    const { name: next, everywhere: all } = latest.current;
    if (next.trim() && next.trim() !== tag) onRename(tag, next, all && count > 1);
    onClose();
  };
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) done();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  return (
    <div
      ref={ref}
      className="tag-editor no-export"
      role="dialog"
      aria-label={t('tags.edit', { tag })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          done();
        }
      }}
    >
      <input
        className="text-field"
        autoFocus
        aria-label={t('tags.name')}
        maxLength={MAX_TAG_LENGTH}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            done();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      />
      {count > 1 && (
        <label className="tag-editor-all">
          <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} />
          {t('tags.everywhere', { n: count })}
        </label>
      )}
      <span className="tag-colors" role="group" aria-label={t('tags.color', { tag })}>
        {TAG_PALETTE.map((p, i) => (
          <button
            key={i}
            className={cls('swatch swatch-xs', p.bg === c.bg && 'is-on')}
            style={{ background: p.bg, borderColor: p.fg }}
            aria-label={`${t('tags.color', { tag })} ${i + 1}`}
            onClick={() => onColor(tag, i)}
          />
        ))}
      </span>
    </div>
  );
}

/** Suggestions for tag inputs. */
export function TagSuggestions({ id, tags }: { id: string; tags: string[] }) {
  return (
    <datalist id={id}>
      {tags.map((tag) => (
        <option key={tag} value={tag} />
      ))}
    </datalist>
  );
}
