/**
 * Schon beherrschte Zauber: Herkunft je Key, Ausschluss der eigenen Gruppe(n).
 *
 *   npm run test -- knownSpells
 */
import { describe, expect, it } from 'vitest';
import type { GroupedSpellcasting } from '../../src/lib/services/spellcasting/grouped';
import {
  knownSpellGroups,
  knownSpells,
  quotaGroupId,
} from '../../src/lib/services/spellcasting/known';

const spell = (key: string) => ({ key, label: key, level: 0 });

const quota = (sourceId: string, quotaId: string, keys: string[]) => ({
  sourceId,
  quotaId,
  label: quotaId,
  castNote: '',
  swapNote: '',
  levels: [0],
  lists: [],
  from: null,
  count: keys.length,
  fixed: false,
  spells: keys.map(spell),
  open: 0,
});

const VIEW: GroupedSpellcasting = {
  sources: [
    {
      id: 'gnome',
      label: 'Gnom',
      featureDe: 'Gnomische Abstammung',
      abilityDe: '',
      abilityOptions: [],
      saveDC: null,
      attackBonus: null,
      quotas: [quota('gnome', 'granted', ['mending'])],
    },
    {
      id: 'wizard',
      label: 'Magier',
      featureDe: '',
      abilityDe: '',
      abilityOptions: [],
      saveDC: null,
      attackBonus: null,
      quotas: [quota('wizard', 'cantrips', ['fire-bolt', 'mending'])],
    },
  ],
  slots: [],
  pact: null,
  manualSlots: false,
  extra: [spell('guidance')],
};

describe('knownSpells', () => {
  it('nennt zu jedem Key seine Quellen, mehrfach vorkommende zusammengefasst', () => {
    const known = knownSpells(knownSpellGroups(VIEW));
    expect(known.get('mending')).toBe('Gnom (Gnomische Abstammung) · Magier');
    expect(known.get('fire-bolt')).toBe('Magier');
    expect(known.get('guidance')).toBe('Ohne Quelle');
  });

  it('lässt das eigene Kontingent aus — sonst meldete jede Wahl sich selbst', () => {
    const known = knownSpells(knownSpellGroups(VIEW), [quotaGroupId('wizard', 'cantrips')]);
    expect(known.get('mending')).toBe('Gnom (Gnomische Abstammung)');
    expect(known.has('fire-bolt')).toBe(false);
  });

  it('ignoriert leere Keys (Altbestand ohne Bibliotheks-Treffer)', () => {
    expect(knownSpells([{ id: 'a', label: 'A', keys: ['', 'x'] }]).size).toBe(1);
  });
});
