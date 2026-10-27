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
  poolAllowanceFor, poolPicks, toggleOptionPick, unmetPrerequisite, type OptionPoolOffer,
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
    const at = (level: number) => poolAllowanceFor([prog([], [])], metamagic, twoEach, level);
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
    expect(poolAllowanceFor([table], invocations, declared, 1)).toBe(1);
    expect(poolAllowanceFor([table], invocations, declared, 2)).toBe(3);
  });

  /** Die Subklassentabelle steht vor der der Grundklasse — geerbte Spalten bleiben sichtbar. */
  it('nimmt die erste Tabelle, die die Spalte führt', () => {
    const pool = feature([3]);
    const base = prog([{}, {}, { Erbe: '2' }], []);
    const sub = prog([{}, {}, { Eigen: '5' }], []);
    const declared = (column: string) => grant({ count: 1, column });
    expect(poolAllowanceFor([sub, base], pool, declared('Eigen'), 3)).toBe(5);
    expect(poolAllowanceFor([sub, base], pool, declared('Erbe'), 3)).toBe(2);
    expect(poolAllowanceFor([base], pool, declared('Eigen'), 3)).toBe(0);
  });
});

describe('Tausch in der flachen Liste am Charakter', () => {
  const offer: OptionPoolOffer = {
    featureKey: 'srd-2024_sorcerer_metamagic',
    titleDe: 'Metamagie',
    className: 'Zauberer',
    allowance: 2,
    level: 2,
    desc: '', descDe: '',
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

describe('Voraussetzungen einer Pool-Option', () => {
  const INVOCATIONS = 'srd-2024_warlock_eldritch-invocations';
  const offer = (level: number): OptionPoolOffer => ({
    featureKey: INVOCATIONS,
    titleDe: 'Schauerliche Anrufungen',
    className: 'Hexenmeister',
    allowance: 5,
    level,
    desc: '', descDe: '',
    options: [
      { value: 'Pact of the Blade', labelDe: 'Pakt der Klinge', helpDe: '', spells: [] },
      { value: 'Thirsting Blade', labelDe: 'Dürstende Klinge', helpDe: '', spells: [],
        prerequisite: { level: 5, options: ['Pact of the Blade'] } },
      { value: 'Eldritch Mind', labelDe: 'Schauerlicher Verstand', helpDe: '', spells: [] },
    ],
  });
  const [blade, thirsting, mind] = offer(5).options;
  const picked = (...values: string[]): OptionPick[] =>
    values.map((value) => ({ sourceKey: INVOCATIONS, value, valueDe: '' }));

  it('lässt Optionen ohne Feld jederzeit zu', () => {
    expect(unmetPrerequisite([], offer(1), mind)).toBeNull();
    expect(toggleOptionPick([], offer(1), blade)).toHaveLength(1);
  });

  it('nennt Stufe und fehlende Schwester-Option deutsch', () => {
    expect(unmetPrerequisite([], offer(2), thirsting)).toBe('ab Stufe 5, erfordert Pakt der Klinge');
    expect(unmetPrerequisite(picked('Pact of the Blade'), offer(2), thirsting)).toBe('ab Stufe 5');
    expect(unmetPrerequisite(picked('Pact of the Blade'), offer(5), thirsting)).toBeNull();
  });

  /** Die Schwester muss im SELBEN Pool liegen — ein gleichnamiger Eintrag woanders zählt nicht. */
  it('zählt nur Wahlen desselben Pools', () => {
    const foreign: OptionPick = { sourceKey: 'other_pool', value: 'Pact of the Blade', valueDe: '' };
    expect(unmetPrerequisite([foreign], offer(5), thirsting)).toBe('erfordert Pakt der Klinge');
  });

  it('blockiert das Wählen, nicht das Abwählen', () => {
    expect(toggleOptionPick([], offer(5), thirsting)).toEqual([]);
    // Pakt abgewählt: die abhängige Wahl bleibt stehen und lässt sich trotzdem lösen.
    const orphaned = picked('Thirsting Blade');
    expect(toggleOptionPick(orphaned, offer(5), thirsting)).toEqual([]);
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
    level: 3,
    desc: '', descDe: '',
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
