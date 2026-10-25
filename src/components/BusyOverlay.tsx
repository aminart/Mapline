// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useStore, useT } from '../store';

/** A spinner over the app while an image is read or an export is made. */
export function BusyOverlay() {
  const t = useT();
  const busy = useStore((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="busy" role="status" aria-live="polite" aria-label={t('busy.label')}>
      <div className="busy-card">
        <span className="spinner" aria-hidden="true" />
        <span>{busy}</span>
      </div>
    </div>
  );
}
