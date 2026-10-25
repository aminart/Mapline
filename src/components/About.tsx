// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from 'react';
import { useT } from '../store';
import licenses from '../licenses.json';

/** Bundled npm packages; type declarations are not shipped. */
const PACKAGES = licenses.filter((p) => !p.name.startsWith('@types/'));

/** Version, privacy note, copyright and the licences of what the app is built with. */
export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog dialog-narrow"
      aria-labelledby="about-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-body">
        <h2 id="about-title">Mapline</h2>
        <p className="muted-sm">{t('about.version', { v: __APP_VERSION__ })}</p>
        <p className="about-text">{t('about.local')}</p>
        <p className="about-text">
          <strong>{t('about.copyright')}</strong>
          <br />
          {t('about.gpl')}
        </p>

        <h3 className="about-heading">{t('about.licenses')}</h3>
        <p className="about-text">{t('about.licensesIntro')}</p>
        <div className="about-licenses">
          <table>
            <thead>
              <tr>
                <th>{t('about.component')}</th>
                <th>{t('about.license')}</th>
              </tr>
            </thead>
            <tbody>
              {PACKAGES.map((p) => (
                <tr key={p.name}>
                  <td>
                    {p.name} <span className="muted-sm">{p.version}</span>
                    {p.url && <span className="about-url">{p.url.replace(/^git\+/, '').replace(/\.git$/, '')}</span>}
                  </td>
                  <td>{p.license.replace(/^\((.*)\)$/, '$1')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="about-text muted-sm">{t('about.fonts')}</p>
        <p className="about-text muted-sm">{t('about.rust')}</p>

        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={onClose}>
            {t('about.close')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
