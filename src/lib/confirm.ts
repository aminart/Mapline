// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

// Questions asked before a step that loses something: in Mapline's own dialog, like the app's
// other windows, rather than the system's confirm box.

import { useSyncExternalStore } from 'react';

export interface ConfirmRequest {
  message: string;
  /** The button that goes ahead, named after what it does: « Supprimer », « Fermer »… */
  confirm: string;
  /** Red when going ahead removes something. */
  danger?: boolean;
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Shows the question; resolves to true when the user goes ahead, false on Annuler or Échap. */
export function askConfirm(request: ConfirmRequest): Promise<boolean> {
  // A question still open is answered « no » before the new one replaces it.
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { ...request, resolve };
    notify();
  });
}

/** Answers the open question and closes it. */
export function answerConfirm(ok: boolean) {
  const p = pending;
  pending = null;
  notify();
  p?.resolve(ok);
}

export function usePendingConfirm(): ConfirmRequest | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
  );
}
