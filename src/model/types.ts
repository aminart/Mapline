// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

export type Id = string;

/** A phase groups consecutive steps; `span` is how many steps it covers. */
export interface Phase {
  id: Id;
  title: string;
  span: number;
}

/**
 * A step is a column group. Each slot is one column of activities, so a step
 * with several slots holds activities side by side.
 */
export interface Step {
  id: Id;
  title: string;
  slots: Id[];
}

export interface Persona {
  id: Id;
  name: string;
  role: string;
  /** Index into PERSONA_PALETTE. */
  color: number;
}

export interface Activity {
  id: Id;
  text: string;
  /** Free labels shown under the text, e.g. "irritant", "email". */
  tags?: string[];
  /** Longer comment, kept off the board (shown on demand). */
  note?: string;
  /** On an alternative card: the word shown above it ("or" when unset). */
  joiner?: string;
  /** A decision point rather than an activity, drawn like a flow's choice card. */
  kind?: 'choice';
}

export interface Scene {
  /** Image as a data URL, stored inside the project file. */
  img: string | null;
  text: string;
}

export type LinkStyle = 'solid' | 'dashed' | 'dotted';

export interface Link {
  id: Id;
  from: Id;
  to: Id;
  label?: string;
  style?: LinkStyle;
  color?: string;
}

/** A labelled line drawn under a persona row, e.g. the line of visibility. */
export interface Divider {
  id: Id;
  /** The persona row it sits under, or DIVIDER_TOP for above the first one. */
  after: Id;
  label: string;
}

export type FontId = 'inter' | 'lora' | 'plex' | 'caveat';

export interface BoxStyle {
  bg?: string;
  bc?: string;
  color?: string;
  font?: FontId;
  size?: number;
  weight?: number;
}

/** The content of a mission map (one of a project's documents). */
export interface Blueprint {
  objective: string;
  phases: Phase[];
  steps: Step[];
  personas: Persona[];
  /**
   * Keyed by activityKey(personaId, slotId), or altKey(...) for a second card
   * sharing the cell (an alternative, e.g. two possible choices).
   */
  activities: Record<string, Activity>;
  /** Keyed by step id. */
  scenes: Record<Id, Scene>;
  links: Link[];
  dividers: Divider[];
  /** Chosen colour (index into TAG_COLORS) per lower-cased tag. */
  tagColors: Record<string, number>;
  /** Keyed by a box key, see BoxKey. */
  styles: Record<string, BoxStyle>;
  storyboard: boolean;
  /** Free text rows under the personas, in order. */
  textRows: TextRow[];
}

/** A free text row under the personas: a title, a description, and a text under each step. */
export interface TextRow {
  id: Id;
  /** The row's own title and description; the translated defaults when unset. */
  title?: string;
  text?: string;
  /** Keyed by step id. */
  cells: Record<Id, string>;
}

/** A mission map inside a project. */
export interface MissionMapDoc {
  id: Id;
  kind: 'mission-map';
  /** Shown on the document's tab; the translated default when empty. */
  name: string;
  map: Blueprint;
}

/** How a sheet block shows its content. */
export type BlockView = 'list' | 'gauges' | 'tags' | 'text';

/** A line of a block: a bullet, a tag, or a gauge with its level. */
export interface SheetItem {
  id: Id;
  text: string;
  /** Gauges: 0 to 100. */
  level?: number;
}

/** A section of a persona sheet: goals, frustrations, motivations… */
export interface SheetBlock {
  id: Id;
  title: string;
  view: BlockView;
  /** Colour of the block's top edge and title. */
  accent: string;
  /** Lines, for the list, gauges and tags views. */
  items: SheetItem[];
  /** Free text, for the text view. */
  text: string;
  /** Where the block sits on the sheet's grid; laid out in order when missing. */
  place?: BlockPlace;
}

/**
 * A block's cell on the sheet grid: column and row of its top left corner,
 * and how many columns and rows it spans.
 */
export interface BlockPlace {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A labelled line of the identity column: age, place, situation… */
export interface SheetField {
  id: Id;
  label: string;
  value: string;
}

/** A persona sheet: an identity column and blocks. */
export interface PersonaSheet {
  name: string;
  role: string;
  /** Index into PERSONA_PALETTE. */
  color: number;
  /** Photo as a data URL, stored inside the project file. */
  photo: string | null;
  fields: SheetField[];
  quote: string;
  tags: string[];
  /** Chosen colour (index into the tag palette) per lower-cased tag. */
  tagColors?: Record<string, number>;
  blocks: SheetBlock[];
  /** Keyed 'identity' or 'block:<id>'. */
  styles: Record<string, BoxStyle>;
  /** The mission map persona this sheet describes. */
  link: { docId: Id; personaId: Id } | null;
  /** Keep the name, role and colour the same as the linked persona's. */
  sync: boolean;
  /** False hides the "Their journeys" block (maps and flows the persona appears in). */
  journeys?: boolean;
}

export interface PersonaSheetDoc {
  id: Id;
  kind: 'persona';
  /** Unused for now: a sheet's tab shows its persona's name. */
  name: string;
  sheet: PersonaSheet;
}

/** A card of a flow: its start, its end, an activity or a choice. */
export type FlowNodeKind = 'start' | 'end' | 'activity' | 'choice';

/** A card placed on the flow's grid (column, row). */
export interface FlowNode {
  id: Id;
  kind: FlowNodeKind;
  col: number;
  row: number;
  text: string;
  /** The mission map persona doing it, whose colour tops the card. */
  personaId?: Id | null;
  /** Labels under the text, as on mission map activities. */
  tags?: string[];
  /** Longer comment, kept off the card (shown on demand). */
  note?: string;
}

/** An arrow between two cards; choices label theirs ("Yes", "No"…). */
export interface FlowLink {
  id: Id;
  from: Id;
  to: Id;
  label?: string;
  style?: LinkStyle;
  color?: string;
}

/** The part of a mission map a flow details: a phase, a step or an activity. */
export interface FlowSource {
  docId: Id;
  kind: 'phase' | 'step' | 'act';
  /** The phase's, step's or activity's id. */
  id: Id;
}

/** A flow: cards on a grid and the arrows between them. */
export interface Flow {
  nodes: FlowNode[];
  links: FlowLink[];
  /** Keyed 'node:<id>'. */
  styles: Record<string, BoxStyle>;
  /** Chosen colour (index into the tag palette) per lower-cased tag. */
  tagColors?: Record<string, number>;
  /** The map phase, step or activity this flow details. */
  source?: FlowSource;
  /** Main persona: cards without a persona of their own take its colour. */
  personaId?: Id;
  /** Free text above the cards (the flow's goals, say), and its title; the translated default when unset. */
  brief?: string;
  briefTitle?: string;
}

export interface FlowDoc {
  id: Id;
  kind: 'flow';
  /** Shown on the document's tab; the translated default when empty. */
  name: string;
  flow: Flow;
}

/** A document of a project. */
export type ProjectDoc = MissionMapDoc | PersonaSheetDoc | FlowDoc;
export type DocKind = ProjectDoc['kind'];

/** What a .mapline file holds: a titled set of documents. */
export interface Project {
  version: 2;
  title: string;
  docs: ProjectDoc[];
}

export type BoxKind = 'obj' | 'phase' | 'step' | 'scene' | 'persona' | 'act' | 'info' | 'identity' | 'block' | 'node';

/** 'obj' or '<kind>:<id>' — identifies any styleable box. */
export type BoxKey = string;
