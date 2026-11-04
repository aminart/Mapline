// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo, useState } from 'react';
import { useStore, useT } from '../store';
import { docLabel } from '../actions';
import { commentBoxKey, projectComments, setCommentResolved, type Comment } from '../model/comments';
import { CheckIcon, CloseIcon } from './Icons';
import { cls } from './cls';

type Filter = 'todo' | 'done' | 'all';

/** Every note of the project beside the document shown: read them, go to their card, mark them resolved. */
export function CommentsPanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const setCommentsOpen = useStore((s) => s.setCommentsOpen);
  const applyProject = useStore((s) => s.applyProject);
  const [filter, setFilter] = useState<Filter>('todo');
  const all = useMemo(() => projectComments(project), [project]);
  const todo = all.filter((c) => !c.resolved);
  const shown = filter === 'todo' ? todo : filter === 'done' ? all.filter((c) => c.resolved) : all;

  // Grouped by document, in the order of the project's tabs.
  const groups: { docId: string; items: Comment[] }[] = [];
  for (const c of shown) {
    const last = groups[groups.length - 1];
    if (last?.docId === c.docId) last.items.push(c);
    else groups.push({ docId: c.docId, items: [c] });
  }

  const resolve = (c: Comment, resolved: boolean) => applyProject((p) => setCommentResolved(p, c.docId, c.target, resolved));
  const resolveAll = () =>
    applyProject((p) => todo.reduce((acc, c) => setCommentResolved(acc, c.docId, c.target, true), p));

  const empty = all.length === 0 ? t('comments.none') : filter === 'todo' ? t('comments.noneTodo') : t('comments.noneDone');
  const filters: { id: Filter; label: string; n?: number }[] = [
    { id: 'todo', label: t('comments.todo'), n: todo.length },
    { id: 'done', label: t('comments.done'), n: all.length - todo.length },
    { id: 'all', label: t('comments.all') },
  ];

  return (
    <aside className="sheet-preview comments-panel" aria-label={t('comments.title')}>
      <div className="sheet-preview-head">
        <span className="eyebrow">{t('comments.title')}</span>
        <button className="icon-btn" aria-label={t('comments.close')} title={t('comments.close')} onClick={() => setCommentsOpen(false)}>
          <CloseIcon size={13} />
        </button>
      </div>
      <div className="segmented segmented-sm comments-filter" role="group" aria-label={t('comments.filter')}>
        {filters.map((f) => (
          <button key={f.id} className={cls(filter === f.id && 'is-on')} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            {f.n !== undefined && <span className="comments-count">{f.n}</span>}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="muted comments-empty">{empty}</p>}
      {groups.map((g) => (
        <section key={g.docId} className="comments-group">
          <h3 className="comments-doc">{docLabel(project, g.docId)}</h3>
          <ul>
            {g.items.map((c) => (
              <CommentItem key={commentBoxKey(c.target)} comment={c} onResolve={(r) => resolve(c, r)} />
            ))}
          </ul>
        </section>
      ))}
      {filter !== 'done' && todo.length > 1 && (
        <button className="text-btn comments-resolve-all" onClick={resolveAll}>
          <CheckIcon size={12} /> {t('comments.resolveAll')}
        </button>
      )}
    </aside>
  );
}

function CommentItem({ comment: c, onResolve }: { comment: Comment; onResolve: (resolved: boolean) => void }) {
  const t = useT();
  const where = c.docKind === 'mission-map' ? [c.stepTitle.trim() ? t('comments.step', { n: c.stepIndex + 1, step: c.stepTitle.trim() }) : t('comments.stepN', { n: c.stepIndex + 1 }), c.persona.trim()].filter(Boolean).join(' · ') : '';
  const go = () => {
    const s = useStore.getState();
    s.setDoc(c.docId);
    s.focusLater(commentBoxKey(c.target));
  };
  return (
    <li className={cls('comment', c.resolved && 'is-resolved')}>
      <button className="comment-go" onClick={go} title={t('comments.go')}>
        {where && <span className="muted-sm">{where}</span>}
        <strong>{c.card || t('comments.untitledCard')}</strong>
        <span className="comment-note">{c.note}</span>
      </button>
      <button
        className={cls('comment-check', c.resolved && 'is-on')}
        aria-pressed={c.resolved}
        aria-label={c.resolved ? t('comments.reopen') : t('comments.resolve')}
        title={c.resolved ? t('comments.reopen') : t('comments.resolve')}
        onClick={() => onResolve(!c.resolved)}
      >
        <CheckIcon size={13} />
      </button>
    </li>
  );
}
