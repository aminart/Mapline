// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { memo, useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../store';
import type { FlowSource, Id } from '../model/types';
import { addDetailFlow, flowsDetailing, setFlowSource } from '../model/links';
import { createFlowDoc } from '../model/templates';
import { docLabel } from '../actions';
import { ChevronRight, FlowIcon, LinkIcon, PlusIcon } from './Icons';
import { cls } from './cls';

/**
 * The flows detailing a phase or a step of the map shown: a
 * chip per flow, that opens it, and a menu to detail it in a new flow or
 * link an existing one.
 */
export const FlowLinks = memo(function FlowLinks({ kind, id, className }: { kind: FlowSource['kind']; id: Id; className?: string }) {
  const t = useT();
  const docId = useStore((s) => s.docId);
  const setDoc = useStore((s) => s.setDoc);
  const applyProject = useStore((s) => s.applyProject);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // The linked flows as a string, so typing elsewhere in the project doesn't redraw every chip.
  const key = useStore((s) => flowsDetailing(s.project, s.docId, kind, id).map((f) => `${f.id}\u0000${f.name}`).join('\u0001'));
  const linked = key ? key.split('\u0001').map((x) => { const [fid, name] = x.split('\u0000'); return { id: fid, name }; }) : [];
  // Read when drawn: the menu is open, or the chips' labels.
  const project = useStore.getState().project;
  const others = open ? project.docs.filter((d) => d.kind === 'flow' && !linked.some((l) => l.id === d.id)) : [];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const source: FlowSource = { docId, kind, id };
  const detail = () => {
    const { lang } = useStore.getState();
    const doc = createFlowDoc('blank', lang);
    applyProject((p) => addDetailFlow(p, doc, source));
    setOpen(false);
    setDoc(doc.id);
  };

  return (
    <div ref={ref} className={cls('flow-links no-export', linked.length > 0 && 'has-links', open && 'is-open', className)}>
      {linked.map((f) => (
        <button key={f.id} className="flow-chip" title={t('links.open', { name: docLabel(project, f.id) })} aria-label={t('links.open', { name: docLabel(project, f.id) })} onClick={() => setDoc(f.id)}>
          <FlowIcon size={11} />
          <span className="flow-chip-name">{f.name || t('flow.default')}</span>
          <ChevronRight size={11} />
        </button>
      ))}
      <button className="flow-links-btn" aria-label={t('links.button')} title={t('links.button')} aria-expanded={open} onClick={() => setOpen(!open)}>
        <FlowIcon size={11} />
        {linked.length === 0 && <PlusIcon size={9} />}
      </button>
      {open && (
        <div className="flow-links-menu" role="menu">
          <button className="flow-links-item is-main" role="menuitem" onClick={detail}>
            <FlowIcon size={13} /> {t('links.detailNew')}
          </button>
          {others.length > 0 && (
            <>
              <div className="flow-links-label">{t('links.linkExisting')}</div>
              {others.map((f) => (
                <button
                  key={f.id}
                  className="flow-links-item"
                  role="menuitem"
                  onClick={() => {
                    applyProject((p) => setFlowSource(p, f.id, source));
                    setOpen(false);
                  }}
                >
                  <LinkIcon size={13} /> {docLabel(project, f.id)}
                </button>
              ))}
            </>
          )}
          {linked.map((f) => (
            <button key={f.id} className="flow-links-item is-muted" role="menuitem" onClick={() => applyProject((p) => setFlowSource(p, f.id, null))}>
              {t('links.unlink', { name: f.name || t('flow.default') })}
            </button>
          ))}
          <p className="flow-links-hint">{t('links.hint')}</p>
        </div>
      )}
    </div>
  );
});
