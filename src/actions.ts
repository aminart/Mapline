// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { activeMap, t, useStore } from './store';
import { isDesktop, openProject, saveExport, saveProject } from './lib/fileio';
import { boardRef } from './components/Board';
import { layoutOffset, measureLayout, nextFrame, renderBoardCanvas, withExportLayout, type BoardLayout, type RenderOptions } from './lib/exportImage';
import { boardShapes, sliceShapes, type Shape } from './lib/boardShapes';
import { crop, pdfDocument, planPhasePages, sitemapPdfDocument, type BranchArea, type PdfLayout, type SitemapPdfLayout } from './lib/exportPdf';
import { sitemapStats } from './model/sitemap';
import { pptxDocument, type Slide } from './lib/exportPptx';
import { copyPng, jpegBlob, pngBlob, type ExportFormat } from './lib/exportFormats';
import { buildCsv } from './lib/exportCsv';
import { ProjectFileError } from './model/serialize';
import { createFlowDoc, createFlowProject, createFromTemplate, createMap, createSheet, createSheetProject, createSitemapDoc, createSitemapProject, sheetDoc, type FlowTemplateId, type SheetTemplateId, type TemplateId } from './model/templates';
import { addDoc, duplicateMap, findDoc, missionMapOf, removeDoc, sheetIdentity, type CopyKind } from './model/project';
import type { Id, MissionMapDoc, Project, Sitemap } from './model/types';
import { withLinksKept } from './model/links';
import { uid } from './model/ops';
import { makeTarget } from './model/states';
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

/** A new project holding one sitemap. */
export function newSitemapProject() {
  const { openTab, lang, setNewProjectOpen } = useStore.getState();
  setNewProjectOpen(false);
  const project = createSitemapProject(lang);
  openTab(project, null);
  const doc = project.docs[0];
  if (doc?.kind === 'sitemap') useStore.getState().focusLater(`screen:${doc.sitemap.roots[0].id}`);
}

/** Adds a sitemap to the active project and shows it, its first screen ready to be named. */
export function addSitemap() {
  const { applyProject, setDoc, project, focusLater } = useStore.getState();
  const count = project.docs.filter((d) => d.kind === 'sitemap').length;
  const doc = createSitemapDoc(count ? String(count + 1) : '');
  applyProject((p) => addDoc(p, doc));
  setDoc(doc.id);
  focusLater(`screen:${doc.sitemap.roots[0].id}`);
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

/** Copies a map of the active project (all of it, or only its personas) and shows the copy. */
export function duplicateMapDoc(id: Id, kind: CopyKind) {
  const { applyProject, setDoc, setNewMapOpen, project } = useStore.getState();
  if (!missionMapOf(project, id)) return;
  let made: Id | null = null;
  applyProject((p) => {
    const r = duplicateMap(p, id, t('map.copyName', { name: docLabel(p, id) }), kind);
    made = r.docId;
    return r.project;
  });
  setNewMapOpen(false);
  if (made) setDoc(made);
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
  if (doc.kind === 'sitemap') return doc.name ? t('sitemap.named', { name: doc.name }) : t('sitemap.default');
  return t('doc.sheet', { name: sheetIdentity(project, doc.sheet).name || t('doc.unnamed') });
}

/** Copies a map or a flow as its target state, and shows the copy. */
export function makeTargetDoc(id: Id) {
  const { project, applyProject, setDoc } = useStore.getState();
  const doc = findDoc(project, id);
  if (!doc || doc.kind === 'persona' || doc.kind === 'sitemap') return;
  const name = doc.name || (doc.kind === 'mission-map' ? t('doc.missionMap') : '');
  let made: Id | null = null;
  applyProject((p) => {
    const r = makeTarget(p, id, name ? t('state.targetName', { name }) : t('state.targetWord'));
    made = r.docId;
    return r.project;
  });
  if (made) setDoc(made);
}

/** Removes a document from the active project, after asking. */
export function removeDocument(id: Id) {
  const { project, applyProject } = useStore.getState();
  if (project.docs.length <= 1) return;
  if (!window.confirm(t('doc.confirmRemove', { name: docLabel(project, id) }))) return;
  applyProject((p) => withLinksKept(p, (q) => removeDoc(q, id)));
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
  /** PowerPoint: boxes and texts that can be edited, or a picture of each page. */
  slideMode: 'edit' | 'image';
  /** PDF of a sitemap: all of it on one page, or a page per branch after it. */
  sitemapPages: 'fit' | 'branches';
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
    const sitemapDoc = findDoc(state.project, state.docId);
    if (opts.format === 'pdf' && sitemapDoc?.kind === 'sitemap' && opts.sitemapPages === 'branches') {
      await exportSitemapPdf(opts, title, sitemapDoc.sitemap);
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

/** Where the tree, its branches and the global screens are on the sitemap as rendered. */
function measureSitemap(doc: HTMLElement, width: number, height: number, summary: string): SitemapPdfLayout {
  const origin = layoutOffset(doc);
  const at = (el: HTMLElement) => {
    const o = layoutOffset(el);
    return { x: o.x - origin.x, y: o.y - origin.y };
  };
  const tree = doc.querySelector<HTMLElement>('.sitemap-tree');
  const rail = doc.querySelector<HTMLElement>('.sitemap-rail');
  const globals = doc.querySelector<HTMLElement>('.sitemap-globals:not(.no-export)');
  const treeAt = tree ? at(tree) : { x: 0, y: 0 };
  const branches = tree ? (JSON.parse(tree.dataset.branches ?? '[]') as BranchArea[]) : [];
  const place = (b: BranchArea): BranchArea => ({
    name: b.name || t('sitemap.untitled'),
    x0: b.x0 + treeAt.x,
    x1: b.x1 + treeAt.x,
    top: b.top + treeAt.y,
    bottom: b.bottom + treeAt.y,
    children: b.children.map(place),
  });
  return {
    width,
    height,
    treeTop: treeAt.y,
    treeBottom: tree ? treeAt.y + tree.offsetHeight : 0,
    railRight: rail ? treeAt.x + rail.offsetWidth : 0,
    branches: branches.map(place),
    globals: globals ? { top: at(globals).y, bottom: at(globals).y + globals.offsetHeight } : null,
    summary,
  };
}

/** A sitemap in PDF, a page per branch: drawn as a tree, whatever the view shown. */
async function exportSitemapPdf(opts: ExportOptions, title: string, sitemap: Sitemap) {
  const { sitemapView, setSitemapView } = useStore.getState();
  if (sitemapView !== 'tree') setSitemapView('tree');
  try {
    const { canvas, layout } = await renderForExport(opts);
    const doc = boardRef.current;
    if (!doc) throw new Error(t('file.exportFailed'));
    const stats = sitemapStats(sitemap);
    const summary = `${stats.total} ${t('sitemap.total')} · ${t('sitemap.toDo', { views: stats.status.new + stats.status.redo, extras: stats.extrasToDo })}`;
    const pdf = await sitemapPdfDocument({
      canvas,
      scale: opts.scale,
      layout: measureSitemap(doc, layout.width, layout.height, summary),
      title,
      labels: {
        page: (n, total) => t('pdf.page', { n, total }),
        steps: (from, to) => t('pdf.steps', { from, to }),
        step: (n) => t('pdf.step', { n }),
        phase: (n) => t('pdf.phase', { n }),
        overview: t('pdf.overview'),
        notes: t('pdf.notes'),
        branch: (name) => t('pdf.branch', { name }),
        globals: t('pdf.globals'),
      },
    });
    await saveExport(pdf, title, 'pdf', t('file.pdf'));
  } finally {
    if (sitemapView !== 'tree') setSitemapView(sitemapView);
  }
}

/** The board as shapes, laid out for export, without selection ring or focus. */
async function shapesForExport(opts: RenderOptions): Promise<{ shapes: Shape[]; layout: BoardLayout }> {
  const node = boardRef.current;
  if (!node) throw new Error(t('file.exportFailed'));
  const { sel, select } = useStore.getState();
  select(null);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  await nextFrame();
  await nextFrame();
  try {
    return await withExportLayout(node, opts, () => ({ shapes: boardShapes(node), layout: measureLayout(node) }));
  } finally {
    select(sel);
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
      const label = docLabel(project, doc.id);
      const phases = doc.kind === 'mission-map' && opts.slidePhases;
      if (opts.slideMode === 'edit') {
        const { shapes, layout } = await shapesForExport(opts);
        if (phases && layout.phases.length > 0) {
          for (const p of planPhasePages(layout)) {
            const parts = [{ x0: 0, x1: layout.stripRight }, p];
            const list = sliceShapes(shapes, parts, p.top);
            slides.push({ title: `${label} · ${p.title || t('pdf.phase', { n: p.index + 1 })}`, subtitle: layout.objective, shapes: { list, width: layout.stripRight + p.x1 - p.x0, height: layout.height - p.top } });
          }
        } else {
          slides.push({ title: label, shapes: { list: shapes, width: layout.width, height: layout.height } });
        }
        continue;
      }
      const { canvas, layout } = await renderForExport(opts);
      if (phases && layout.phases.length > 0) {
        for (const p of planPhasePages(layout)) {
          const image = crop(canvas, opts.scale, [{ x0: 0, x1: layout.stripRight }, p], p.top, layout.height);
          slides.push({ title: `${label} · ${p.title || t('pdf.phase', { n: p.index + 1 })}`, subtitle: layout.objective, image });
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
