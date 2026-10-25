// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../store';
import { addSheets } from '../actions';
import { sheetFor } from '../model/project';
import type { SheetTemplateId } from '../model/templates';
import type { Id, MissionMapDoc } from '../model/types';
import { SheetTemplateList } from './Templates';
import { cls } from './cls';

/** "New persona sheet" in the open project: a template and the persona it describes. */
export function NewSheetDialog() {
  const t = useT();
  const open = useStore((s) => s.newSheet);
  const setOpen = useStore((s) => s.setNewSheet);
  const project = useStore((s) => s.project);
  const ref = useRef<HTMLDialogElement>(null);
  const [template, setTemplate] = useState<SheetTemplateId>('classic');
  // A persona id, 'none' for a standalone sheet, or 'all' for every persona without one.
  const [target, setTarget] = useState<string>('none');

  const map = project.docs.find((d): d is MissionMapDoc => d.kind === 'mission-map');
  const personas = map?.map.personas ?? [];
  const without = map ? personas.filter((p) => !sheetFor(project, map.id, p.id)) : [];

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTarget(open.personaId ?? (without[0]?.id ?? 'none'));
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
    // Only when it opens: `without` changes as the user creates sheets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const create = () => {
    if (!map || target === 'none') addSheets(template, null, []);
    else if (target === 'all') addSheets(template, map.id, without.map((p) => p.id));
    else addSheets(template, map.id, [target as Id]);
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
        {map && (
          <fieldset className="field-group">
            <legend>{t('sheet.new.for')}</legend>
            <div className="persona-pick">
              {personas.map((p) => {
                const has = !!sheetFor(project, map.id, p.id);
                return (
                  <label key={p.id} className={cls('persona-pick-row', has && 'is-disabled')}>
                    <input type="radio" name="sheet-target" value={p.id} checked={target === p.id} disabled={has} onChange={() => setTarget(p.id)} />
                    <span>{p.name || t('doc.unnamed')}</span>
                    {has && <span className="muted-sm">{t('sheet.new.has')}</span>}
                  </label>
                );
              })}
              {without.length > 1 && (
                <label className="persona-pick-row">
                  <input type="radio" name="sheet-target" value="all" checked={target === 'all'} onChange={() => setTarget('all')} />
                  <span>{t('sheet.new.all', { n: without.length })}</span>
                </label>
              )}
              <label className="persona-pick-row">
                <input type="radio" name="sheet-target" value="none" checked={target === 'none'} onChange={() => setTarget('none')} />
                <span>{t('sheet.new.none')}</span>
              </label>
            </div>
          </fieldset>
        )}
        <div className="dialog-actions">
          <button className="btn" onClick={() => setOpen(null)}>
            {t('new.cancel')}
          </button>
          <button className="btn btn-primary" onClick={create}>
            {target === 'all' ? t('sheet.new.createAll', { n: without.length }) : t('sheet.new.create')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
