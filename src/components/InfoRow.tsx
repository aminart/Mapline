// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef } from 'react';
import { useMap, useStore, useT } from '../store';
import * as ops from '../model/ops';
import type { Step, TextRow as Row } from '../model/types';
import { useBox } from './useBox';
import { useFitText } from './useFitText';
import { FitText } from './FitText';
import { PlusIcon } from './Icons';
import { cls } from './cls';

/** The free text rows under the personas, and the button that adds one. */
export function TextRows() {
  const t = useT();
  const rows = useMap((m) => m.textRows);
  const apply = useStore((s) => s.apply);
  const focusLater = useStore((s) => s.focusLater);
  const firstStep = useMap((m) => m.steps[0]?.id);
  const add = () => {
    let id = '';
    apply((d) => {
      // The first row keeps its usual name; the next ones are plain text rows.
      const r = ops.addTextRow(d, t(d.textRows.length ? 'info.newTitle' : 'info.title'));
      id = r.rowId;
      return r.doc;
    });
    if (firstStep) focusLater(ops.textCellKey(id, firstStep));
  };
  return (
    <>
      {rows.map((r) => (
        <TextRow key={r.id} row={r} />
      ))}
      <div className="grid-row no-export">
        <button className="add-dashed add-text-row" onClick={add}>
          <PlusIcon /> {t('info.add')}
        </button>
      </div>
    </>
  );
}

/** A free text row: text under each step, like the storyboard without images. */
function TextRow({ row }: { row: Row }) {
  const t = useT();
  const steps = useMap((m) => m.steps);
  const apply = useStore((s) => s.apply);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const shownText = row.text ?? t('info.text');
  useFitText(textRef, [shownText]);
  return (
    <div className="grid-row info-row" data-text-row={row.id}>
      <div className="row-head">
        {/* Title and description start as the defaults and can be renamed. */}
        <FitText
          singleLine
          className="eyebrow eyebrow-accent row-head-title"
          aria-label={t('info.renameTitle')}
          title={t('info.renameTitle')}
          value={row.title ?? t('info.title')}
          maxLength={60}
          onChange={(e) => {
            const v = e.target.value;
            apply((d) => ops.setTextRow(d, row.id, { title: v }), { coalesce: `text-row-title:${row.id}` });
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
            apply((d) => ops.setTextRow(d, row.id, { text: v }), { coalesce: `text-row-text:${row.id}` });
          }}
        />
        <button className="chip no-export" onClick={() => apply((d) => ops.removeTextRow(d, row.id))}>
          {t('info.remove')}
        </button>
      </div>
      {steps.map((s) => (
        <TextCell key={s.id} rowId={row.id} step={s} text={row.cells[s.id] ?? ''} />
      ))}
      <div />
    </div>
  );
}

function TextCell({ rowId, step, text }: { rowId: string; step: Step; text: string }) {
  const t = useT();
  const apply = useStore((s) => s.apply);
  const b = useBox<HTMLTextAreaElement>(ops.textCellKey(rowId, step.id), 'info');
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
          apply((d) => ops.setTextCell(d, rowId, step.id, v), { coalesce: `info:${rowId}:${step.id}` });
        }}
        style={b.text}
      />
    </div>
  );
}
