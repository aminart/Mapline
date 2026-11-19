// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from 'react';
import { useT } from '../store';
import { answerConfirm, usePendingConfirm } from '../lib/confirm';
import { cls } from './cls';

/** The question asked by askConfirm, in a dialog like the app's others; its safe answer has the focus. */
export function ConfirmDialog() {
  const t = useT();
  const request = usePendingConfirm();
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!request && dialog.open) dialog.close();
  }, [request]);
  return (
    <dialog
      ref={ref}
      className="dialog confirm-dialog"
      role="alertdialog"
      aria-describedby="confirm-message"
      onClose={() => answerConfirm(false)}
      onClick={(e) => {
        if (e.target === ref.current) answerConfirm(false);
      }}
    >
      {request && (
        <div className="dialog-body">
          <p id="confirm-message" className="confirm-message">
            {request.message}
          </p>
          <div className="dialog-actions">
            <button ref={cancelRef} className="btn" onClick={() => answerConfirm(false)}>
              {t('new.cancel')}
            </button>
            <button className={cls('btn btn-primary', request.danger && 'btn-danger')} onClick={() => answerConfirm(true)}>
              {request.confirm}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
