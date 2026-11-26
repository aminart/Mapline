// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from 'react';
import { useStore, useT } from '../store';
import { useWhatsNew } from '../lib/whatsNew';
import { cls } from './cls';

/** "1.11.0" → "1.11"; a patch version keeps its last number. */
export const shortVersion = (v: string) => v.replace(/\.0$/, '');

/**
 * After an update, a banner under the top bar names what is new; "See
 * details" lists it. Closed with ×, or after a few launches (lib/whatsNew.ts).
 * The help menu opens the list again.
 */
export function WhatsNew() {
  const banner = useWhatsNew((s) => s.banner && s.notes.length > 0);
  const open = useWhatsNew((s) => s.open);
  if (!banner && !open) return null;
  // The list hangs below the banner, or below the top bar when opened from the help menu.
  return (
    <div className="whats-new">
      {banner && <Banner />}
      <WhatsNewCard />
    </div>
  );
}

function Banner() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const { notes, open, setOpen, dismiss } = useWhatsNew();
  const latest = notes[0];
  return (
    <div className="whats-new-band" role="status">
      <span className="whats-new-tag">{t('whatsNew.badge', { v: shortVersion(latest.version) })}</span>
      <span className="whats-new-summary">{latest.summary[lang]}</span>
      <button className="text-btn whats-new-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(open ? 'whatsNew.less' : 'whatsNew.more')}
      </button>
      <button className="icon-btn" aria-label={t('whatsNew.close')} title={t('whatsNew.close')} onClick={dismiss}>
        ×
      </button>
    </div>
  );
}

/** The list of what is new, under the banner or under the help menu. */
function WhatsNewCard() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const { notes, banner, open, setOpen, dismiss } = useWhatsNew();
  const ref = useRef<HTMLDivElement>(null);
  const close = banner ? dismiss : () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!ref.current?.contains(target) && !target.closest('.whats-new-more, .help')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  if (!open || !notes.length) return null;
  return (
    <div ref={ref} className={cls('whats-new-card', banner ? 'is-under-band' : 'is-under-help')} role="dialog" aria-labelledby="whats-new-title">
      <div className="whats-new-head">
        <span className="whats-new-tag">{t('whatsNew.badge', { v: shortVersion(notes[0].version) })}</span>
        <h2 id="whats-new-title">{t('whatsNew.title', { v: shortVersion(notes[0].version) })}</h2>
        <button className="icon-btn" aria-label={t('whatsNew.close')} title={t('whatsNew.close')} onClick={close}>
          ×
        </button>
      </div>
      <div className="whats-new-body">
        {notes.map((n, i) => (
          <section key={n.version}>
            {i > 0 && <h3>{t('whatsNew.version', { v: shortVersion(n.version) })}</h3>}
            <ul>
              {n.items.map((item) => (
                <li key={item.title.en}>
                  <span className="whats-new-dot" aria-hidden="true" />
                  <div>
                    <strong>{item.title[lang]}</strong>
                    <p>{item.text[lang]}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="whats-new-foot">
        <span>{banner && t('whatsNew.where')}</span>
        <button className="btn btn-primary" onClick={close}>
          {t('whatsNew.ok')}
        </button>
      </div>
    </div>
  );
}
