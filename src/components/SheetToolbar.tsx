// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { activeSheet, useStore, useT } from '../store';
import { docLabel } from '../actions';
import * as so from '../model/sheet';
import { linkedPersona, setSheetSync, sheetIdentity } from '../model/project';
import { BLOCK_ACCENTS, FILL_SWATCHES, PERSONA_PALETTE } from '../model/theme';
import type { BlockView, PersonaSheet } from '../model/types';
import { Swatches } from './FormatToolbar';
import { MapIcon } from './Icons';
import { cls } from './cls';

const VIEWS: BlockView[] = ['list', 'gauges', 'tags', 'text'];

/** Persona sheet tools: its link to the mission map, and the selected box's style. */
export function SheetToolbar() {
  const t = useT();
  const project = useStore((s) => s.project);
  const docId = useStore((s) => s.docId);
  const sheet = useStore((s) => activeSheet(s));
  const sel = useStore((s) => s.sel);
  const applyProject = useStore((s) => s.applyProject);
  const setDoc = useStore((s) => s.setDoc);
  if (!sheet) return null;
  const linked = linkedPersona(project, sheet);
  return (
    <div className="toolbar" role="toolbar" aria-label={t('tool.label')}>
      {linked ? (
        <div className="sheet-link">
          <button className="chip" onClick={() => setDoc(linked.mapDocId)}>
            <MapIcon size={13} /> {t('sheet.linkedTo', { persona: linked.persona.name || t('doc.unnamed'), map: docLabel(project, linked.mapDocId) })}
          </button>
          <label className="toggle toggle-inline" title={t('sheet.syncHint')}>
            <input type="checkbox" checked={sheet.sync} onChange={(e) => {
              const on = e.target.checked;
              applyProject((p) => setSheetSync(p, docId, on));
            }} />
            <span>{t('sheet.sync')}</span>
          </label>
        </div>
      ) : (
        <span className="hint">{t('sheet.notLinked')}</span>
      )}
      <div className="divider" />
      {sel?.startsWith('block:') ? (
        <BlockControls sheet={sheet} blockId={sel.slice('block:'.length)} />
      ) : sel === 'identity' ? (
        <IdentityControls sheet={sheet} />
      ) : (
        <span className="hint">{t('tool.noSelection')}</span>
      )}
    </div>
  );
}

/** Block widths offered in the toolbar, in columns of the sheet grid. */
const WIDTHS: [number, string][] = [
  [2, '1/3'],
  [3, '1/2'],
  [4, '2/3'],
  [so.SHEET_COLS, '1'],
];

function BlockControls({ sheet, blockId }: { sheet: PersonaSheet; blockId: string }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  const block = sheet.blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const key = `block:${blockId}`;
  const custom = sheet.styles[key];
  const place = so.sheetLayout(sheet.blocks)[sheet.blocks.indexOf(block)];
  return (
    <div className="style-controls">
      <span className="badge">{t('kind.block')}</span>
      <Swatches label={t('tool.fill')} list={FILL_SWATCHES} value={custom?.bg ?? '#FFFFFF'} variant="fill" onPick={(bg, live) => applySheet((s) => so.setSheetStyle(s, key, { bg }), live ? { coalesce: `style:${key}` } : undefined)} />
      <Swatches label={t('sheet.accent')} list={BLOCK_ACCENTS} value={block.accent} variant="fill" onPick={(accent, live) => applySheet((s) => so.setBlock(s, blockId, { accent }), live ? { coalesce: `accent:${key}` } : undefined)} />
      <div className="swatches" role="group" aria-label={t('sheet.view')}>
        <span className="swatches-label">{t('sheet.view')}</span>
        <div className="segmented segmented-sm">
          {VIEWS.map((v) => (
            <button key={v} className={cls(block.view === v && 'is-on')} aria-pressed={block.view === v} onClick={() => applySheet((s) => so.setBlockView(s, blockId, v))}>
              {t(`sheet.view.${v}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="swatches" role="group" aria-label={t('sheet.width')}>
        <span className="swatches-label">{t('sheet.width')}</span>
        <div className="segmented segmented-sm">
          {WIDTHS.map(([w, label]) => (
            <button
              key={w}
              className={cls(place.w === w && 'is-on')}
              aria-pressed={place.w === w}
              onClick={() => applySheet((s) => so.placeBlock(s, blockId, { ...place, w }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {custom && (
        <button className="text-btn" onClick={() => applySheet((s) => so.resetSheetStyle(s, key))}>
          {t('tool.reset')}
        </button>
      )}
    </div>
  );
}

function IdentityControls({ sheet }: { sheet: PersonaSheet }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const applySheet = useStore((s) => s.applySheet);
  const identity = sheetIdentity(project, sheet);
  const tint = identity.style?.bg ?? PERSONA_PALETTE[identity.color % PERSONA_PALETTE.length].tint;
  const custom = sheet.styles.identity;
  return (
    <div className="style-controls">
      <span className="badge">{t('kind.identity')}</span>
      <Swatches label={t('tool.fill')} list={[tint, ...FILL_SWATCHES.filter((c) => c !== tint)]} value={custom?.bg ?? tint} variant="fill" onPick={(bg, live) => applySheet((s) => so.setSheetStyle(s, 'identity', { bg }), live ? { coalesce: 'style:identity' } : undefined)} />
      {identity.synced ? (
        <span className="hint">{t('sheet.syncHint')}</span>
      ) : (
        <div className="swatches" role="group" aria-label={t('sheet.color')}>
          <span className="swatches-label">{t('sheet.color')}</span>
          {PERSONA_PALETTE.map((p, i) => (
            <button key={p.color} className={cls('swatch', identity.color === i && 'is-on')} style={{ background: p.color }} aria-label={`${t('sheet.color')} ${i + 1}`} aria-pressed={identity.color === i} onClick={() => applySheet((s) => so.setIdentity(s, { color: i }))} />
          ))}
        </div>
      )}
      {custom && (
        <button className="text-btn" onClick={() => applySheet((s) => so.resetSheetStyle(s, 'identity'))}>
          {t('tool.reset')}
        </button>
      )}
    </div>
  );
}
