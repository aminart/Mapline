// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef, type RefObject, type TextareaHTMLAttributes } from 'react';
import { useFitText } from './useFitText';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & {
  value: string;
  ref?: RefObject<HTMLTextAreaElement | null>;
  /** A name or title: its text wraps, but Enter adds no line. */
  singleLine?: boolean;
};

/**
 * A text field that shows all of its text: it wraps and grows in height,
 * never cut off and never scrolled.
 */
export function FitText({ ref, singleLine = false, onKeyDown, onChange, ...rest }: Props) {
  const own = useRef<HTMLTextAreaElement>(null);
  const el = ref ?? own;
  const { fontFamily, fontSize, fontWeight, letterSpacing } = rest.style ?? {};
  useFitText(el, [rest.value, rest.placeholder, fontFamily, fontSize, fontWeight, letterSpacing]);
  return (
    <textarea
      ref={el}
      rows={1}
      {...rest}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (singleLine && e.key === 'Enter' && !e.defaultPrevented && !e.nativeEvent.isComposing) e.preventDefault();
      }}
      onChange={(e) => {
        // Pasted line breaks become spaces in a one-line field.
        if (singleLine && /[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, ' ');
        onChange?.(e);
      }}
    />
  );
}
