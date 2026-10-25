// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from 'react';
import { useMap, useStore, useT } from '../store';
import * as ops from '../model/ops';
import type { Step } from '../model/types';
import { readImage } from '../lib/image';
import { useBox } from './useBox';
import { CloseIcon, ImageIcon } from './Icons';
import { cls } from './cls';

export function StoryboardRow() {
  const t = useT();
  const steps = useMap((m) => m.steps);
  const apply = useStore((s) => s.apply);
  return (
    <div className="grid-row storyboard-row">
      <div className="row-head">
        <span className="eyebrow eyebrow-accent">{t('sb.title')}</span>
        <span className="muted">{t('sb.text')}</span>
        <button className="chip no-export" onClick={() => apply((d) => ({ ...d, storyboard: false }))}>
          {t('sb.hide')}
        </button>
      </div>
      {steps.map((s) => (
        <SceneCell key={s.id} step={s} />
      ))}
      <div />
    </div>
  );
}

function SceneCell({ step }: { step: Step }) {
  const t = useT();
  const scene = useMap((m) => m.scenes[step.id]);
  const apply = useStore((s) => s.apply);
  const b = useBox<HTMLTextAreaElement>(`scene:${step.id}`, 'scene');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(file: File | undefined) {
    setError(null);
    if (!file) return;
    const img = await readImage(file).catch(() => null);
    if (!img) {
      setError(t('sb.badImage'));
      return;
    }
    apply((d) => ops.setScene(d, step.id, { img }));
  }

  const img = scene?.img ?? null;
  const text = scene?.text ?? '';
  return (
    <div className={cls('box scene', b.selected && 'is-selected')} style={{ ...b.box, gridColumn: `span ${step.slots.length}` }} data-step={step.id}>
      {img ? (
        <div className="scene-img">
          <img src={img} alt={text || t('sb.alt', { name: step.title })} />
          <div className="scene-img-actions no-export">
            <label className="chip chip-raised file-label">
              {t('sb.replace')}
              <input type="file" accept="image/*" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button className="chip chip-raised chip-icon" aria-label={t('sb.removeImage')} onClick={() => apply((d) => ops.setScene(d, step.id, { img: null }))}>
              <CloseIcon size={12} />
            </button>
          </div>
        </div>
      ) : (
        <label
          className={cls('scene-drop file-label no-export', dragOver && 'is-over')}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); load(e.dataTransfer.files?.[0]); }}
        >
          <ImageIcon />
          <span>{t('sb.addImage')}</span>
          <span className="muted-sm">{t('sb.drop')}</span>
          <input type="file" accept="image/*" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}
      {error && <span className="error-sm" role="alert">{error}</span>}
      <textarea
        ref={b.ref}
        rows={3}
        aria-label={t('sb.description')}
        value={text}
        placeholder={t('sb.describe')}
        onFocus={b.onFocus}
        onChange={(e) => {
          const v = e.target.value;
          apply((d) => ops.setScene(d, step.id, { text: v }), { coalesce: `scene:${step.id}` });
        }}
        style={b.text}
      />
    </div>
  );
}
