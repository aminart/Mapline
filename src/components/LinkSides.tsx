// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useT } from '../store';
import { SIDES } from '../lib/orthoRoute';
import type { LinkSide } from '../model/types';
import { cls } from './cls';

/** A card with one side drawn bold: the side an arrow leaves or enters by. */
function SideIcon({ side }: { side: LinkSide }) {
  const edge = { top: 'M3 3h10', right: 'M13 3v10', bottom: 'M3 13h10', left: 'M3 3v10' }[side];
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round">
      <rect x="3" y="3" width="10" height="10" rx="1.5" strokeWidth="1.2" opacity="0.45" />
      <path d={edge} strokeWidth="2.6" />
    </svg>
  );
}

/** Départ and Arrivée of a selected arrow: Auto or one side of its card. */
export function LinkSides({ link, onPick }: { link: { fromSide?: LinkSide; toSide?: LinkSide }; onPick: (end: 'fromSide' | 'toSide', side: LinkSide | undefined) => void }) {
  const t = useT();
  return (
    <>
      {(['fromSide', 'toSide'] as const).map((end) => (
        <div key={end} className="swatches" role="group" aria-label={t(`link.${end}`)}>
          <span className="swatches-label">{t(`link.${end}`)}</span>
          <div className="segmented segmented-sm link-sides">
            {([undefined, ...SIDES] as const).map((side) => {
              const on = link[end] === side;
              const name = side ? t(`link.side.${side}`) : t('link.sideAutoHint');
              return (
                <button key={side ?? 'auto'} className={cls(on && 'is-on')} aria-pressed={on} aria-label={side ? name : t('link.sideAuto')} title={name} onClick={() => onPick(end, side)}>
                  {side ? <SideIcon side={side} /> : t('link.sideAuto')}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
