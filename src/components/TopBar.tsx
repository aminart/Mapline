// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../store';
import { open, save } from '../actions';
import type { Lang } from '../i18n';
import { CheckIcon, DownloadIcon, FolderIcon, LogoIcon, PlayIcon, PlusIcon, RedoIcon, UndoIcon } from './Icons';
import { startPresentation } from './Presentation';
import { AboutDialog } from './About';
import { ProjectSwitcher } from './ProjectSwitcher';
import { cls } from './cls';

export function TopBar() {
  const t = useT();
  const hasProject = useStore((s) => s.activeId !== null);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen);
  const setExportOpen = useStore((s) => s.setExportOpen);

  return (
    <header className="topbar">
      <div className="brand">
        <LogoIcon />
        <span>Mapline</span>
      </div>
      <div className="divider" />
      <ProjectSwitcher />
      <button className="btn btn-primary" onClick={() => setNewProjectOpen(true)} title={`${t('top.newProject')} (Ctrl+N)`} aria-label={t('top.newProject')}>
        <PlusIcon /> <span className="btn-label">{t('top.newProject')}</span>
      </button>
      <button className="btn" onClick={open} title={`${t('top.open')} (Ctrl+O)`} aria-label={t('top.open')}>
        <FolderIcon /> <span className="btn-label">{t('top.open')}</span>
      </button>
      <div className="spacer" />
      {hasProject && (
        <>
          <button className="icon-btn icon-btn-lg" aria-label={t('top.undo')} title={`${t('top.undo')} (Ctrl+Z)`} disabled={!canUndo} onClick={undo}>
            <UndoIcon />
          </button>
          <button className="icon-btn icon-btn-lg" aria-label={t('top.redo')} title={`${t('top.redo')} (Ctrl+Shift+Z)`} disabled={!canRedo} onClick={redo}>
            <RedoIcon />
          </button>
          <button className="btn" onClick={startPresentation} title={`${t('present.start')} (F5)`}>
            <PlayIcon size={14} /> {t('present.start')}
          </button>
          <button className="btn" onClick={() => setExportOpen(true)} title={`${t('top.export')} (Ctrl+E)`}>
            <DownloadIcon /> {t('top.export')}
          </button>
          <SaveButton />
        </>
      )}
      <HelpButton />
      <LangSwitch />
    </header>
  );
}

/** Shows "Saved ✓" for a moment after each save, from the button or Ctrl+S. */
function SaveButton() {
  const t = useT();
  const savedAt = useStore((s) => s.savedAt);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 2000);
    return () => clearTimeout(timer);
  }, [savedAt]);
  return (
    <button className={cls('btn btn-strong save-btn', flash && 'is-saved')} onClick={() => save()} title={`${t('top.save')} (Ctrl+S)`}>
      {flash ? (
        <>
          <CheckIcon /> {t('top.saved')}
        </>
      ) : (
        t('top.save')
      )}
    </button>
  );
}

function HelpButton() {
  const t = useT();
  const ref = useRef<HTMLDetailsElement>(null);
  const [about, setAbout] = useState(false);
  useEffect(() => {
    // Close when clicking anywhere else.
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  return (
    <>
      <details className="help" ref={ref}>
        <summary className="icon-btn icon-btn-lg" aria-label={t('side.shortcuts')} title={t('side.shortcuts')}>
          ?
        </summary>
        <div className="help-panel">
          <h2>{t('side.shortcuts')}</h2>
          <p>{t('side.shortcutsText')}</p>
          <button
            className="text-btn help-about"
            onClick={() => {
              if (ref.current) ref.current.open = false;
              setAbout(true);
            }}
          >
            {t('about.open')}
          </button>
        </div>
      </details>
      {/* Outside the details element, which hides its content when closed. */}
      <AboutDialog open={about} onClose={() => setAbout(false)} />
    </>
  );
}

function LangSwitch() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const options: { id: Lang; label: string }[] = [
    { id: 'fr', label: 'FR' },
    { id: 'en', label: 'EN' },
  ];
  return (
    <div className="segmented segmented-sm" role="group" aria-label={t('top.language')}>
      {options.map((o) => (
        <button key={o.id} className={cls(lang === o.id && 'is-on')} aria-pressed={lang === o.id} lang={o.id} onClick={() => setLang(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
