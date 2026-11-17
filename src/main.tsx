// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installCloseGuard } from './lib/closeGuard';
import { installInputModality } from './lib/inputModality';
import { restoreSession, useStore } from './store';
import { applyTheme } from './lib/appTheme';
import { installDarkPalette } from './lib/shownColor';
import 'night-navy/night-navy.css';
import './fonts.css';
import './styles.css';

installInputModality();
installDarkPalette();
applyTheme(useStore.getState().theme);

// The last session's projects are read first, so they show from the start.
await restoreSession();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

installCloseGuard();
