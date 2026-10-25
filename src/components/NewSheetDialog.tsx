// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { Fragment, useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../store';
import { addSheets, docLabel } from '../actions';
import { sheetFor } from '../model/project';
import type { SheetTemplateId } from '../model/templates';
import type { Id, MissionMapDoc } from '../model/types';
import { SheetTemplateList } from './Templates';

/** "New persona sheet" in the open project: a template and the persona it describes. */
export function NewSheetDialog() {
  const t = useT();
  const open = useStore((s) => s.newSheet);
  const setOpen = useStore((s) => s.setNewSheet);
  const project = useStore((s) => s.project);
  const docId = useStore((s) => s.docId);
  const ref = useRef<HTMLDialogElement>(null);
  const [template, setTemplate] = useState<SheetTemplateId>('classic');
  // 'map|persona', 'all|map' for every persona of a map without a sheet, or 'none' for a standalone sheet.
  const [target, setTarget] = useState<string>('none');

  const maps = project.docs.filter((d): d is MissionMapDoc => d.kind === 'mission-map');
  const without = (map: MissionMapDoc) => map.map.personas.filter((p) => !sheetFor(project, map.id, p.id));

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // The persona asked for, else the first one without a sheet (in the map shown first).
      const shown = maps.find((m) => m.id === (open.mapDocId ?? docId));
      const first = [shown, ...maps].find((m) => m && without(m).length > 0);
      setTarget(
        open.personaId && shown ? `${shown.id}|${open.personaId}` : first ? `${first.id}|${without(first)[0].id}` : 'none',
      );
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
    // Only when it opens: the lists change as the user creates sheets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [kind, mapId, personaId] = target === 'none' ? ['none'] : target.startsWith('all|') ? ['all', target.slice(4)] : ['one', ...target.split('|')];
  const allCount = kind === 'all' ? without(maps.find((m) => m.id === mapId)!).length : 0;
  const create = () => {
    if (kind === 'one') addSheets(template, mapId as Id, [personaId as Id]);
    else if (kind === 'all') addSheets(template, mapId as Id, without(maps.find((m) => m.id === mapId)!).map((p) => p.id));
    else addSheets(template, null, []);
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="new-sheet-title"
      onClose={() => setOpen(null)}
      onClick={(e) => {
        if (e.target === ref.current) setOpen(null);
      }}
    >
      <div className="dialog-body">
        <h2 id="new-sheet-title">{t('sheet.new.title')}</h2>
        <SheetTemplateList picked={template} onPick={setTemplate} />
        {maps.length > 0 && (
          <label className="field-group field-stack">
            <span className="field-legend">{t('sheet.new.for')}</span>
            <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
              {maps.map((map) => {
                const rest = without(map);
                const options = (
                  <>
                    {map.map.personas.map((p) => {
                      const has = !!sheetFor(project, map.id, p.id);
                      return (
                        <option key={p.id} value={`${map.id}|${p.id}`} disabled={has}>
                          {p.name || t('doc.unnamed')}
                          {has ? ` (${t('sheet.new.has')})` : ''}
                        </option>
                      );
                    })}
                    {rest.length > 1 && <option value={`all|${map.id}`}>{t('sheet.new.all', { n: rest.length })}</option>}
                  </>
                );
                // Several maps: their personas grouped under each map's name.
                return maps.length > 1 ? (
                  <optgroup key={map.id} label={docLabel(project, map.id)}>
                    {options}
                  </optgroup>
                ) : (
                  <Fragment key={map.id}>{options}</Fragment>
                );
              })}
              <option value="none">{t('sheet.new.none')}</option>
            </select>
          </label>
        )}
        <div className="dialog-actions">
          <button className="btn" onClick={() => setOpen(null)}>
            {t('new.cancel')}
          </button>
          <button className="btn btn-primary" onClick={create}>
            {kind === 'all' ? t('sheet.new.createAll', { n: allCount }) : t('sheet.new.create')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
