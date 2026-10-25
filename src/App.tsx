// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from 'react';
import { useStore, useT } from './store';
import { closeTab, open, save } from './actions';
import { TopBar } from './components/TopBar';
import { TabBar } from './components/TabBar';
import { FormatToolbar } from './components/FormatToolbar';
import { SheetToolbar } from './components/SheetToolbar';
import { SheetView } from './components/SheetView';
import { FlowView } from './components/FlowView';
import { FlowToolbar } from './components/FlowToolbar';
import { SheetPreview } from './components/SheetPreview';
import { DocBar } from './components/DocBar';
import { NewSheetDialog } from './components/NewSheetDialog';
import { Board } from './components/Board';
import { NewFlowDialog, NewProjectDialog, StartScreen } from './components/Templates';
import { ExportDialog } from './components/ExportDialog';
import { PresentationBar, presentGo, startPresentation, stopPresentation } from './components/Presentation';
import { removeLink } from './model/ops';
import { removeFlowLink } from './model/flow';
import { findDoc } from './model/project';
import { cls } from './components/cls';

/** Clears the selection and leaves the field being edited. */
function deselect() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  useStore.getState().select(null);
}

/** Clicking an empty part of the canvas or board deselects. */
function onCanvasPointerDown(e: React.PointerEvent) {
  const target = e.target as Element;
  if (target.closest('.box, button, input, textarea, select, label, a, .links, .link-label, .ghost, .grip, .note, dialog')) return;
  if (useStore.getState().sel) deselect();
}

/** The document shown in the active tab, by kind. */
function DocView() {
  const activeId = useStore((s) => s.activeId);
  const docId = useStore((s) => s.docId);
  const kind = useStore((s) => findDoc(s.project, s.docId)?.kind);
  switch (kind) {
    case 'mission-map':
      return <Board key={`${activeId}:${docId}`} />;
    case 'persona':
      return <SheetView key={`${activeId}:${docId}`} />;
    case 'flow':
      return <FlowView key={`${activeId}:${docId}`} />;
    default:
      return null;
  }
}

export function App() {
  const t = useT();
  const activeId = useStore((s) => s.activeId);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const lang = useStore((s) => s.lang);
  const presenting = useStore((s) => s.presentStep !== null);
  const kind = useStore((s) => findDoc(s.project, s.docId)?.kind);
  const previewing = useStore((s) => s.sheetPreview !== null) && kind === 'mission-map' && !presenting;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.presentStep !== null) {
        const keys: Record<string, () => void> = {
          ArrowRight: () => presentGo(1),
          ArrowDown: () => presentGo(1),
          PageDown: () => presentGo(1),
          ' ': () => presentGo(1),
          ArrowLeft: () => presentGo(-1),
          ArrowUp: () => presentGo(-1),
          PageUp: () => presentGo(-1),
          Home: () => presentGo('overview'),
          Escape: stopPresentation,
        };
        const run = keys[e.key];
        if (run) {
          e.preventDefault();
          run();
        }
        return;
      }
      if (e.key === 'F5' && s.activeId && findDoc(s.project, s.docId)?.kind === 'mission-map') {
        e.preventDefault();
        startPresentation();
        return;
      }
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && s.sel?.startsWith('link:')) {
        const id = s.sel.slice('link:'.length);
        s.apply((d) => removeLink(d, id));
        s.select(null);
        e.preventDefault();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && s.sel?.startsWith('flink:')) {
        const id = s.sel.slice('flink:'.length);
        s.applyFlow((f) => removeFlowLink(f, id));
        s.select(null);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        if (s.linkFrom) s.setLinkFrom(null);
        else if (s.tool === 'link') s.setTool('select');
        else deselect();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'n') s.setNewProjectOpen(true);
      else if (k === 'o') open();
      else if (!s.activeId) return;
      else if (k === 'z' && !e.shiftKey) s.undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') s.redo();
      else if (k === 's') save(e.shiftKey);
      else if (k === 'w') closeTab(s.activeId);
      else if (k === 'e') s.setExportOpen(true);
      else if (k === '=' || k === '+') s.setZoom(s.zoom + 0.1);
      else if (k === '-') s.setZoom(s.zoom - 0.1);
      else if (k === '0') s.setZoom(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={cls('app', presenting && 'is-presenting', previewing && 'has-preview')}>
      {!presenting && <TopBar />}
      {!presenting && <TabBar />}
      {activeId && !presenting && <DocBar />}
      {activeId && !presenting && (kind === 'persona' ? <SheetToolbar /> : kind === 'flow' ? <FlowToolbar /> : <FormatToolbar />)}
      <div className="workspace">
        <main className="canvas" onPointerDown={onCanvasPointerDown}>
          {activeId ? <DocView /> : <StartScreen />}
        </main>
        {activeId && kind === 'mission-map' && !presenting && <SheetPreview />}
      </div>
      {presenting && <PresentationBar />}
      {activeId && !presenting && (
        <div className="zoom-ctl" role="group" aria-label={t('zoom.label')}>
          <button aria-label={t('zoom.out')} onClick={() => setZoom(zoom - 0.1)}>
            −
          </button>
          <button className="zoom-value" aria-label={t('zoom.reset')} onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)} %
          </button>
          <button aria-label={t('zoom.in')} onClick={() => setZoom(zoom + 0.1)}>
            +
          </button>
        </div>
      )}
      <NewProjectDialog />
      {activeId && <NewSheetDialog />}
      {activeId && <NewFlowDialog />}
      {activeId && <ExportDialog />}
    </div>
  );
}
