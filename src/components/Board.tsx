// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { createRef, useRef, type CSSProperties } from 'react';
import { t as translate, useMap, useStore, useT } from '../store';
import * as ops from '../model/ops';
import type { Blueprint, FlowSource, Id, Phase, Step } from '../model/types';
import { useBox } from './useBox';
import { ChevronLeft, ChevronRight, CloseIcon, GripIcon, MinusIcon, PlusIcon } from './Icons';
import { startDrag, useDropTarget } from './dnd';
import { PresentationFocus } from './Presentation';
import { StoryboardRow } from './Storyboard';
import { TextRows } from './InfoRow';
import { FlowLinks } from './FlowLinks';
import { flowsDetailing, removeDetailed } from '../model/links';
import { updateMap } from '../model/project';
import { FitText } from './FitText';
import { PersonaGrid, TagSuggestions } from './PersonaGrid';
import { cls } from './cls';
import { ACTIVITY_COL, END_COL, GAP, PERSONA_COL, ROW_GAP } from './layout';


/** The board element, used for PNG export. */
export const boardRef = createRef<HTMLDivElement>();

export function Board() {
  const t = useT();
  const steps = useMap((m) => m.steps);
  const storyboard = useMap((m) => m.storyboard);
  const zoom = useStore((s) => s.zoom);
  const presenting = useStore((s) => s.presentStep !== null);
  const apply = useStore((s) => s.apply);
  const nCols = steps.reduce((n, s) => n + s.slots.length, 0);
  const cols = `${PERSONA_COL}px${nCols ? ` repeat(${nCols}, ${ACTIVITY_COL}px)` : ''} ${END_COL}px`;

  return (
    <div className="board-zoom" style={{ zoom } as CSSProperties}>
      <PresentationFocus />
      <div className={cls('board', presenting && 'presenting')} ref={boardRef} style={{ '--cols': cols, '--gap': `${GAP}px`, '--row-gap': `${ROW_GAP}px` } as CSSProperties}>
        <Objective />
        <PhaseRow />
        <StepRow />
        {storyboard && <StoryboardRow />}
        <PersonaGrid />
        <TagSuggestions />
        {/* Right under the last persona, above the free text rows. */}
        <div className="grid-row no-export">
          <button className="add-dashed add-persona" onClick={() => apply(ops.addPersona)}>
            <PlusIcon /> {t('board.addPersona')}
          </button>
        </div>
        <TextRows />
      </div>
    </div>
  );
}

function Objective() {
  const t = useT();
  const objective = useMap((m) => m.objective);
  const apply = useStore((s) => s.apply);
  const b = useBox<HTMLTextAreaElement>('obj', 'obj');
  return (
    <label className={cls('box objective', b.selected && 'is-selected')} style={b.box}>
      <span className="eyebrow" style={{ color: b.style.color }}>
        {t('board.objective')}
      </span>
      <FitText
        ref={b.ref}
        value={objective}
        placeholder={t('board.objectivePlaceholder')}
        onFocus={b.onFocus}
        onChange={(e) => {
          const v = e.target.value;
          apply((d) => ({ ...d, objective: v }), { coalesce: 'obj' });
        }}
        style={b.text}
      />
    </label>
  );
}

function PhaseRow() {
  const t = useT();
  // Phases and steps only: typing in a card doesn't redraw the row.
  const rawPhases = useMap((m) => m.phases);
  const steps = useMap((m) => m.steps);
  const doc = { phases: rawPhases, steps };
  const apply = useStore((s) => s.apply);
  const phases = ops.normalizePhases(doc.phases, doc.steps.length);
  let cursor = 0;
  return (
    <div className="grid-row">
      <div className="row-label">{t('board.phases')}</div>
      {phases.map((p, k) => {
        let span = 0;
        for (let i = cursor; i < cursor + p.span; i++) span += doc.steps[i]?.slots.length ?? 0;
        cursor += p.span;
        return (
          <PhaseBox
            key={p.id}
            phase={p}
            index={k}
            span={Math.max(1, span)}
            isLast={k === phases.length - 1}
            canRemove={phases.length > 1}
          />
        );
      })}
      <button className="add-dashed no-export" onClick={() => apply(ops.addPhase)}>
        <PlusIcon size={14} /> {t('board.addPhase')}
      </button>
    </div>
  );
}

function PhaseBox(props: { phase: Phase; index: number; span: number; isLast: boolean; canRemove: boolean }) {
  const t = useT();
  const { phase, index, span, isLast, canRemove } = props;
  const apply = useStore((s) => s.apply);
  const b = useBox<HTMLTextAreaElement>(`phase:${phase.id}`, 'phase');
  return (
    <div className={cls('box phase', b.selected && 'is-selected')} style={{ ...b.box, gridColumn: `span ${span}` }}>
      <FitText
        ref={b.ref}
        singleLine
        aria-label={t('board.phaseName')}
        value={phase.title}
        placeholder={t('board.phasePlaceholder')}
        onFocus={b.onFocus}
        onChange={(e) => {
          const v = e.target.value;
          apply((d) => ops.setPhaseTitle(d, index, v), { coalesce: `phase:${phase.id}` });
        }}
        style={b.text}
      />
      <FlowLinks kind="phase" id={phase.id} />
      <div className="box-actions no-export" style={{ color: b.style.color }}>
        {!isLast && (
          <>
            <button className="icon-btn" title={t('board.phaseShrink')} aria-label={t('board.phaseShrink')} onClick={() => apply((d) => ops.movePhaseEdge(d, index, -1))}>
              <ChevronLeft />
            </button>
            <button className="icon-btn" title={t('board.phaseGrow')} aria-label={t('board.phaseGrow')} onClick={() => apply((d) => ops.movePhaseEdge(d, index, 1))}>
              <ChevronRight />
            </button>
          </>
        )}
        {canRemove && (
          <button className="icon-btn" title={t('board.phaseRemove')} aria-label={t('board.phaseRemove')} onClick={() => removeLinked('phase', phase.id, (d) => ops.removePhase(d, index))}>
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function StepRow() {
  const t = useT();
  const steps = useMap((m) => m.steps);
  const apply = useStore((s) => s.apply);
  const focusLater = useStore((s) => s.focusLater);
  const insertAt = (i: number) => {
    let id = '';
    apply((d) => {
      const r = ops.insertStep(d, i);
      id = r.stepId;
      return r.doc;
    });
    focusLater(`step:${id}`);
  };
  return (
    <div className="grid-row step-row">
      <div className="row-label row-label-end">{t('board.axes')}</div>
      {steps.map((s, i) => (
        <StepHeader key={s.id} step={s} index={i} onInsertBefore={() => insertAt(i)} />
      ))}
      <button className="add-dashed add-step no-export" onClick={() => insertAt(steps.length)}>
        <PlusIcon size={18} /> {t('board.addStep')}
      </button>
    </div>
  );
}

function StepHeader({ step, index, onInsertBefore }: { step: Step; index: number; onInsertBefore: () => void }) {
  const t = useT();
  const apply = useStore((s) => s.apply);
  const b = useBox<HTMLTextAreaElement>(`step:${step.id}`, 'step');
  const slots = step.slots.length;
  const boxRef = useRef<HTMLDivElement>(null);
  const drop = useDropTarget('step', (d) => apply((doc) => ops.moveStep(doc, d.index, index)));
  return (
    <div
      ref={boxRef}
      className={cls('box step', b.selected && 'is-selected', drop.over && 'is-drop-target')}
      style={{ ...b.box, gridColumn: `span ${slots}` }}
      data-step={step.id}
      {...drop.props}
    >
      <button className="insert-btn no-export" title={t('board.insertStep')} aria-label={t('board.insertStep')} onClick={onInsertBefore}>
        <PlusIcon />
      </button>
      <div className="step-top">
        <span className="step-num">
          <span
            className="grip grip-step no-export"
            title={t('board.dragStep')}
            aria-hidden="true"
            onPointerDown={(e) => startDrag(e, { kind: 'step', index }, boxRef.current)}
          >
            <GripIcon size={12} />
          </span>
          {t('board.step', { n: index + 1 })}
        </span>
        <button className="icon-btn no-export" aria-label={t('board.removeStep')} onClick={() => removeLinked('step', step.id, (d) => ops.removeStep(d, index))}>
          <CloseIcon />
        </button>
      </div>
      <FitText
        ref={b.ref}
        singleLine
        aria-label={t('board.stepName')}
        value={step.title}
        placeholder={t('board.stepPlaceholder')}
        onFocus={b.onFocus}
        onChange={(e) => {
          const v = e.target.value;
          apply((d) => ops.setStepTitle(d, step.id, v), { coalesce: `step:${step.id}` });
        }}
        style={b.text}
      />
      <FlowLinks kind="step" id={step.id} className="step-flows" />
      <div className="step-slots no-export">
        <button className="chip" aria-label={t('board.addColumnLabel')} onClick={() => apply((d) => ops.addSlot(d, step.id, null, null).doc)}>
          <PlusIcon size={12} /> {t('board.addColumn')}
        </button>
        {slots > 1 && (
          <>
            <button className="chip chip-icon" aria-label={t('board.removeColumn')} onClick={() => apply((d) => ops.removeLastSlot(d, step.id))}>
              <MinusIcon size={12} />
            </button>
            <span className="muted-sm">{t('board.columns', { n: slots })}</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Removes a phase or a step. When flows detail it, asks first, and unlinks
 * them in the same undo step.
 */
function removeLinked(kind: FlowSource['kind'], id: Id, fn: (map: Blueprint) => Blueprint) {
  const { project, docId, applyProject } = useStore.getState();
  const flows = flowsDetailing(project, docId, kind, id);
  if (flows.length > 0) {
    const names = flows.map((f) => f.name || translate('flow.default')).join(', ');
    if (!window.confirm(translate(kind === 'phase' ? 'links.confirmRemovePhase' : 'links.confirmRemoveStep', { n: flows.length, names }))) return;
  }
  applyProject((p) => removeDetailed(p, docId, kind, id, (q) => updateMap(q, docId, fn)));
}
