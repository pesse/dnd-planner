/**
 * Der Options-Pool ohne Vault: Kontingent aus `gainedAt` × `count` bzw. aus der deklarierten
 * Tabellenspalte, und der Tausch am Maximum. Was hier geprüft wird, ist die Trennung, die den
 * eigenen `kind` überhaupt rechtfertigt — die Liste am Charakter, nicht das Ledger.
 *
 *   npm run test -- optionPool
 */
import { describe, expect, it } from 'vitest';
import { classProgressionSchema, type ClassFeature } from '../../src/lib/schemas/classProgression';
import { featureChoiceGrantSchema } from '../../src/lib/schemas/featureChoice';
import type { CharacterFeatureEntry, OptionPick } from '../../src/lib/schemas/characterSchema';
import {
  poolAllowanceFor, poolPicks, toggleOptionPick, type OptionPoolOffer,
} from '../../src/lib/services/declaration/optionPool';
import {
  optionPicksFix, type LegacyLinkLibraries, type LegacyLinkTarget,
} from '../../src/lib/services/characterLegacyLinks';

const grant = (over: Record<string, unknown>) =>
  featureChoiceGrantSchema.parse({ kind: 'optionPool', options: [{ value: 'A' }], ...over });

const prog = (columns: Record<string, string>[], features: Partial<ClassFeature>[]) =>
  classProgressionSchema.parse({
    key: 'test_class', source: 'homebrew-sam', name: 'Test',
    levels: columns.map((c, i) => ({ level: i + 1, columns: c })),
    features: features.map((f) => ({ name: 'Merkmal', ...f })),
  });

const feature = (gainedAt: number[]): ClassFeature =>
  prog([], [{ key: 'test_pool', gainedAt }]).features[0];

describe('Kontingent eines Options-Pools', () => {
  const metamagic = feature([2, 10, 17]);
  const twoEach = grant({ count: 2 });

  it('summiert über die ERREICHTEN Vergabe-Stufen', () => {
    const at = (level: number) => poolAllowanceFor(prog([], []), metamagic, twoEach, level);
    expect([at(1), at(2), at(9), at(10), at(16), at(17), at(20)]).toEqual([0, 2, 2, 4, 4, 6, 6]);
  });

  /** Die Anrufungen kommen alle von EINER Vergabe-Stufe; ohne Spalte blieben es 2. */
  it('liest die deklarierte Tabellenspalte statt zu summieren', () => {
    const invocations = feature([1]);
    const table = prog(
      [{ 'Eldritch Invocations': '1' }, { 'Eldritch Invocations': '3' }],
      [],
    );
    const declared = grant({ count: 2, column: 'Eldritch Invocations' });
    expect(poolAllowanceFor(table, invocations, declared, 1)).toBe(1);
    expect(poolAllowanceFor(table, invocations, declared, 2)).toBe(3);
  });
});

describe('Tausch in der flachen Liste am Charakter', () => {
  const offer: OptionPoolOffer = {
    featureKey: 'srd-2024_sorcerer_metamagic',
    titleDe: 'Metamagie',
    className: 'Zauberer',
    allowance: 2,
    options: [
      { value: 'Careful Spell', labelDe: 'Bedachter Zauber', helpDe: '', spells: [] },
      { value: 'Subtle Spell', labelDe: 'Subtiler Zauber', helpDe: '', spells: [] },
      { value: 'Twinned Spell', labelDe: 'Gespiegelter Zauber', helpDe: '', spells: [] },
    ],
  };
  const pick = (list: OptionPick[], i: number) => toggleOptionPick(list, offer, offer.options[i]);

  it('legt englischen Anker und deutsches Zitat nebeneinander ab', () => {
    expect(pick([], 0)).toEqual([
      { sourceKey: 'srd-2024_sorcerer_metamagic', value: 'Careful Spell', valueDe: 'Bedachter Zauber' },
    ]);
  });

  it('blockiert am Maximum, statt die älteste Wahl herauszuschieben', () => {
    const full = pick(pick([], 0), 1);
    expect(pick(full, 2)).toEqual(full);
    // Erst abwählen macht den Platz frei.
    expect(pick(pick(full, 0), 2).map((p) => p.value)).toEqual(['Subtle Spell', 'Twinned Spell']);
  });

  /** EINE Liste für alle Pools: ein fremder Eintrag darf weder zählen noch verschwinden. */
  it('fasst die Einträge anderer Merkmale nicht an', () => {
    const foreign: OptionPick = { sourceKey: 'srd-2024_warlock_eldritch-invocations', value: 'Agonizing Blast', valueDe: '' };
    const list = pick(pick([foreign], 0), 1);
    expect(poolPicks(list, offer.featureKey)).toHaveLength(2);
    expect(list).toContainEqual(foreign);
  });
});

/**
 * Der Umzug einer Wahl, die früher als Fragebogen-Antwort im Ledger stand (Beute des Jägers
 * vor der Umstellung auf `optionPool`).
 */
describe('Altbestand: Ledger-Antwort in den Pool heben', () => {
  const PREY_KEY = 'srd-2024_ranger_hunter_hunters-prey';
  const offer: OptionPoolOffer = {
    featureKey: PREY_KEY,
    titleDe: 'Beute des Jägers',
    className: 'Waldläufer',
    allowance: 1,
    options: [
      { value: 'Colossus Slayer', labelDe: 'Kolossbezwinger', helpDe: '', spells: [] },
      { value: 'Horde Breaker', labelDe: 'Meutebrecher', helpDe: '', spells: [] },
    ],
  };
  const entry = (over: Partial<CharacterFeatureEntry>): CharacterFeatureEntry =>
    ({ sourceKey: PREY_KEY, name: '', choice: '', choiceDe: '', choiceId: '', desc: '', ...over });

  const setup = (features: CharacterFeatureEntry[], picks: OptionPick[] = []) => {
    const target = { features, optionPicks: picks } as LegacyLinkTarget;
    return { target, fix: optionPicksFix(target, { pools: [offer] } as LegacyLinkLibraries) };
  };

  it('nimmt den englischen Anker und räumt den Ledger-Eintrag ab', () => {
    const { target, fix } = setup([entry({ choice: 'Horde Breaker', choiceDe: 'Meutebrecher' })]);
    expect(fix?.label).toBe('1 Merkmals-Wahl in den Options-Pool übernehmen');
    fix!.apply();
    expect(target.optionPicks).toEqual([
      { sourceKey: PREY_KEY, value: 'Horde Breaker', valueDe: 'Meutebrecher' },
    ]);
    expect(target.features).toEqual([]);
    expect(optionPicksFix(target, { pools: [offer] } as LegacyLinkLibraries)).toBeUndefined();
  });

  /** Vor Upgrade-Schritt 6 stand das DEUTSCHE Label in `choice`. */
  it('trifft die Option auch über das deutsche Label', () => {
    const { target, fix } = setup([entry({ choice: 'Kolossbezwinger' })]);
    fix!.apply();
    expect(target.optionPicks.map((p) => p.value)).toEqual(['Colossus Slayer']);
  });

  it('lässt eine Antwort liegen, die die Deklaration nicht bestätigt', () => {
    const { target, fix } = setup([entry({ choice: 'Giant Killer' })]);
    expect(fix).toBeUndefined();
    expect(target.features).toHaveLength(1);
  });

  /** Der Eintrag ist dann die Dublette — er geht, der Pool bleibt wie er ist. */
  it('legt eine bereits gewählte Option kein zweites Mal ab', () => {
    const picks: OptionPick[] = [{ sourceKey: PREY_KEY, value: 'Horde Breaker', valueDe: 'Meutebrecher' }];
    const { target, fix } = setup([entry({ choice: 'Horde Breaker' })], picks);
    fix!.apply();
    expect(target.optionPicks).toEqual(picks);
    expect(target.features).toEqual([]);
  });

  it('fasst Talent-Links und fremde Merkmale nicht an', () => {
    const feat = entry({ sourceKey: 'srd-2024_healer', choice: '' });
    const { target, fix } = setup([feat]);
    expect(fix).toBeUndefined();
    expect(target.features).toEqual([feat]);
  });
});
