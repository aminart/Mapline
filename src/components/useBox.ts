// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from 'react';
import { activeStyles, useStore } from '../store';
import type { BoxKey, BoxKind } from '../model/types';
import { boxStyle, resolveStyle, textStyle } from '../model/theme';

/**
 * Shared wiring for a styleable box: its resolved style, selection state,
 * and a ref that receives focus when the box was just created.
 */
export function useBox<T extends HTMLElement>(key: BoxKey, kind: BoxKind, personaColor?: number) {
  const custom = useStore((s) => activeStyles(s)[key]);
  const selected = useStore((s) => s.sel === key);
  const pendingFocus = useStore((s) => s.pendingFocus === key);
  const select = useStore((s) => s.select);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!pendingFocus) return;
    ref.current?.focus();
    useStore.setState({ pendingFocus: null });
  }, [pendingFocus]);

  const style = resolveStyle(kind, custom, personaColor);
  return {
    ref,
    style,
    hasCustomBorder: custom?.bc !== undefined,
    selected,
    box: boxStyle(style),
    text: textStyle(style),
    onFocus: () => select(key),
  };
}
