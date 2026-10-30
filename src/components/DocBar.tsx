// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef, useState } from 'react';
import { useStore, useT } from '../store';
import { docLabel, removeDocument } from '../actions';
import { renameDoc } from '../model/project';
import type { ProjectDoc } from '../model/types';
import { CloseIcon, FlowIcon, MapIcon, PencilIcon, PersonIcon, PlusIcon } from './Icons';
import { cls } from './cls';

/** The documents of the active project, as tabs: its maps, persona sheets and flows. */
export function DocBar() {
  const t = useT();
  const project = useStore((s) => s.project);
  const docId = useStore((s) => s.docId);
  const setDoc = useStore((s) => s.setDoc);
  const setNewSheet = useStore((s) => s.setNewSheet);
  const setNewFlowOpen = useStore((s) => s.setNewFlowOpen);
  const setNewMapOpen = useStore((s) => s.setNewMapOpen);
  const [editing, setEditing] = useState<string | null>(null);
  // Shown once a lang change re-renders; labels come from the store's language.
  useStore((s) => s.lang);
  const removable = project.docs.length > 1;
  return (
    <div className="docbar" role="tablist" aria-label={t('doc.label')}>
      {project.docs.map((doc) => {
        const label = docLabel(project, doc.id);
        const active = doc.id === docId;
        // A sheet is named after its persona; maps and flows have their own name.
        const renamable = doc.kind !== 'persona';
        return (
          <div key={doc.id} className={cls('doc-tab', active && 'is-active')}>
            {editing === doc.id ? (
              <RenameField doc={doc} done={() => setEditing(null)} />
            ) : (
              <button
                className="doc-tab-btn"
                role="tab"
                aria-selected={active}
                title={renamable ? t('doc.renameHint') : undefined}
                onClick={() => setDoc(doc.id)}
                onDoubleClick={() => renamable && setEditing(doc.id)}
              >
                {doc.kind === 'mission-map' ? <MapIcon /> : doc.kind === 'flow' ? <FlowIcon /> : <PersonIcon />}
                {label}
              </button>
            )}
            {renamable && editing !== doc.id && (
              <button className="icon-btn doc-tab-action" aria-label={t('doc.rename', { name: label })} title={t('doc.rename', { name: label })} onClick={() => setEditing(doc.id)}>
                <PencilIcon size={11} />
              </button>
            )}
            {removable && (
              <button className="icon-btn doc-tab-action" aria-label={t('doc.remove', { name: label })} title={t('doc.remove', { name: label })} onClick={() => removeDocument(doc.id)}>
                <CloseIcon size={11} />
              </button>
            )}
          </div>
        );
      })}
      <button className="doc-add" onClick={() => setNewMapOpen(true)}>
        <PlusIcon size={12} /> {t('doc.addMap')}
      </button>
      <button className="doc-add" onClick={() => setNewSheet({ personaId: null })}>
        <PlusIcon size={12} /> {t('doc.add')}
      </button>
      <button className="doc-add" onClick={() => setNewFlowOpen(true)}>
        <PlusIcon size={12} /> {t('doc.addFlow')}
      </button>
    </div>
  );
}

/** The name of a map or flow, edited in its tab: Enter or leaving keeps it, Escape cancels. */
function RenameField({ doc, done }: { doc: ProjectDoc; done: () => void }) {
  const t = useT();
  const applyProject = useStore((s) => s.applyProject);
  const [value, setValue] = useState(doc.name);
  const cancelled = useRef(false);
  const commit = () => {
    if (cancelled.current) return;
    const name = value.trim();
    if (name !== doc.name) applyProject((p) => renameDoc(p, doc.id, name));
    done();
  };
  return (
    <input
      className="doc-tab-input"
      autoFocus
      aria-label={t(doc.kind === 'flow' ? 'flow.name' : 'doc.mapName')}
      placeholder={t(doc.kind === 'flow' ? 'flow.default' : 'doc.missionMap')}
      value={value}
      size={Math.max(8, value.length + 1)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          done();
        }
      }}
    />
  );
}
