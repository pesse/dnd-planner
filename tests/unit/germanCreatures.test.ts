/**
 * Deutsch aus dem SRD-Extrakt auf eine gemappte Open5e-Kreatur legen. Geprüft wird, was die
 * Zuordnung ENTSCHEIDET: Kreaturen über die Statblock-Zahlen statt über Namen, Einträge über
 * ihre gemeinsamen Zahlen statt über die Position — die beiden Fassungen sortieren jede in
 * ihrer eigenen Sprache alphabetisch.
 */
import { describe, it, expect } from 'vitest';
import { OPEN5E_CAT, OPEN5E_ANCIENT_RED_DRAGON } from '../fixtures/open5eCreatures';
import { mapOpen5eCreature } from '../../src/lib/services/open5eCreatureMapper';
import {
  applyGermanText,
  captureEnglishOriginal,
  germanFromMonster,
  matchGermanCreatures,
  type GermanCreature,
} from '../../scripts/srd/germanCreatures';
import type { Monster } from '../../src/lib/schemas/monster';

const cat = (): Monster => mapOpen5eCreature(OPEN5E_CAT);
const dragon = (): Monster => mapOpen5eCreature(OPEN5E_ANCIENT_RED_DRAGON);

/** Eine Altdatei aus dem Vault: der Text steht in `name`/`desc`, `*_en` gab es noch nicht. */
function vaultCopy(texts: { name: string; trait: string; action: string }): Monster {
  const monster = cat();
  monster.name = texts.name;
  monster.name_en = '';
  monster.traits[0] = { name: 'Springer', name_en: '', desc: texts.trait, desc_en: '' };
  monster.actions[0] = { ...monster.actions[0], name: 'Kratzen', name_en: '', desc: texts.action, desc_en: '' };
  return monster;
}

const ENGLISH_COPY = {
  name: 'Cat',
  trait: "The cat's jump distance is determined by its Dexterity.",
  action: 'Melee Attack Roll: +4, reach 5 ft. Hit: 1 Slashing damage.',
};
const GERMAN_COPY = {
  name: 'Hauskatze',
  trait: 'Die Sprungweite der Katze bemisst sich an ihrer Geschicklichkeit.',
  action: 'Nahkampfangriffswurf: +4, Reichweite 1,5 m. Treffer: 1 Hiebschaden.',
};

const KATZE: GermanCreature = {
  name: 'Katze',
  type_line: 'Kleines Tier, gesinnungslos',
  ac: 12,
  hp: 2,
  cr: 0,
  abilities: [3, 15, 10, 3, 12, 7],
  page: 397,
  groups: {
    traits: [{ name: 'Springer', desc: 'Die Sprungweite der Katze bemisst sich an ihrer Geschicklichkeit.' }],
    ACTION: [{ name: 'Kratzen', desc: 'Nahkampfangriffswurf: +4, Reichweite 1,5 m. Treffer: 1 Hiebschaden.' }],
  },
};

describe('matchGermanCreatures', () => {
  it('ordnet über RK, TP, HG und die Attributswerte zu', () => {
    const monster = cat();
    const matched = matchGermanCreatures([monster], [KATZE]);
    expect(matched.get(monster)).toBe(KATZE);
  });

  it('ordnet nur eindeutige Paare zu', () => {
    const twin = { ...KATZE, name: 'Zwillingskatze' };
    expect(matchGermanCreatures([cat()], [KATZE, twin]).size).toBe(0);
  });

  it('greift auf RK, TP, HG zurück, wenn ein Attributswert fehlt', () => {
    const monster = cat();
    const lückenhaft = { ...KATZE, abilities: [3, 15, 10, 12, 7] };
    expect(matchGermanCreatures([monster], [lückenhaft]).get(monster)).toBe(lückenhaft);
  });
});

describe('applyGermanText', () => {
  it('setzt Deutsch und lässt das Englische als *_en stehen', () => {
    const monster = cat();
    expect(applyGermanText(monster, KATZE)).toEqual([]);
    expect(monster.name).toBe('Katze');
    expect(monster.name_en).toBe('Cat');
    expect(monster.actions[0].name).toBe('Kratzen');
    expect(monster.actions[0].name_en).toBe('Scratch');
    expect(monster.actions[0].desc).toContain('Hiebschaden');
    expect(monster.actions[0].desc_en).toContain('Slashing damage');
  });

  it('ordnet über die gemeinsamen Zahlen zu, nicht über die Position', () => {
    const monster = cat();
    monster.actions.push({
      ...monster.actions[0],
      name: 'Pounce',
      name_en: 'Pounce',
      desc: 'Melee Attack Roll: +2, reach 5 ft. 7 (2d6) Bludgeoning damage.',
      desc_en: 'Melee Attack Roll: +2, reach 5 ft. 7 (2d6) Bludgeoning damage.',
      attacks: [],
    });
    // Deutsche Reihenfolge: Kratzen kommt hinter Anspringen, die englische ist umgekehrt.
    const record: GermanCreature = {
      ...KATZE,
      groups: {
        ...KATZE.groups,
        ACTION: [
          { name: 'Anspringen', desc: 'Nahkampfangriffswurf: +2, Reichweite 1,5 m. Treffer: 7 (2W6) Wuchtschaden.' },
          ...KATZE.groups.ACTION!,
        ],
      },
    };
    expect(applyGermanText(monster, record)).toEqual([]);
    expect(monster.actions.map((a) => a.name)).toEqual(['Kratzen', 'Anspringen']);
  });

  it('lässt einen nur der Reihenfolge nach geratenen Angriff englisch, wenn die Zahlen widersprechen', () => {
    const monster = cat();
    monster.actions[0].attacks = [
      {
        name: 'Scratch',
        attack_type: 'WEAPON',
        to_hit_mod: 4,
        reach: 5,
        target_creature_only: false,
        damage: { die_count: 1, die_type: 'D4', bonus: 2, type: 'slashing' },
      },
    ];
    const falsch: GermanCreature = {
      ...KATZE,
      groups: {
        ...KATZE.groups,
        ACTION: [{ name: 'Biss', desc: 'Nahkampfangriffswurf: +9, Reichweite 3 m. Treffer: 12 (2W8+3) Stichschaden.' }],
      },
    };
    const notes = applyGermanText(monster, falsch);
    expect(notes.join(' ')).toContain('nicht übernommen');
    expect(monster.actions[0].name).toBe('Scratch');
  });

  it('schneidet die Aufladung aus dem Aktionsnamen — der Statblock hängt sie selbst an', () => {
    const monster = dragon();
    const breath = monster.actions.findIndex((a) => a.usage_limits);
    const record: GermanCreature = {
      name: 'Uralter roter Drache',
      type_line: 'Gigantischer Drache, chaotisch böse',
      ac: monster.armor_class,
      hp: monster.hit_points,
      cr: monster.challenge_rating,
      abilities: [30, 10, 29, 18, 15, 27],
      page: 364,
      groups: {
        ACTION: monster.actions
          .filter((a) => a.action_type === 'ACTION')
          .map((a) => ({
            name: a === monster.actions[breath] ? 'Feuerodem (Aufladung 5–6)' : `DE ${a.name}`,
            desc: a.desc,
          })),
      },
    };
    applyGermanText(monster, record);
    expect(monster.actions[breath].name).toBe('Feuerodem');
  });

  it('übersetzt nur, wo ein englisches Original steht', () => {
    const monster = vaultCopy(GERMAN_COPY);
    expect(captureEnglishOriginal(monster)).toBe(false);
    applyGermanText(monster, KATZE);
    expect(monster.traits[0].desc).toBe(GERMAN_COPY.trait);
    expect(monster.actions[0].name).toBe('Kratzen');
  });

  it('rettet die englische Kopie nach *_en und ersetzt sie durch das SRD', () => {
    const monster = vaultCopy(ENGLISH_COPY);
    expect(captureEnglishOriginal(monster)).toBe(true);
    applyGermanText(monster, KATZE);
    expect(monster.name_en).toBe('Cat');
    expect(monster.traits[0].desc_en).toBe(ENGLISH_COPY.trait);
    expect(monster.traits[0].desc).toBe(KATZE.groups.traits![0].desc);
  });

  it('nimmt ein eingedeutschtes Bibliotheksmonster als Quelle', () => {
    const library = vaultCopy(GERMAN_COPY);
    library.name_en = 'Cat';
    const copy = vaultCopy(ENGLISH_COPY);
    captureEnglishOriginal(copy);
    applyGermanText(copy, germanFromMonster(library));
    expect(copy.name).toBe('Hauskatze');
    expect(copy.actions[0].desc).toBe(GERMAN_COPY.action);
  });

  it('ergänzt mit extras: false nichts, was nur das SRD führt', () => {
    const monster = cat();
    const record: GermanCreature = {
      ...KATZE,
      groups: { ...KATZE.groups, traits: [...KATZE.groups.traits!, { name: 'Zirkelmagie', desc: 'Nur im SRD.' }] },
    };
    expect(applyGermanText(monster, record, { extras: false })).toEqual([]);
    expect(monster.traits).toHaveLength(1);
  });

  it('ergänzt Einträge, die nur das deutsche SRD führt', () => {
    const monster = cat();
    const record: GermanCreature = {
      ...KATZE,
      groups: { ...KATZE.groups, traits: [...KATZE.groups.traits!, { name: 'Zirkelmagie', desc: 'Nur im SRD.' }] },
    };
    const notes = applyGermanText(monster, record);
    expect(monster.traits[1]).toEqual({ name: 'Zirkelmagie', name_en: '', desc: 'Nur im SRD.', desc_en: '' });
    expect(notes.join(' ')).toContain('nur im deutschen SRD');
  });
});
