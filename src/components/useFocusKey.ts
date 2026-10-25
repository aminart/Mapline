// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, type RefObject } from 'react';
import { useStore } from '../store';

/** Focuses `ref` once `key` is asked for (store.pendingFocus), caret at the end. */
export function useFocusKey(key: string, ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>) {
  const pending = useStore((s) => s.pendingFocus === key);
  useEffect(() => {
    if (!pending) return;
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    useStore.setState({ pendingFocus: null });
  }, [pending, ref]);
}

/** Asks for `key` to be focused once it is mounted, without selecting a box. */
export function focusSoon(key: string) {
  useStore.setState({ pendingFocus: key });
}
