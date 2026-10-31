// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { saveSession, syncedTabs, t, useStore } from '../store';
import { isDesktop } from './fileio';

/** Titles of open projects with unsaved changes. */
export function unsavedProjects(): string[] {
  return syncedTabs(useStore.getState())
    .filter((tab) => tab.dirty)
    .map((tab) => tab.project.title || t('app.untitled'));
}

/** Asks before the window closes while projects have unsaved changes. */
export async function installCloseGuard(): Promise<void> {
  if (!isDesktop) {
    // Browsers only allow their own generic prompt.
    window.addEventListener('beforeunload', (e) => {
      if (unsavedProjects().length > 0) e.preventDefault();
    });
    return;
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const { ask } = await import('@tauri-apps/plugin-dialog');
  await getCurrentWindow().onCloseRequested(async (event) => {
    const names = unsavedProjects();
    if (names.length === 0) return;
    const quit = await ask(t('confirm.quit', { names: names.map((n) => `• ${n}`).join('\n') }), {
      title: 'Mapline',
      kind: 'warning',
      okLabel: t('confirm.quitAnyway'),
      cancelLabel: t('new.cancel'),
    });
    if (quit) await saveSession();
    else event.preventDefault();
  });
}
