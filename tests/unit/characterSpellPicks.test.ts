/**
 * Bridge zwischen `SpellRef`/`SpellEntry` (mit `sourceKey`/`prepared`) und den flachen
 * `encodePick`-Strings des `SpellPickModal` — Rundreise darf keinen Link/Zustand verlieren,
 * und ein Grad außerhalb des Dialog-Scopes darf nicht als „entfernt" gelesen werden.
 */
import { describe, expect, it } from 'vitest';
import {
  cantripPicks, cantripQuota, casterRowOf, levelPickScope,
  mergeCantripPicks, mergeSpellPicks, spellQuota,
} from '../../src/lib/services/characterSpellPicks';
import type { SpellcastingOffer } from '../../src/lib/services/spellcasting';
import type { CharacterClass, SpellEntry, SpellRef } from '../../src/lib/schemas/characterSchema';

const cls = (over: Partial<CharacterClass> = {}): CharacterClass =>
  ({ sourceKey: '', name: '', level: 1, ...over });

describe('levelPickScope', () => {
  it('nimmt einen bestehenden Grad über maxSpellLevel mit', () => {
    const byLevel: Record<string, SpellEntry[]> = { '9': [{ name: 'Wunsch', prepared: true }] };
    const { levels } = levelPickScope(byLevel, 3);
    expect(levels).toEqual([1, 2, 3, 9]);
  });

  it('kodiert bestehende Einträge als Picks in Grad-Reihenfolge', () => {
    const byLevel: Record<string, SpellEntry[]> = {
      '1': [{ name: 'Schild', prepared: true }],
      '2': [{ name: 'Unsichtbarkeit', prepared: false }],
    };
    const { picks } = levelPickScope(byLevel, 2);
    expect(picks).toEqual(['1::Schild', '2::Unsichtbarkeit']);
  });
});

describe('mergeSpellPicks', () => {
  const resolveKey = (name: string) => (name === 'Feuerball' ? 'fireball' : undefined);

  it('Rundreise ohne Änderung liefert dieselben Objekte zurück', () => {
    const current: Record<string, SpellEntry[]> = {
      '1': [{ name: 'Schild', prepared: true, sourceKey: 'shield' }],
    };
    const scope = levelPickScope(current, 3);
    const next = mergeSpellPicks(current, scope.picks, { levels: scope.levels, regime: 'fixed-list', resolveKey });
    expect(next).toEqual(current);
    expect(next['1'][0]).toBe(current['1'][0]);
  });

  it('ein neuer Pick bekommt sourceKey aus resolveKey und prepared nach Regime', () => {
    const current: Record<string, SpellEntry[]> = {};
    const scope = levelPickScope(current, 3);
    const picks = [...scope.picks, '3::Feuerball'];

    const spellbook = mergeSpellPicks(current, picks, { levels: scope.levels, regime: 'spellbook', resolveKey });
    expect(spellbook['3']).toEqual([{ name: 'Feuerball', sourceKey: 'fireball', prepared: false }]);

    const openList = mergeSpellPicks(current, picks, { levels: scope.levels, regime: 'open-list', resolveKey });
    expect(openList['3']).toEqual([{ name: 'Feuerball', sourceKey: 'fireball', prepared: true }]);
  });

  it('ein entfernter Pick verschwindet, die übrigen bleiben', () => {
    const current: Record<string, SpellEntry[]> = {
      '1': [{ name: 'Schild', prepared: true }, { name: 'Licht', prepared: false }],
    };
    const scope = levelPickScope(current, 1);
    const remaining = scope.picks.filter((p) => p !== '1::Licht');
    const next = mergeSpellPicks(current, remaining, { levels: scope.levels, regime: 'fixed-list', resolveKey });
    expect(next['1']).toEqual([{ name: 'Schild', prepared: true }]);
  });

  it('werden ALLE Picks eines Grads entfernt, fällt der Schlüssel weg statt als [] zu bleiben', () => {
    const current: Record<string, SpellEntry[]> = { '1': [{ name: 'Schild', prepared: true }] };
    const scope = levelPickScope(current, 1);
    const next = mergeSpellPicks(current, [], { levels: scope.levels, regime: 'fixed-list', resolveKey });
    expect(next['1']).toBeUndefined();
  });

  it('ein Grad außerhalb des Scopes bleibt unverändert, auch ohne passenden Pick', () => {
    const current: Record<string, SpellEntry[]> = { '9': [{ name: 'Wunsch', prepared: true }] };
    const scope = levelPickScope({}, 3); // "9" absichtlich NICHT im Scope
    const next = mergeSpellPicks(current, scope.picks, { levels: scope.levels, regime: 'fixed-list', resolveKey });
    expect(next['9']).toEqual(current['9']);
  });
});

describe('cantripPicks / mergeCantripPicks', () => {
  it('Rundreise ohne Änderung liefert dieselben Objekte zurück', () => {
    const current: SpellRef[] = [{ name: 'Licht', sourceKey: 'light' }];
    const next = mergeCantripPicks(current, cantripPicks(current), () => undefined);
    expect(next).toEqual(current);
    expect(next[0]).toBe(current[0]);
  });

  it('ein neuer Pick wird über resolveKey verlinkt', () => {
    const next = mergeCantripPicks([], ['0::Feuerpfeil'], (n) => (n === 'Feuerpfeil' ? 'fire-bolt' : undefined));
    expect(next).toEqual([{ name: 'Feuerpfeil', sourceKey: 'fire-bolt' }]);
  });

  it('doppelte Namen im selben Pick-Satz kollabieren zu einem Eintrag', () => {
    const next = mergeCantripPicks([], ['0::Licht', '0::Licht'], () => undefined);
    expect(next).toEqual([{ name: 'Licht' }]);
  });

  it('ein entfernter Pick verschwindet', () => {
    const current: SpellRef[] = [{ name: 'Licht' }, { name: 'Feuerpfeil' }];
    const next = mergeCantripPicks(current, ['0::Licht'], () => undefined);
    expect(next).toEqual([{ name: 'Licht' }]);
  });
});

describe('casterRowOf', () => {
  const resolve = (name: string): string | null => {
    const slug = { Kleriker: 'cleric', cleric: 'cleric', Kämpfer: 'fighter', fighter: 'fighter' }[name];
    return slug ?? null;
  };

  it('wählt im Multiclass die Zeile, die `spellcastingClass` nennt', () => {
    const classes = [cls({ name: 'Kämpfer', sourceKey: 'fighter', level: 5 }), cls({ name: 'Kleriker', sourceKey: 'cleric', level: 2 })];
    const row = casterRowOf({ classes, spellcastingClass: 'Kleriker' }, resolve);
    expect(row).toEqual({ classKey: 'cleric', klasseName: 'Kleriker', level: 2 });
  });

  it('bei leerem spellcastingClass greift genau EIN Zauberwirker', () => {
    const classes = [cls({ name: 'Kämpfer', sourceKey: 'fighter', level: 5 }), cls({ name: 'Magier', sourceKey: 'wizard', level: 3 })];
    // resolve() kennt "Magier" hier nicht (Test-Fake) → nur "Kleriker" bliebe übrig, wenn vorhanden
    const single = [cls({ name: 'Kleriker', sourceKey: 'cleric', level: 4 })];
    expect(casterRowOf({ classes: single, spellcastingClass: '' }, resolve)).toEqual({
      classKey: 'cleric', klasseName: 'Kleriker', level: 4,
    });
    expect(casterRowOf({ classes, spellcastingClass: '' }, resolve)).toBeNull();
  });

  it('ohne sourceKey (Legacy, nicht verlinkt) bleibt die Zeile null', () => {
    const classes = [cls({ name: 'Kleriker', sourceKey: '', level: 3 })];
    expect(casterRowOf({ classes, spellcastingClass: 'Kleriker' }, resolve)).toBeNull();
  });

  it('ohne Treffer ist die Zeile null', () => {
    const classes = [cls({ name: 'Kämpfer', sourceKey: 'fighter', level: 5 })];
    expect(casterRowOf({ classes, spellcastingClass: 'Kleriker' }, resolve)).toBeNull();
  });
});

describe('cantripQuota / spellQuota', () => {
  const offer = (over: Partial<SpellcastingOffer>): SpellcastingOffer => ({
    isCaster: true, regime: 'fixed-list', klasseName: '', spellClass: '', ability: null,
    maxSpellLevel: 0, cantrips: 0, known: 0, prepared: 0, ...over,
  });

  it('ohne Angebot (kein Link) ist das Kontingent 0', () => {
    expect(cantripQuota(null)).toBe(0);
    expect(spellQuota(null)).toBe(0);
  });

  it('bei Nicht-Zauberwirker (isCaster false) ist das Kontingent 0', () => {
    expect(spellQuota(offer({ isCaster: false, known: 6 }))).toBe(0);
  });

  it('spellQuota nimmt `known`, sonst `prepared`', () => {
    expect(spellQuota(offer({ known: 6, prepared: 4 }))).toBe(6);
    expect(spellQuota(offer({ known: 0, prepared: 4 }))).toBe(4);
  });
});
