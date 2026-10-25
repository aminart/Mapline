// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useStore, useT } from '../store';
import { linkedPersona, missionMapOf, personaFootprint, sheetIdentity, sheetOf } from '../model/project';
import { DEFAULT_LEVEL } from '../model/sheet';
import { personaAccent, tagColor } from '../model/theme';
import type { SheetBlock } from '../model/types';
import { CloseIcon } from './Icons';

/** A persona's sheet, summed up beside the mission map. */
export function SheetPreview() {
  const t = useT();
  const id = useStore((s) => s.sheetPreview);
  const project = useStore((s) => s.project);
  const setSheetPreview = useStore((s) => s.setSheetPreview);
  const setDoc = useStore((s) => s.setDoc);
  const doc = id ? sheetOf(project, id) : undefined;
  if (!doc) return null;
  const { sheet } = doc;
  const identity = sheetIdentity(project, sheet);
  const { accent, onAccent } = personaAccent(identity.color, identity.style);
  const linked = linkedPersona(project, sheet);
  const map = linked ? missionMapOf(project, linked.mapDocId)?.map : undefined;
  const footprint = map && linked ? personaFootprint(map, linked.persona.id) : null;
  const fields = sheet.fields.filter((f) => f.value.trim());
  const blocks = sheet.blocks.filter(hasContent);
  return (
    <aside className="sheet-preview" aria-label={t('sheet.preview')}>
      <div className="sheet-preview-head">
        <span className="eyebrow">{t('sheet.preview')}</span>
        <button className="icon-btn" aria-label={t('sheet.closePreview')} title={t('sheet.closePreview')} onClick={() => setSheetPreview(null)}>
          <CloseIcon size={13} />
        </button>
      </div>
      <div className="sheet-preview-id">
        <span className="sheet-preview-avatar" style={{ background: accent, color: onAccent }}>
          {sheet.photo ? <img src={sheet.photo} alt="" /> : (identity.name || '?').charAt(0).toUpperCase()}
        </span>
        <div>
          <strong>{identity.name || t('doc.unnamed')}</strong>
          {identity.role && <span className="muted-sm">{identity.role}</span>}
        </div>
      </div>
      {fields.length > 0 && (
        <dl className="sheet-preview-fields">
          {fields.map((f) => (
            <div key={f.id}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {sheet.quote.trim() && <blockquote className="sheet-preview-quote">{sheet.quote}</blockquote>}
      {sheet.tags.length > 0 && (
        <div className="sheet-chips">
          {sheet.tags.map((tag) => {
            const c = tagColor(tag, {});
            return (
              <span key={tag} className="tag" style={{ background: c.bg, color: c.fg }}>
                {tag}
              </span>
            );
          })}
        </div>
      )}
      {blocks.map((b) => (
        <PreviewBlock key={b.id} block={b} />
      ))}
      {footprint && (
        <div className="sheet-preview-block">
          <span className="sheet-preview-title">{t('sheet.presence')}</span>
          <span>{t('sheet.footprint', { steps: footprint.steps, acts: footprint.activities })}</span>
          {footprint.tags.length > 0 && <span className="muted-sm">{footprint.tags.slice(0, 4).map((x) => `${x.tag} (${x.count})`).join(' · ')}</span>}
        </div>
      )}
      <button className="btn btn-primary sheet-preview-open" onClick={() => setDoc(doc.id)}>
        {t('sheet.open')}
      </button>
    </aside>
  );
}

const filled = (b: SheetBlock) => b.items.filter((i) => i.text.trim());
const hasContent = (b: SheetBlock) => (b.view === 'text' ? b.text.trim() !== '' : filled(b).length > 0);

/** A block of the sheet, read only, in the view it has on the sheet. */
function PreviewBlock({ block }: { block: SheetBlock }) {
  const items = filled(block);
  return (
    <div className="sheet-preview-block" data-view={block.view}>
      <span className="sheet-preview-title" style={{ color: block.accent }}>
        {block.title}
      </span>
      {block.view === 'list' && (
        <ul>
          {items.map((i) => (
            <li key={i.id}>{i.text}</li>
          ))}
        </ul>
      )}
      {block.view === 'tags' && (
        <div className="sheet-chips">
          {items.map((i) => (
            <span key={i.id} className="tag" style={{ background: `${block.accent}1A`, color: block.accent }}>
              {i.text}
            </span>
          ))}
        </div>
      )}
      {block.view === 'gauges' &&
        items.map((i) => (
          <div key={i.id} className="sheet-preview-gauge">
            <span>{i.text}</span>
            <div className="sheet-gauge-track" role="meter" aria-label={i.text} aria-valuenow={i.level ?? DEFAULT_LEVEL} aria-valuemin={0} aria-valuemax={100}>
              <div className="sheet-gauge-fill" style={{ width: `${i.level ?? DEFAULT_LEVEL}%`, background: block.accent }} />
            </div>
          </div>
        ))}
      {block.view === 'text' && <p className="sheet-preview-text">{block.text}</p>}
    </div>
  );
}
