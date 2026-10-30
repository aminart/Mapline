// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from 'react';
import { useMap, useStore, useT } from '../store';
import { copyBoard, exportBoard, type ExportOptions } from '../actions';
import type { ExportFormat } from '../lib/exportFormats';
import type { PdfLayout } from '../lib/exportPdf';
import { collectNotes } from '../model/ops';
import { findDoc } from '../model/project';
import type { MessageKey } from '../i18n';
import { cls } from './cls';

const OPTIONS_KEY = 'mapline:export';
const FORMATS: ExportFormat[] = ['png', 'jpeg', 'pdf', 'pptx', 'csv'];
const SCALES = [1, 2, 3];

const DEFAULTS: ExportOptions = { format: 'png', scale: 2, transparent: false, storyboard: true, info: true, pdfLayout: 'a4', overview: true, notes: true, slides: 'project', slidePhases: true, slideMode: 'edit' };
const PDF_LAYOUTS: PdfLayout[] = ['single', 'a4', 'a3', 'phases'];

function loadOptions(): ExportOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}') as Partial<ExportOptions>;
    return {
      format: FORMATS.includes(saved.format as ExportFormat) ? (saved.format as ExportFormat) : DEFAULTS.format,
      scale: SCALES.includes(saved.scale ?? 0) ? saved.scale! : DEFAULTS.scale,
      transparent: saved.transparent === true,
      storyboard: saved.storyboard !== false,
      info: saved.info !== false,
      pdfLayout: PDF_LAYOUTS.includes(saved.pdfLayout as PdfLayout) ? (saved.pdfLayout as PdfLayout) : DEFAULTS.pdfLayout,
      overview: saved.overview !== false,
      notes: saved.notes !== false,
      slides: saved.slides === 'doc' ? 'doc' : 'project',
      slidePhases: saved.slidePhases !== false,
      slideMode: saved.slideMode === 'image' ? 'image' : 'edit',
    };
  } catch {
    return DEFAULTS;
  }
}

export function ExportDialog() {
  const t = useT();
  const isOpen = useStore((s) => s.exportOpen);
  const setOpen = useStore((s) => s.setExportOpen);
  const hasStoryboard = useMap((m) => m.storyboard);
  const hasInfo = useMap((m) => m.textRows.length > 0);
  const noteCount = useMap((m) => collectNotes(m).length);
  const ref = useRef<HTMLDialogElement>(null);
  const [opts, setOpts] = useState<ExportOptions>(loadOptions);
  // Sheets and flows: one picture, no table.
  const isSheet = useStore((s) => findDoc(s.project, s.docId)?.kind !== 'mission-map');
  const docCount = useStore((s) => s.project.docs.length);
  const mapCount = useStore((s) => s.project.docs.filter((d) => d.kind === 'mission-map').length);
  // A sheet has no table to export, and fits on one page.
  const formats = isSheet ? FORMATS.filter((f) => f !== 'csv') : FORMATS;
  const shown: ExportOptions = isSheet ? { ...opts, format: opts.format === 'csv' ? 'png' : opts.format, pdfLayout: 'fit' } : opts;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      setStatus(null);
      dialog.showModal();
    }
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const update = (patch: Partial<ExportOptions>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    } catch {
      // Remembering the choice is a nicety.
    }
  };

  const isImage = shown.format !== 'csv';
  const render = { scale: opts.scale, transparent: shown.format === 'png' && opts.transparent, storyboard: opts.storyboard, info: opts.info };
  // JPEG, PDF and slides have no transparency: square corners on white.
  const flat = shown.format === 'jpeg' || shown.format === 'pdf' || shown.format === 'pptx';
  const slides = docCount > 1 ? opts.slides : 'doc';
  // One slide per phase is offered when the slides include a map.
  const slideMaps = slides === 'project' ? mapCount > 0 : !isSheet;

  const onExport = async () => {
    setBusy(true);
    setStatus(t('export.working'));
    // Close first so the dialog isn't over the board while it is captured.
    setOpen(false);
    await exportBoard({ ...shown, ...render, flat, slides });
    setBusy(false);
  };

  const onCopy = () => {
    setBusy(true);
    setStatus(t('export.working'));
    useStore.getState().setBusy(t('export.working'));
    // Called straight from the click so the clipboard accepts it.
    copyBoard(render)
      .then(() => setStatus(t('export.copied')))
      .catch((err: unknown) => setStatus(t('export.copyFailed', { msg: err instanceof Error ? err.message : String(err) })))
      .finally(() => {
        setBusy(false);
        useStore.getState().setBusy(null);
      });
  };

  return (
    <dialog
      ref={ref}
      className="dialog dialog-narrow"
      aria-labelledby="export-title"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        if (e.target === ref.current) setOpen(false);
      }}
    >
      <div className="dialog-body">
        <h2 id="export-title">{t('export.title')}</h2>

        <fieldset className="field-group">
          <legend>{t('export.format')}</legend>
          <div className="format-grid">
            {formats.map((f) => (
              <label key={f} className={cls('format-option', shown.format === f && 'is-on')}>
                <input type="radio" name="export-format" value={f} checked={shown.format === f} onChange={() => update({ format: f })} />
                <span className="format-name">{t(`export.${f}` as MessageKey)}</span>
                <span className="muted-sm">{t(`export.${f}.desc` as MessageKey)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {isImage && (
          <div className="export-options">
            {!(shown.format === 'pptx' && opts.slideMode === 'edit') && (
              <fieldset className="field-group">
                <legend>{t('export.resolution')}</legend>
                <div className="segmented segmented-sm">
                  {SCALES.map((n) => (
                    <button key={n} type="button" className={cls(opts.scale === n && 'is-on')} aria-pressed={opts.scale === n} onClick={() => update({ scale: n })}>
                      ×{n}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {shown.format === 'png' && (
              <fieldset className="field-group">
                <legend>{t('export.background')}</legend>
                <div className="segmented segmented-sm">
                  <button type="button" className={cls(!opts.transparent && 'is-on')} aria-pressed={!opts.transparent} onClick={() => update({ transparent: false })}>
                    {t('export.white')}
                  </button>
                  <button type="button" className={cls(opts.transparent && 'is-on')} aria-pressed={opts.transparent} onClick={() => update({ transparent: true })}>
                    {t('export.transparent')}
                  </button>
                </div>
              </fieldset>
            )}
            {shown.format === 'pdf' && !isSheet && (
              <fieldset className="field-group">
                <legend>{t('export.pages')}</legend>
                <div className="segmented segmented-sm">
                  {PDF_LAYOUTS.map((l) => (
                    <button key={l} type="button" className={cls(shown.pdfLayout === l && 'is-on')} aria-pressed={shown.pdfLayout === l} onClick={() => update({ pdfLayout: l })}>
                      {t(`export.pages.${l}` as MessageKey)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {shown.format === 'pptx' && (
              <fieldset className="field-group">
                <legend>{t('export.slideMode')}</legend>
                <div className="segmented segmented-sm">
                  {(['edit', 'image'] as const).map((v) => (
                    <button key={v} type="button" className={cls(opts.slideMode === v && 'is-on')} aria-pressed={opts.slideMode === v} onClick={() => update({ slideMode: v })}>
                      {t(`export.slideMode.${v}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {shown.format === 'pptx' && docCount > 1 && (
              <fieldset className="field-group">
                <legend>{t('export.slides')}</legend>
                <div className="segmented segmented-sm">
                  {(['doc', 'project'] as const).map((v) => (
                    <button key={v} type="button" className={cls(slides === v && 'is-on')} aria-pressed={slides === v} onClick={() => update({ slides: v })}>
                      {t(`export.slides.${v}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {shown.format === 'pptx' && slideMaps && (
              <label className="toggle toggle-inline">
                <input type="checkbox" checked={opts.slidePhases} onChange={(e) => update({ slidePhases: e.target.checked })} />
                <span>{t('export.slidePhases')}</span>
              </label>
            )}
            {shown.format === 'pdf' && shown.pdfLayout !== 'single' && (
              <label className="toggle toggle-inline">
                <input type="checkbox" checked={opts.overview} onChange={(e) => update({ overview: e.target.checked })} />
                <span>{t('export.overviewPage')}</span>
              </label>
            )}
            {shown.format === 'pdf' && noteCount > 0 && (
              <label className="toggle toggle-inline">
                <input type="checkbox" checked={opts.notes} onChange={(e) => update({ notes: e.target.checked })} />
                <span>{t('export.notesAppendix', { n: noteCount })}</span>
              </label>
            )}
            {hasStoryboard && (
              <label className="toggle toggle-inline">
                <input type="checkbox" checked={opts.storyboard} onChange={(e) => update({ storyboard: e.target.checked })} />
                <span>{t('export.storyboard')}</span>
              </label>
            )}
            {hasInfo && (
              <label className="toggle toggle-inline">
                <input type="checkbox" checked={opts.info} onChange={(e) => update({ info: e.target.checked })} />
                <span>{t('export.infoRow')}</span>
              </label>
            )}
          </div>
        )}

        <p className="export-status muted-sm" role="status" aria-live="polite">
          {status}
        </p>

        <div className="dialog-actions">
          <button className="btn" onClick={() => setOpen(false)}>
            {t('new.cancel')}
          </button>
          {isImage && shown.format !== 'pptx' && (
            <button className="btn" disabled={busy} onClick={onCopy}>
              {t('export.copy')}
            </button>
          )}
          <button className="btn btn-primary" disabled={busy} onClick={onExport}>
            {t('export.save')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
