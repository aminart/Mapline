// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useStore, useT } from '../store';
import { docLabel, removeDocument } from '../actions';
import { CloseIcon, FlowIcon, MapIcon, PersonIcon, PlusIcon } from './Icons';
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
  // Shown once a lang change re-renders; labels come from the store's language.
  useStore((s) => s.lang);
  const removable = project.docs.length > 1;
  return (
    <div className="docbar" role="tablist" aria-label={t('doc.label')}>
      {project.docs.map((doc) => {
        const label = docLabel(project, doc.id);
        const active = doc.id === docId;
        return (
          <div key={doc.id} className={cls('doc-tab', active && 'is-active')}>
            <button className="doc-tab-btn" role="tab" aria-selected={active} onClick={() => setDoc(doc.id)}>
              {doc.kind === 'mission-map' ? <MapIcon /> : doc.kind === 'flow' ? <FlowIcon /> : <PersonIcon />}
              {label}
            </button>
            {removable && (
              <button className="icon-btn doc-tab-close" aria-label={t('doc.remove', { name: label })} title={t('doc.remove', { name: label })} onClick={() => removeDocument(doc.id)}>
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
