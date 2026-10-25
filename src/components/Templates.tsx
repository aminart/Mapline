// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../store';
import { addFlow, newFlowProject, newProject, newSheetProject, open } from '../actions';
import { FLOW_TEMPLATES, SHEET_TEMPLATES, TEMPLATES, flowTemplateLabel, sheetTemplateLabel, templateLabel, type FlowTemplateId, type SheetTemplateId, type TemplateId } from '../model/templates';
import { cls } from './cls';
import { FolderIcon } from './Icons';

/** Miniature of a template's layout, for recognising it at a glance. */
function TemplateThumb({ id }: { id: TemplateId }) {
  const cols = id === 'blank' ? 1 : 4;
  const rows = id === 'mission-map' ? 3 : 1;
  return (
    <svg className="tpl-thumb" viewBox="0 0 80 52" aria-hidden="true">
      <rect x="2" y="2" width="76" height="7" rx="2" fill="#191B20" />
      {id === 'mission-map' && <rect x="20" y="12" width="58" height="4" rx="1.5" fill="#C9D5F6" />}
      {Array.from({ length: cols }, (_, c) => (
        <rect key={`s${c}`} x={20 + c * 15} y={id === 'mission-map' ? 18 : 12} width="13" height="5" rx="1.5" fill="#DDE1E7" />
      ))}
      {id === 'storyboard' &&
        Array.from({ length: cols }, (_, c) => (
          <rect key={`i${c}`} x={20 + c * 15} y="19" width="13" height="10" rx="1.5" fill="#E3ECFF" />
        ))}
      {Array.from({ length: rows }, (_, r) => {
        const y = (id === 'mission-map' ? 25 : id === 'storyboard' ? 32 : 19) + r * 9;
        return (
          <g key={`r${r}`}>
            <rect x="2" y={y} width="16" height="7" rx="1.5" fill={['#EDF1FC', '#FDF0E8', '#E7F4F2'][r]} />
            {Array.from({ length: cols }, (_, c) => (
              <rect key={c} x={20 + c * 15} y={y} width="13" height="7" rx="1.5" fill="none" stroke="#C9CED6" strokeDasharray="2 1.5" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function TemplateList({ onPick }: { onPick: (id: TemplateId) => void }) {
  const t = useT();
  return (
    <div className="tpl-list">
      {TEMPLATES.map((id) => {
        const { label, description } = templateLabel(id);
        return (
          <button key={id} className="tpl-card" onClick={() => onPick(id)}>
            <TemplateThumb id={id} />
            <span className="tpl-text">
              <span className="tpl-name">{t(label)}</span>
              <span className="muted-sm">{t(description)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Miniature of a persona sheet template. */
function SheetThumb({ id }: { id: SheetTemplateId }) {
  const accents = ['#2F55D4', '#C2410C', '#0F766E', '#7E22CE', '#A16207', '#BE185D'];
  return (
    <svg className="tpl-thumb" viewBox="0 0 80 52" aria-hidden="true">
      <rect x="2" y="2" width="22" height="48" rx="3" fill="#EDF1FC" />
      <circle cx="13" cy="12" r="5" fill={id === 'blank' ? '#C9CED6' : '#2F55D4'} />
      <rect x="6" y="20" width="14" height="2.5" rx="1" fill="#C9D3EE" />
      {id === 'classic' &&
        accents.map((c, i) => (
          <g key={c}>
            <rect x={27 + (i % 3) * 17.5} y={i < 3 ? 2 : 27} width="16" height="23" rx="2" fill="#FFFFFF" stroke="#DDE1E7" strokeWidth="0.8" />
            <rect x={27 + (i % 3) * 17.5} y={i < 3 ? 2 : 27} width="16" height="2" rx="1" fill={c} />
          </g>
        ))}
      {id === 'blank' && <rect x="27" y="2" width="51" height="48" rx="2.5" fill="none" stroke="#C9CED6" strokeDasharray="3 2" />}
    </svg>
  );
}

export function SheetTemplateList({ onPick, picked }: { onPick: (id: SheetTemplateId) => void; picked?: SheetTemplateId }) {
  const t = useT();
  return (
    <div className="tpl-list">
      {SHEET_TEMPLATES.map((id) => {
        const { label, description } = sheetTemplateLabel(id);
        return (
          <button key={id} className={cls('tpl-card', picked === id && 'is-on')} aria-pressed={picked === undefined ? undefined : picked === id} onClick={() => onPick(id)}>
            <SheetThumb id={id} />
            <span className="tpl-text">
              <span className="tpl-name">{t(label)}</span>
              <span className="muted-sm">{t(description)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Miniature of a flow template. */
function FlowThumb({ id }: { id: FlowTemplateId }) {
  const card = (x: number, y: number, fill = '#FFFFFF', stroke = '#DDE1E7') => <rect x={x} y={y} width="11" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="0.8" />;
  return (
    <svg className="tpl-thumb" viewBox="0 0 80 52" aria-hidden="true">
      {id === 'user' ? (
        <>
          <path d="M11 26h5M27 26h4M42 26h3v-14h4M42 26h3v14h4M60 12h4v14h3M60 40h4v-14" stroke="#8B919C" strokeWidth="0.9" fill="none" />
          <rect x="3" y="23" width="8" height="6" rx="3" fill="#191B20" />
          {card(16, 22)}
          {card(31, 22, '#FFFBEB', '#D9A93B')}
          {card(49, 8)}
          {card(49, 36)}
          <rect x="67" y="23" width="9" height="6" rx="3" fill="#191B20" />
        </>
      ) : (
        <>
          <path d="M33 26h14" stroke="#C9CED6" strokeWidth="0.9" />
          <rect x="22" y="23" width="11" height="6" rx="3" fill="#8B919C" />
          <rect x="47" y="23" width="11" height="6" rx="3" fill="#8B919C" />
        </>
      )}
    </svg>
  );
}

export function FlowTemplateList({ onPick }: { onPick: (id: FlowTemplateId) => void }) {
  const t = useT();
  return (
    <div className="tpl-list">
      {FLOW_TEMPLATES.map((id) => {
        const { label, description } = flowTemplateLabel(id);
        return (
          <button key={id} className="tpl-card" onClick={() => onPick(id)}>
            <FlowThumb id={id} />
            <span className="tpl-text">
              <span className="tpl-name">{t(label)}</span>
              <span className="muted-sm">{t(description)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "New flow" in the open project. */
export function NewFlowDialog() {
  const t = useT();
  const isOpen = useStore((s) => s.newFlowOpen);
  const setOpen = useStore((s) => s.setNewFlowOpen);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="new-flow-title"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        if (e.target === ref.current) setOpen(false);
      }}
    >
      <div className="dialog-body">
        <h2 id="new-flow-title">{t('flow.new.title')}</h2>
        <FlowTemplateList onPick={addFlow} />
        <div className="dialog-actions">
          <button className="btn" onClick={() => setOpen(false)}>
            {t('new.cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}

type ProjectKind = 'map' | 'sheet' | 'flow';

/** A project type switch, then that type's templates. */
function TemplatePicker() {
  const t = useT();
  const [kind, setKind] = useState<ProjectKind>('map');
  return (
    <>
      <div className="segmented kind-switch" role="group" aria-label={t('new.kind')}>
        {(['map', 'sheet', 'flow'] as const).map((k) => (
          <button key={k} className={cls(kind === k && 'is-on')} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(`new.kind.${k}`)}
          </button>
        ))}
      </div>
      {kind === 'map' && <TemplateList onPick={newProject} />}
      {kind === 'sheet' && <SheetTemplateList onPick={newSheetProject} />}
      {kind === 'flow' && <FlowTemplateList onPick={newFlowProject} />}
    </>
  );
}

/** "New project" dialog: pick a template. */
export function NewProjectDialog() {
  const t = useT();
  const isOpen = useStore((s) => s.newProjectOpen);
  const setOpen = useStore((s) => s.setNewProjectOpen);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="new-project-title"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        // A click on the backdrop closes the dialog.
        if (e.target === ref.current) setOpen(false);
      }}
    >
      <div className="dialog-body">
        <h2 id="new-project-title">{t('new.title')}</h2>
        <p className="muted">{t('new.text')}</p>
        <TemplatePicker />
        <div className="dialog-actions">
          <button className="btn" onClick={() => setOpen(false)}>
            {t('new.cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Shown when no project is open. */
export function StartScreen() {
  const t = useT();
  return (
    <div className="start">
      <h1>{t('start.title')}</h1>
      <p className="muted">{t('start.text')}</p>
      <TemplatePicker />
      <div className="start-actions">
        <button className="btn" onClick={open}>
          <FolderIcon /> {t('start.open')}
        </button>
      </div>
    </div>
  );
}
