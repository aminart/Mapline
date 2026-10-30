// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Blueprint } from '../model/types';
import { activityKey, altKey, DIVIDER_TOP, normalizePhases } from '../model/ops';

export interface CsvLabels {
  objective: string;
  phases: string;
  steps: string;
  storyboard: string;
  note: string;
  /** Prefix of a second card sharing a cell, e.g. "ou". */
  or: string;
  info: string;
}

function cell(value: string, sep: string): string {
  return /["\n\r]/.test(value) || value.includes(sep) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The project as a table: one column per step, one row per persona.
 * Activities sharing a step are one per line in the cell, tags in brackets.
 * `sep` is ";" for French spreadsheets, "," otherwise.
 */
export function buildCsv(doc: Blueprint, labels: CsvLabels, sep: ',' | ';'): string {
  const phases = normalizePhases(doc.phases, doc.steps.length);
  const phaseOfStep: string[] = [];
  for (const p of phases) for (let i = 0; i < p.span; i++) phaseOfStep.push(p.title);

  const rows: string[][] = [];
  rows.push([labels.objective, doc.objective]);
  rows.push([]);
  rows.push([labels.phases, ...doc.steps.map((_, i) => phaseOfStep[i] ?? '')]);
  rows.push([labels.steps, ...doc.steps.map((s) => s.title)]);
  if (doc.storyboard) rows.push([labels.storyboard, ...doc.steps.map((s) => doc.scenes[s.id]?.text ?? '')]);
  const top = doc.dividers.find((d) => d.after === DIVIDER_TOP);
  if (top && doc.personas.length) rows.push([`— ${top.label} —`]);
  for (const p of doc.personas) {
    const head = p.role ? `${p.name} (${p.role})` : p.name;
    const cells = doc.steps.map((s) =>
      s.slots
        .flatMap((slot) => {
          const key = activityKey(p.id, slot);
          return [{ a: doc.activities[key], alt: false }, { a: doc.activities[altKey(key)], alt: true }];
        })
        .filter(({ a }) => a && (a.text.trim() || a.tags?.length || a.note?.trim()))
        .map(({ a, alt }) => {
          const tagged = a!.tags?.length ? `${a!.text.trim()} [${a!.tags.join(', ')}]` : a!.text.trim();
          const joiner = (a!.joiner ?? labels.or).trim();
          const text = alt && joiner ? `${joiner} ${tagged}` : tagged;
          return a!.note?.trim() ? `${text} (${labels.note} : ${a!.note.trim()})` : text;
        })
        .join('\n'),
    );
    rows.push([head, ...cells]);
    const divider = doc.dividers.find((d) => d.after === p.id);
    if (divider) rows.push([`— ${divider.label} —`]);
  }
  for (const r of doc.textRows) rows.push([r.title?.trim() || labels.info, ...doc.steps.map((s) => r.cells[s.id] ?? '')]);
  // BOM so Excel reads accents as UTF-8.
  return '﻿' + rows.map((r) => r.map((v) => cell(v, sep)).join(sep)).join('\r\n') + '\r\n';
}
