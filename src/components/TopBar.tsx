// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore, useT } from '../store';
import { open, save } from '../actions';
import type { Lang } from '../i18n';
import type { ThemePref } from '../lib/appTheme';
import { CheckIcon, DownloadIcon, FolderIcon, LogoIcon, NoteIcon, PlayIcon, PlusIcon, RedoIcon, UndoIcon } from './Icons';
import { projectComments } from '../model/comments';
import { startPresentation } from './Presentation';
import { AboutDialog } from './About';
import { ProjectSwitcher } from './ProjectSwitcher';
import { cls } from './cls';
import { hasNotes, useWhatsNew } from '../lib/whatsNew';

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
    <header className="topbar nn-appbar">
      <div className="nn-appbar-brand">
        <LogoIcon size={32} />
        <span>Mapline</span>
      </div>
      <ProjectSwitcher />
      {/* With no project open, the start screen offers both: the bar doesn't repeat them. */}
      {hasProject && (
        <>
          <button className="btn" onClick={() => setNewProjectOpen(true)} title={`${t('top.newProject')} (Ctrl+N)`} aria-label={t('top.newProject')}>
            <PlusIcon /> <span className="btn-label">{t('top.newProject')}</span>
          </button>
          <button className="btn" onClick={open} title={`${t('top.open')} (Ctrl+O)`} aria-label={t('top.open')}>
            <FolderIcon /> <span className="btn-label">{t('top.open')}</span>
          </button>
        </>
      )}
      <div className="spacer" />
      {hasProject && (
        <>
          <button className="icon-btn icon-btn-lg" aria-label={t('top.undo')} title={`${t('top.undo')} (Ctrl+Z)`} disabled={!canUndo} onClick={undo}>
            <UndoIcon />
          </button>
          <button className="icon-btn icon-btn-lg" aria-label={t('top.redo')} title={`${t('top.redo')} (Ctrl+Shift+Z)`} disabled={!canRedo} onClick={redo}>
            <RedoIcon />
          </button>
          <CommentsButton />
          <button className="btn btn-compact" onClick={startPresentation} title={`${t('present.start')} (F5)`} aria-label={t('present.start')}>
            <PlayIcon size={14} /> <span className="btn-label">{t('present.start')}</span>
          </button>
          <button className="btn btn-compact" onClick={() => setExportOpen(true)} title={`${t('top.export')} (Ctrl+E)`} aria-label={t('top.export')}>
            <DownloadIcon /> <span className="btn-label">{t('top.export')}</span>
          </button>
          <SaveButton />
        </>
      )}
      <div className="nn-appbar-tools">
        <HelpButton />
      </div>
    </header>
  );
}

/** Opens the comments panel; shows how many notes are still to deal with. */
function CommentsButton() {
  const t = useT();
  const open = useStore((s) => s.commentsOpen);
  const setOpen = useStore((s) => s.setCommentsOpen);
  const todo = useStore((s) => projectComments(s.project).filter((c) => !c.resolved).length);
  return (
    <button className={cls('btn comments-btn', open && 'is-on')} aria-pressed={open} onClick={() => setOpen(!open)} title={t('comments.open')} aria-label={t('comments.title')}>
      <NoteIcon size={15} />
      {todo > 0 && <span className="comments-count">{todo}</span>}
    </button>
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
    <button className={cls('btn btn-primary save-btn', flash && 'is-saved')} onClick={() => save()} title={`${t('top.save')} (Ctrl+S)`}>
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
        <summary className="nn-icon-btn" aria-label={t('top.help')} title={t('top.help')}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </summary>
        <div className="help-panel">
          <ThemeSwitch />
          <LangSwitch />
          <h2>{t('side.shortcuts')}</h2>
          <p>{t('side.shortcutsText')}</p>
          {hasNotes() && (
            <button
              className="text-btn help-about"
              onClick={() => {
                if (ref.current) ref.current.open = false;
                useWhatsNew.getState().showLatest();
              }}
            >
              {t('whatsNew.menu')}
            </button>
          )}
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

const THEME_ICONS: Record<ThemePref, ReactNode> = {
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
};

function ThemeIcon({ theme }: { theme: ThemePref }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {THEME_ICONS[theme]}
    </svg>
  );
}

/** Light, dark or as the system, in the help menu (the bar has no room left). */
function ThemeSwitch() {
  const t = useT();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const options: ThemePref[] = ['light', 'dark', 'system'];
  return (
    <div className="theme-switch">
      <h2>{t('top.theme')}</h2>
      <div className="segmented" role="group" aria-label={t('top.theme')}>
        {options.map((o) => (
          <button key={o} className={cls(theme === o && 'is-on')} aria-pressed={theme === o} onClick={() => setTheme(o)}>
            <ThemeIcon theme={o} />
            {t(`top.theme.${o}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** French or English, in the help menu too, so the bar keeps to one line on a 1366 px screen. */
function LangSwitch() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const options: { id: Lang; label: string }[] = [
    { id: 'fr', label: 'FR' },
    { id: 'en', label: 'EN' },
  ];
  return (
    <div className="lang-switch">
      <h2>{t('top.language')}</h2>
      <div className="segmented" role="group" aria-label={t('top.language')}>
        {options.map((o) => (
          <button key={o.id} className={cls(lang === o.id && 'is-on')} aria-pressed={lang === o.id} lang={o.id} onClick={() => setLang(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
