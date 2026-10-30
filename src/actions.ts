// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { activeMap, t, useStore } from './store';
import { isDesktop, openProject, saveExport, saveProject } from './lib/fileio';
import { boardRef } from './components/Board';
import { nextFrame, renderBoardCanvas, type BoardLayout, type RenderOptions } from './lib/exportImage';
import { crop, pdfDocument, planPhasePages, type PdfLayout } from './lib/exportPdf';
import { pptxDocument, type Slide } from './lib/exportPptx';
import { copyPng, jpegBlob, pngBlob, type ExportFormat } from './lib/exportFormats';
import { buildCsv } from './lib/exportCsv';
import { ProjectFileError } from './model/serialize';
import { createFlowDoc, createFlowProject, createFromTemplate, createMap, createSheet, createSheetProject, sheetDoc, type FlowTemplateId, type SheetTemplateId, type TemplateId } from './model/templates';
import { addDoc, findDoc, missionMapOf, removeDoc, sheetIdentity } from './model/project';
import type { Id, MissionMapDoc, Project } from './model/types';
import { uid } from './model/ops';
import { collectNotes } from './model/ops';

function report(err: unknown) {
  if (err instanceof ProjectFileError) window.alert(t(err.reason === 'newer' ? 'file.newer' : 'file.invalid'));
  else window.alert(err instanceof Error ? err.message : String(err));
}

export function newProject(template: TemplateId) {
  const { openTab, lang, setNewProjectOpen } = useStore.getState();
  setNewProjectOpen(false);
  openTab(createFromTemplate(template, lang), null);
}

/** Saves the active project; returns false if cancelled or failed. */
/** A new project holding one persona sheet. */
export function newSheetProject(template: SheetTemplateId) {
  const { openTab, lang, setNewProjectOpen } = useStore.getState();
  setNewProjectOpen(false);
  openTab(createSheetProject(template, lang), null);
}

/**
 * Adds persona sheets to the active project: one per persona of
 * `personaIds` (personas of the mission map `mapDocId`), or a standalone
 * sheet when there are none. Shows the first new sheet.
 */
export function addSheets(template: SheetTemplateId, mapDocId: Id | null, personaIds: Id[]) {
  const { applyProject, setDoc, setNewSheet, lang, docId } = useStore.getState();
  let first: Id | null = null;
  applyProject((project) => {
    const map = mapDocId ? missionMapOf(project, mapDocId)?.map : undefined;
    const personas = map ? personaIds.map((id) => map.personas.find((p) => p.id === id)).filter((p) => p !== undefined) : [];
    const docs = personas.length
      ? personas.map((persona) => sheetDoc(createSheet(template, lang, { persona, mapDocId: mapDocId! })))
      : [sheetDoc(createSheet(template, lang))];
    first = docs[0].id;
    // After the current document and the sheets already beside it.
    return docs.reduce<Project>((p, doc) => addDoc(p, doc), project);
  });
  setNewSheet(null);
  if (first) setDoc(first);
  else if (docId) setDoc(docId);
}

/** A new project holding one flow. */
export function newFlowProject(template: FlowTemplateId) {
  const { openTab, lang, setNewProjectOpen } = useStore.getState();
  setNewProjectOpen(false);
  openTab(createFlowProject(template, lang), null);
}

/** Adds a flow to the active project and shows it. */
export function addFlow(template: FlowTemplateId) {
  const { applyProject, setDoc, setNewFlowOpen, lang, project } = useStore.getState();
  const count = project.docs.filter((d) => d.kind === 'flow').length;
  // A second flow gets a number, so the tabs tell them apart.
  const doc = createFlowDoc(template, lang, count ? String(count + 1) : '');
  applyProject((p) => addDoc(p, doc));
  setNewFlowOpen(false);
  setDoc(doc.id);
}

/** Adds a map to the active project and shows it. */
export function addMap(template: TemplateId) {
  const { applyProject, setDoc, setNewMapOpen, lang, project } = useStore.getState();
  const count = project.docs.filter((d) => d.kind === 'mission-map').length;
  // A second map gets a number, so the tabs tell them apart.
  const doc: MissionMapDoc = { id: uid(), kind: 'mission-map', name: count ? `${t('doc.missionMap')} ${count + 1}` : '', map: createMap(template, lang) };
  applyProject((p) => addDoc(p, doc));
  setNewMapOpen(false);
  setDoc(doc.id);
}

/**
 * Runs `fn` with the spinner up, labelled `label`: for an image being read
 * or an export, which can take a moment, save dialog included.
 */
export async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const { setBusy } = useStore.getState();
  setBusy(label);
  // Let the spinner paint before the work blocks the page.
  await nextFrame();
  try {
    return await fn();
  } finally {
    setBusy(null);
  }
}

/** The name a document's tab shows. */
export function docLabel(project: Project, id: Id): string {
  const doc = findDoc(project, id);
  if (!doc) return '';
  if (doc.kind === 'mission-map') return doc.name || t('doc.missionMap');
  if (doc.kind === 'flow') return doc.name ? t('flow.named', { name: doc.name }) : t('flow.default');
  return t('doc.sheet', { name: sheetIdentity(project, doc.sheet).name || t('doc.unnamed') });
}

/** Removes a document from the active project, after asking. */
export function removeDocument(id: Id) {
  const { project, applyProject } = useStore.getState();
  if (project.docs.length <= 1) return;
  if (!window.confirm(t('doc.confirmRemove', { name: docLabel(project, id) }))) return;
  applyProject((p) => removeDoc(p, id));
}

export async function save(saveAs = false): Promise<boolean> {
  const { project, filePath, markSaved, activeId } = useStore.getState();
  if (!activeId) return false;
  try {
    const path = await saveProject(project, filePath, saveAs);
    // On desktop no path means the dialog was cancelled. In a browser the
    // file is downloaded: there is no path to remember.
    if (isDesktop && !path) return false;
    markSaved(path);
    return true;
  } catch (err) {
    report(err);
    return false;
  }
}

export async function open() {
  try {
    const result = await openProject();
    if (!result) return;
    const { tabs, filePath, activeId, switchTab, openTab } = useStore.getState();
    // Already open: just bring it to the front.
    const existing = result.path
      ? (activeId && filePath === result.path ? activeId : tabs.find((tab) => tab.filePath === result.path)?.id)
      : undefined;
    if (existing) switchTab(existing);
    else openTab(result.project, result.path);
  } catch (err) {
    report(err);
  }
}

export function closeTab(id: string) {
  const s = useStore.getState();
  const tab = id === s.activeId ? { project: s.project, dirty: s.dirty } : s.tabs.find((x) => x.id === id);
  if (!tab) return;
  const name = tab.project.title || t('app.untitled');
  if (tab.dirty && !window.confirm(t('confirm.closeTab', { name }))) return;
  s.closeTab(id);
}

export interface ExportOptions extends RenderOptions {
  format: ExportFormat;
  pdfLayout: PdfLayout;
  /** PDF in pages: an overview of the whole board first. */
  overview: boolean;
  /** PDF: the activity notes as an appendix. */
  notes: boolean;
  /** PowerPoint: the active document only, or every document of the project. */
  slides: 'doc' | 'project';
  /** PowerPoint: a map gets one slide per phase rather than one for the whole map. */
  slidePhases: boolean;
}

/** Renders the board for an image export, without selection ring or focus. */
async function renderForExport(opts: RenderOptions): Promise<{ canvas: HTMLCanvasElement; layout: BoardLayout }> {
  const node = boardRef.current;
  if (!node) throw new Error(t('file.exportFailed'));
  const { sel, select } = useStore.getState();
  select(null);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  await nextFrame();
  await nextFrame();
  try {
    return await renderBoardCanvas(node, opts);
  } finally {
    select(sel);
  }
}

/** Exports the active project; returns false if it failed. */
export function exportBoard(opts: ExportOptions): Promise<boolean> {
  return withBusy(t('export.working'), () => exportNow(opts));
}

async function exportNow(opts: ExportOptions): Promise<boolean> {
  const state = useStore.getState();
  const doc = activeMap(state);
  const { lang } = state;
  // Sheets and flows export as one picture, named after the project and the document.
  const single = findDoc(state.project, state.docId)?.kind !== 'mission-map';
  const projectTitle = state.project.title || t('app.untitled');
  const title = single ? `${projectTitle} - ${docLabel(state.project, state.docId)}` : projectTitle;
  try {
    if (opts.format === 'csv') {
      const labels = { objective: t('board.objective'), phases: t('board.phases'), steps: t('export.csvSteps'), storyboard: t('sb.title'), note: t('note.title'), or: t('board.or'), info: t('info.title') };
      const csv = buildCsv(doc, labels, lang === 'fr' ? ';' : ',');
      await saveExport(new Blob([csv], { type: 'text/csv;charset=utf-8' }), title, 'csv', t('file.csv'));
      return true;
    }
    if (opts.format === 'pptx') {
      const slides = await renderSlides(opts);
      const name = opts.slides === 'project' ? projectTitle : title;
      await saveExport(await pptxDocument(name, slides), name, 'pptx', t('file.pptx'));
      return true;
    }
    const { canvas, layout } = await renderForExport(opts);
    if (opts.format === 'png') await saveExport(await pngBlob(canvas), title, 'png', t('file.png'));
    else if (opts.format === 'jpeg') await saveExport(await jpegBlob(canvas), title, 'jpg', t('file.jpeg'));
    else {
      const pdf = await pdfDocument({
        canvas,
        scale: opts.scale,
        layout,
        title,
        mode: single ? 'fit' : opts.pdfLayout,
        overview: opts.overview,
        notes: opts.notes && !single ? collectNotes(doc) : [],
        labels: {
          page: (n, total) => t('pdf.page', { n, total }),
          steps: (from, to) => t('pdf.steps', { from, to }),
          step: (n) => t('pdf.step', { n }),
          phase: (n) => t('pdf.phase', { n }),
          overview: t('pdf.overview'),
          notes: t('pdf.notes'),
        },
      });
      await saveExport(pdf, title, 'pdf', t('file.pdf'));
    }
    return true;
  } catch (err) {
    report(err);
    return false;
  }
}

/**
 * The slides of a PowerPoint export: each document is shown in turn and
 * pictured; a map is cut into its phases when asked. The document that was
 * open is shown again at the end.
 */
async function renderSlides(opts: ExportOptions): Promise<Slide[]> {
  const { project, docId, setDoc } = useStore.getState();
  const docs = opts.slides === 'project' ? project.docs : project.docs.filter((d) => d.id === docId);
  const slides: Slide[] = [];
  try {
    for (const doc of docs) {
      setDoc(doc.id);
      await nextFrame();
      await document.fonts?.ready;
      const { canvas, layout } = await renderForExport(opts);
      const label = docLabel(project, doc.id);
      const objective = doc.kind === 'mission-map' ? layout.objective : undefined;
      if (doc.kind === 'mission-map' && opts.slidePhases && layout.phases.length > 0) {
        for (const p of planPhasePages(layout)) {
          const image = crop(canvas, opts.scale, [{ x0: 0, x1: layout.stripRight }, p], p.top, layout.height);
          slides.push({ title: `${label} · ${p.title || t('pdf.phase', { n: p.index + 1 })}`, subtitle: objective, image });
        }
      } else {
        slides.push({ title: label, image: canvas });
      }
    }
  } finally {
    setDoc(docId);
  }
  return slides;
}

/** Copies the board as a PNG; must be called from the click handler itself. */
export function copyBoard(opts: RenderOptions): Promise<void> {
  return copyPng(renderForExport(opts).then((r) => pngBlob(r.canvas)));
}
