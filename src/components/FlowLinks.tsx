// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../store';
import type { FlowSource, Id } from '../model/types';
import { addDetailFlow, flowsDetailing, setFlowSource } from '../model/links';
import { createFlowDoc } from '../model/templates';
import { docLabel } from '../actions';
import { ChevronRight, FlowIcon, LinkIcon, PlusIcon } from './Icons';
import { cls } from './cls';

/**
 * The flows detailing a phase, a step or an activity of the map shown: a
 * chip per flow, that opens it, and a menu to detail it in a new flow or
 * link an existing one.
 */
export function FlowLinks({ kind, id, className }: { kind: FlowSource['kind']; id: Id; className?: string }) {
  const t = useT();
  const docId = useStore((s) => s.docId);
  const project = useStore((s) => s.project);
  const setDoc = useStore((s) => s.setDoc);
  const applyProject = useStore((s) => s.applyProject);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const linked = flowsDetailing(project, docId, kind, id);
  const others = project.docs.filter((d) => d.kind === 'flow' && !linked.includes(d));

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
}
