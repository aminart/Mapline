// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { CSSProperties } from 'react';
import { useT } from '../store';
import type { Change } from '../model/states';
import { cls } from './cls';

/** The label on a card added or changed since the current state. */
export function ChangeTag({ change }: { change: Change }) {
  const t = useT();
  return <span className={cls('change-tag', `change-${change}`)}>{t(change === 'added' ? 'state.addedTag' : 'state.modifiedTag')}</span>;
}

/** A changed card's text in the current state, struck through. */
export function BeforeText({ text }: { text: string }) {
  const t = useT();
  if (!text.trim()) return null;
  return (
    <div className="change-before" title={t('state.before', { text })}>
      <s>{text}</s>
    </div>
  );
}

/** A card of the current state the target no longer has, where it was; it can be put back. */
export function RemovedCard(props: { text: string; choice?: boolean; style?: CSSProperties; className?: string; onRestore: () => void }) {
  const t = useT();
  const { text, choice, style, className, onRestore } = props;
  return (
    <div className={cls('removed-card', choice && 'removed-choice', className)} style={style}>
      <span className="change-tag change-removed">{t('state.removedTag')}</span>
      {text.trim() ? <s className="removed-text">{text}</s> : <span className="removed-text removed-empty">{t('state.noText')}</span>}
      <button className="text-btn removed-restore no-export" onClick={onRestore}>
        {t('state.restore')}
      </button>
    </div>
  );
}
