// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installCloseGuard } from './lib/closeGuard';
import { restoreSession } from './store';
import './fonts.css';
import './styles.css';

// The last session's projects are read first, so they show from the start.
await restoreSession();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

installCloseGuard();
