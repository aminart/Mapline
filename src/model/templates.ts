// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Blueprint, FlowDoc, Id, Persona, PersonaSheet, PersonaSheetDoc, Project } from './types';
import { templateFlow } from './flow';
import { PROJECT_VERSION, projectFromMap } from './project';
import { newBlock } from './sheet';
import { uid } from './ops';
import { translate, type Lang, type MessageKey } from '../i18n';

export type TemplateId = 'mission-map' | 'storyboard' | 'blank';

export const TEMPLATES: TemplateId[] = ['mission-map', 'storyboard', 'blank'];

export function templateLabel(id: TemplateId): { label: MessageKey; description: MessageKey } {
  return { label: `tpl.${id}`, description: `tpl.${id}.desc` };
}

function blankSteps(n: number) {
  return Array.from({ length: n }, () => ({ id: uid(), title: '', slots: [uid()] }));
}

/** A new project from a template; default texts are in `lang`. */
export function createFromTemplate(id: TemplateId, lang: Lang): Project {
  const { title, ...map } = titledMap(id, lang);
  return projectFromMap(title, map);
}

/** A template's mission map alone. */
export function createMap(id: TemplateId, lang: Lang): Blueprint {
  const { title: _title, ...map } = titledMap(id, lang);
  return map;
}

function titledMap(id: TemplateId, lang: Lang): Blueprint & { title: string } {
  const t = (key: MessageKey) => translate(lang, key);
  const base = { objective: '', activities: {}, scenes: {}, links: [], dividers: [], tagColors: {}, styles: {}, infos: {}, infoRow: false };
  switch (id) {
    case 'mission-map': {
      const [user, front, back] = [uid(), uid(), uid()];
      return {
        ...base,
        title: t('tpl.title.mission-map'),
        phases: [
          { id: uid(), title: t('tpl.phase.before'), span: 2 },
          { id: uid(), title: t('tpl.phase.during'), span: 2 },
          { id: uid(), title: t('tpl.phase.after'), span: 1 },
        ],
        steps: blankSteps(5),
        personas: [
          { id: user, name: t('tpl.persona.user'), role: '', color: 0 },
          { id: front, name: t('tpl.persona.front'), role: t('tpl.persona.front.role'), color: 1 },
          { id: back, name: t('tpl.persona.back'), role: t('tpl.persona.back.role'), color: 2 },
        ],
        // What the user sees above the line, internal work below.
        dividers: [{ id: uid(), after: front, label: t('board.dividerDefault') }],
        storyboard: false,
      };
    }
    case 'storyboard':
      return {
        ...base,
        title: t('tpl.title.storyboard'),
        phases: [{ id: uid(), title: '', span: 6 }],
        steps: blankSteps(6),
        personas: [{ id: uid(), name: t('tpl.persona.user'), role: '', color: 0 }],
        storyboard: true,
      };
    case 'blank':
      return {
        ...base,
        title: t('app.untitled'),
        phases: [{ id: uid(), title: '', span: 1 }],
        steps: blankSteps(1),
        personas: [{ id: uid(), name: '', role: '', color: 0 }],
        storyboard: false,
      };
  }
}

export type SheetTemplateId = 'classic' | 'blank';

export const SHEET_TEMPLATES: SheetTemplateId[] = ['classic', 'blank'];

export function sheetTemplateLabel(id: SheetTemplateId): { label: MessageKey; description: MessageKey } {
  return { label: `sheet.tpl.${id}`, description: `sheet.tpl.${id}.desc` };
}

/**
 * A new persona sheet; texts are in `lang`. Made for a mission map persona,
 * it starts from that persona and stays linked to it.
 */
export function createSheet(id: SheetTemplateId, lang: Lang, from?: { persona: Persona; mapDocId: Id }): PersonaSheet {
  const t = (key: MessageKey) => translate(lang, key);
  const base: PersonaSheet = {
    name: from?.persona.name ?? '',
    role: from?.persona.role ?? '',
    color: from?.persona.color ?? 0,
    photo: null,
    fields: [],
    quote: '',
    tags: [],
    blocks: [],
    styles: {},
    link: from ? { docId: from.mapDocId, personaId: from.persona.id } : null,
    sync: !!from,
  };
  if (id === 'blank') return base;
  return {
    ...base,
    fields: (['sheet.field.age', 'sheet.field.place', 'sheet.field.situation'] as const).map((key) => ({ id: uid(), label: t(key), value: '' })),
    blocks: [
      newBlock(t('sheet.block.goals'), 'list', '#2F55D4'),
      newBlock(t('sheet.block.frustrations'), 'list', '#C2410C'),
      newBlock(t('sheet.block.motivations'), 'gauges', '#0F766E', ['', '', '']),
      newBlock(t('sheet.block.behaviours'), 'list', '#7E22CE'),
      newBlock(t('sheet.block.channels'), 'tags', '#A16207', []),
      newBlock(t('sheet.block.scenario'), 'text', '#BE185D'),
    ],
  };
}

export function sheetDoc(sheet: PersonaSheet): PersonaSheetDoc {
  return { id: uid(), kind: 'persona', name: '', sheet };
}

/** A new project holding one standalone persona sheet. */
export function createSheetProject(id: SheetTemplateId, lang: Lang): Project {
  return { version: PROJECT_VERSION, title: translate(lang, 'sheet.title.new'), docs: [sheetDoc(createSheet(id, lang))] };
}

export type FlowTemplateId = 'user' | 'blank';

export const FLOW_TEMPLATES: FlowTemplateId[] = ['user', 'blank'];

export function flowTemplateLabel(id: FlowTemplateId): { label: MessageKey; description: MessageKey } {
  return { label: `flow.tpl.${id}`, description: `flow.tpl.${id}.desc` };
}

/** A new flow document; texts are in `lang`. */
export function createFlowDoc(id: FlowTemplateId, lang: Lang, name = ''): FlowDoc {
  const t = (key: MessageKey) => translate(lang, key);
  const flow = templateFlow(id, { start: t('flow.start'), end: t('flow.end'), yes: t('flow.yes'), no: t('flow.no') });
  return { id: uid(), kind: 'flow', name, flow };
}

/** A new project holding one flow. */
export function createFlowProject(id: FlowTemplateId, lang: Lang): Project {
  return { version: PROJECT_VERSION, title: translate(lang, 'flow.title.new'), docs: [createFlowDoc(id, lang)] };
}
