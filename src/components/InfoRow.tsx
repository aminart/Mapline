// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef } from 'react';
import { useMap, useStore, useT } from '../store';
import * as ops from '../model/ops';
import type { Step } from '../model/types';
import { useBox } from './useBox';
import { useFitText } from './useFitText';
import { FitText } from './FitText';
import { cls } from './cls';

/** Optional row under the personas: free text under each step, like the storyboard without images. */
export function InfoRow() {
  const t = useT();
  const steps = useMap((m) => m.steps);
  const title = useMap((m) => m.infoTitle);
  const text = useMap((m) => m.infoText);
  const apply = useStore((s) => s.apply);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const shownText = text ?? t('info.text');
  useFitText(textRef, [shownText]);
  return (
    <div className="grid-row info-row">
      <div className="row-head">
        {/* Title and description start as the defaults and can be renamed. */}
        <FitText
          singleLine
          className="eyebrow eyebrow-accent row-head-title"
          aria-label={t('info.renameTitle')}
          title={t('info.renameTitle')}
          value={title ?? t('info.title')}
          maxLength={60}
          onChange={(e) => {
            const v = e.target.value;
            apply((d) => ({ ...d, infoTitle: v }), { coalesce: 'info-title' });
          }}
        />
        <textarea
          ref={textRef}
          className="muted row-head-text"
          rows={1}
          aria-label={t('info.renameText')}
          title={t('info.renameText')}
          value={shownText}
          onChange={(e) => {
            const v = e.target.value;
            apply((d) => ({ ...d, infoText: v }), { coalesce: 'info-text' });
          }}
        />
        <button className="chip no-export" onClick={() => apply((d) => ({ ...d, infoRow: false }))}>
          {t('sb.hide')}
        </button>
      </div>
      {steps.map((s) => (
        <InfoCell key={s.id} step={s} />
      ))}
      <div />
    </div>
  );
}

function InfoCell({ step }: { step: Step }) {
  const t = useT();
  const text = useMap((m) => m.infos[step.id] ?? '');
  const apply = useStore((s) => s.apply);
  const b = useBox<HTMLTextAreaElement>(`info:${step.id}`, 'info');
  useFitText(b.ref, [text, b.text.fontFamily, b.text.fontSize, b.text.fontWeight]);
  return (
    <div className={cls('box info', b.selected && 'is-selected')} style={{ ...b.box, gridColumn: `span ${step.slots.length}` }} data-step={step.id}>
      <textarea
        ref={b.ref}
        rows={1}
        aria-label={t('info.label')}
        value={text}
        placeholder={t('info.placeholder')}
        onFocus={b.onFocus}
        onChange={(e) => {
          const v = e.target.value;
          apply((d) => ops.setInfo(d, step.id, v), { coalesce: `info:${step.id}` });
        }}
        style={b.text}
      />
    </div>
  );
}
