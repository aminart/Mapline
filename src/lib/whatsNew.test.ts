// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { MAX_OPENS, nextState, type WhatsNewState } from './whatsNew';
import { compareVersions, latestNotes, notesBetween, RELEASE_NOTES, type ReleaseNotes } from '../model/whatsNew';

const note = (version: string): ReleaseNotes => ({ version, summary: { fr: version, en: version }, items: [] });
const notes = [note('1.9.0'), note('1.11.0'), note('1.10.0')];

describe('release notes', () => {
  it('compares versions number by number', () => {
    expect(compareVersions('1.10.0', '1.9.2')).toBeGreaterThan(0);
    expect(compareVersions('1.10', '1.10.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
  });

  it('keeps the versions after the one before, up to the one installed, newest first', () => {
    expect(notesBetween('1.9.0', '1.11.0', notes).map((n) => n.version)).toEqual(['1.11.0', '1.10.0']);
    expect(notesBetween('1.10.0', '1.11.0', notes).map((n) => n.version)).toEqual(['1.11.0']);
    // A version not yet installed is not shown.
    expect(notesBetween('1.9.0', '1.10.0', notes).map((n) => n.version)).toEqual(['1.10.0']);
  });

  it('shows only the installed version when the one before is not known', () => {
    expect(notesBetween(null, '1.11.0', notes).map((n) => n.version)).toEqual(['1.11.0']);
    expect(notesBetween(null, '1.12.0', notes)).toEqual([]);
  });

  it('offers the newest notes up to the installed version in the help menu', () => {
    expect(latestNotes('1.10.3', notes)?.version).toBe('1.10.0');
    expect(latestNotes('1.0.0', notes)).toBeUndefined();
  });

  it('writes every note in both languages, newest first', () => {
    for (const n of RELEASE_NOTES) {
      expect(n.summary.fr && n.summary.en).toBeTruthy();
      for (const item of n.items) expect(item.title.fr && item.title.en && item.text.fr && item.text.en).toBeTruthy();
    }
    const versions = RELEASE_NOTES.map((n) => n.version);
    expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual(versions);
  });
});

describe('when the banner shows', () => {
  const v = RELEASE_NOTES[0].version;
  const before = RELEASE_NOTES[1].version;

  it('shows nothing on a first install', () => {
    expect(nextState(null, v, false)).toEqual({ from: v, to: v, opens: 0, done: true });
  });

  it('shows the installed version to someone who used an earlier one', () => {
    expect(nextState(null, v, true)).toEqual({ from: null, to: v, opens: 1, done: false });
  });

  it('shows the versions since the one before after an update', () => {
    const seen: WhatsNewState = { from: '1.0.0', to: before, opens: 2, done: true };
    expect(nextState(seen, v, true)).toEqual({ from: before, to: v, opens: 1, done: false });
  });

  it('keeps what was not seen when an update comes before the banner was closed', () => {
    const unseen: WhatsNewState = { from: '1.0.0', to: before, opens: 1, done: false };
    expect(nextState(unseen, v, true).from).toBe('1.0.0');
  });

  it(`goes away after ${MAX_OPENS} launches`, () => {
    let s = nextState(null, v, true);
    for (let i = 1; i < MAX_OPENS; i++) s = nextState(s, v, true);
    expect(s).toMatchObject({ opens: MAX_OPENS, done: false });
    expect(nextState(s, v, true).done).toBe(true);
  });

  it('stays closed once closed', () => {
    const closed: WhatsNewState = { from: before, to: v, opens: 1, done: true };
    expect(nextState(closed, v, true)).toEqual(closed);
  });

  it('shows nothing for an update without notes', () => {
    expect(nextState({ from: v, to: v, opens: 0, done: true }, '99.0.0', true).done).toBe(true);
  });
});
