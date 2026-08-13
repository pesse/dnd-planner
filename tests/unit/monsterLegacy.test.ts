/**
 * `upgradeLegacyMonster` gegen die Schreibweisen, die im Vault tatsächlich stehen — deshalb
 * sind die Fälle hier gekürzte Kopien echter Dateien, keine erdachten Formen.
 *
 * Der Konverter läuft bei JEDEM Laden (`migrateMonsterLegacy`) und im Migrationsskript. Beide
 * müssen dasselbe Ergebnis liefern und ein zweiter Lauf darf nichts mehr ändern.
 */
import { describe, it, expect } from 'vitest';
import { upgradeLegacyMonster } from '../../src/lib/schemas/monsterLegacy';
import { parseMonster } from '../../src/lib/utils/schemaValidation';
import type { Monster } from '../../src/lib/schemas/monster';

/** Nach `vault/monsters/tiere/katze.json`: metrische Bewegung, deutsche Fertigkeiten, HG „0". */
const KATZE = {
  name: 'Katze',
  size: 'Tiny',
  type: 'beast',
  alignment: 'unaligned',
  ac: { value: 12, note: '' },
  hp: { average: 2, formula: '1d4' },
  speed: '12 m, Klettern 9 m',
  stats: { str: 3, dex: 15, con: 10, int: 3, wis: 12, cha: 7 },
  saving_throws: {},
  skills: { Wahrnehmung: '+3', Heimlichkeit: '+4' },
  damage_resistances: [],
  damage_immunities: [],
  condition_immunities: [],
  senses: 'passive Wahrnehmung 13',
  languages: '',
  cr: '0',
  xp: 10,
  traits: [{ name: 'Scharfes Riechvermögen', description: 'Vorteil bei Weisheit (Wahrnehmung).' }],
  actions: [
    {
      name: 'Klauen',
      description: 'Nahkampf-Angriff: +0 zum Treffer, Reichweite 1,5 m. Treffer: 1 Hiebschaden.',
      attack_bonus: 0,
      damage: [{ dice: '1', type: 'Hieb' }],
    },
  ],
  reactions: [],
  legendary_actions: [],
  index: 'cat',
  source: 'srd-2024',
};

/** Nach `hobgoblin-hauptmann.json`: Rettungswürfe mit „WEI", Bonusaktion, DM-Prosa daneben. */
const HOBGOBLIN = {
  name: 'Hobgoblin-Hauptmann',
  size: 'Medium',
  type: 'humanoid',
  alignment: 'lawful evil',
  ac: { value: 17, note: 'Kettenhemd, Schild' },
  hp: { average: 39, formula: '6d8+12' },
  speed: '9 m',
  stats: { str: 15, dex: 14, con: 14, int: 12, wis: 10, cha: 13 },
  saving_throws: { STR: '+4', DEX: '+4', CON: '+4', INT: '+0', WEI: '+2', CHA: '+3' },
  skills: { Wahrnehmung: '+2' },
  senses: 'Dunkelsicht 18m, passives Wahrnehmung 12',
  languages: 'Goblinisch, Gemeinsprache',
  cr: '3',
  xp: 700,
  description: 'Ein disziplinierter Truppenführer.',
  tactics: 'Runde 1: Truppenbefehl.',
  traits: [],
  actions: [
    {
      name: 'Mehrfachangriff',
      description: 'Der Hauptmann greift zweimal an.',
      attack_bonus: -1,
    },
    {
      name: 'Langschwert',
      description: 'Nahkampf-Angriff: +4, Reichweite 1,5 m.',
      attack_bonus: 4,
      damage: [{ dice: '1W8+3', type: 'Hiebschaden' }],
    },
  ],
  bonus_actions: [{ name: 'Truppenbefehl', description: 'Ein Verbündeter greift an.' }],
  reactions: [{ name: 'Parade', description: 'Erhöht die RK um 2.' }],
  legendary_actions: [],
};

/** Nach `fehlerhafte-kontroll-drohne.json`: Sammel-Strings, Schwebeflug, unbekannte Schadensart. */
const DROHNE = {
  index: '',
  name: 'Fehlerhafte Kontroll Drohne',
  size: 'Tiny',
  type: 'construct',
  alignment: 'unaligned',
  ac: { value: 13, note: 'Leichte Panzerung' },
  hp: { average: 11, formula: '2d4+2' },
  speed: '0 m, Flug 12 m (Schwebefähigkeit)',
  stats: { str: 6, dex: 14, con: 12, int: 10, wis: 8, cha: 5 },
  saving_throws: {},
  skills: { Wahrnehmung: '+1' },
  damage_resistances: ['Gift'],
  damage_immunities: ['Gift, Psychisch'],
  condition_immunities: ['Betäubt, Bezaubert, Erschöpfung, Furcht, Gelähmt, Vergiftet'],
  senses: 'Dunkelsicht 18 m, Passive Wahrnehmung 11',
  languages: 'Versteht alle Sprachen, kann aber nicht sprechen',
  cr: '1/4',
  xp: 50,
  traits: [{ name: 'Hackbar', description: 'DC 12 Geschicklichkeit deaktiviert sie.' }],
  actions: [
    {
      name: 'Überwachungsstrahl',
      description: 'Nahkampfangriff: +4, Reichweite 1,5 m.',
      attack_bonus: 4,
      damage: [{ dice: '1d4+2', type: 'Strahl' }],
    },
  ],
  reactions: [{ name: 'Ausweichmanöver', description: 'Halbiert den Schaden.' }],
  legendary_actions: [],
};

/** Nach `blood-hawk.json`: englische Bewegungsprosa, HG „1/8", Schaden als String. */
const BLUTFALKE = {
  name: 'Blood Hawk',
  size: 'Small',
  type: 'beast',
  alignment: 'unaligned',
  ac: { value: 12, note: '' },
  hp: { average: 7, formula: '2d6' },
  speed: '3 m gehen, 18 m fliegen',
  stats: { str: 6, dex: 14, con: 10, int: 3, wis: 14, cha: 5 },
  skills: { Wahrnehmung: '+4' },
  senses: 'Passive Wahrnehmung 14',
  languages: '—',
  cr: '1/8',
  xp: 25,
  actions: [{ name: 'Schnabel', description: 'Treffer: 4 Stichschaden.', attack_bonus: 4, damage: '1W6+2 Stich' }],
};

const upgrade = (raw: Record<string, unknown>): Monster => {
  const parsed = parseMonster(upgradeLegacyMonster(raw));
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.data;
};

describe('upgradeLegacyMonster', () => {
  it('rechnet metrische Bewegung in Fuß und hängt Schwebeflug an', () => {
    expect(upgrade(KATZE).speed).toEqual({ walk: 40, climb: 30, fly: 0, swim: 0, burrow: 0, hover: false });
    expect(upgrade(BLUTFALKE).speed.walk).toBe(10);
    expect(upgrade(BLUTFALKE).speed.fly).toBe(60);
    const drohne = upgrade(DROHNE);
    expect(drohne.speed.walk).toBe(0);
    expect(drohne.speed.fly).toBe(40);
    expect(drohne.speed.hover).toBe(true);
  });

  it('liest Sinne und wirft die gerechnete passive Wahrnehmung weg', () => {
    expect(upgrade(KATZE).senses).toEqual({ darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 });
    expect(upgrade(HOBGOBLIN).senses.darkvision).toBe(60);
    expect(upgrade(DROHNE).senses.darkvision).toBe(60);
  });

  it('normalisiert Rettungswurf-Schlüssel samt „WEI" und „kon"', () => {
    expect(upgrade(HOBGOBLIN).saving_throws).toEqual({ str: 4, dex: 4, con: 4, int: 0, wis: 2, cha: 3 });
    expect(upgrade({ ...KATZE, saving_throws: { kon: '+1' } }).saving_throws).toEqual({ con: 1 });
  });

  it('übersetzt deutsche Fertigkeitsnamen auf die englischen SRD-Namen', () => {
    expect(upgrade(KATZE).skill_bonuses).toEqual({ Perception: 3, Stealth: 4 });
  });

  it('zerlegt Sammel-Strings in Listen und behält Unbekanntes als Prosa', () => {
    const drohne = upgrade(DROHNE);
    expect(drohne.damage_immunities).toEqual(['poison', 'psychic']);
    expect(drohne.damage_resistances).toEqual(['poison']);
    expect(drohne.condition_immunities).toEqual([
      'stunned', 'charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned',
    ]);
    // „Strahl" ist keine SRD-Schadensart — der Wurf bleibt, die Art fehlt.
    expect(drohne.actions[0].attacks[0].damage).toEqual({ die_count: 1, die_type: 'D4', bonus: 2 });
  });

  it('macht aus dem Bruch-HG eine Zahl', () => {
    expect(upgrade(KATZE).challenge_rating).toBe(0);
    expect(upgrade(BLUTFALKE).challenge_rating).toBe(0.125);
    expect(upgrade(DROHNE).challenge_rating).toBe(0.25);
    expect(upgrade(HOBGOBLIN).challenge_rating).toBe(3);
  });

  it('führt Rüstung und Trefferpunkte in flachen Feldern', () => {
    const hob = upgrade(HOBGOBLIN);
    expect(hob.armor_class).toBe(17);
    expect(hob.armor_detail).toBe('Kettenhemd, Schild');
    expect(hob.hit_points).toBe(39);
    expect(hob.hit_dice).toBe('6d8+12');
  });

  it('legt die vier Aktionslisten zu einer zusammen, Merkmale bleiben getrennt', () => {
    const hob = upgrade(HOBGOBLIN);
    expect(hob.actions.map((a) => [a.name, a.action_type])).toEqual([
      ['Mehrfachangriff', 'ACTION'],
      ['Langschwert', 'ACTION'],
      ['Truppenbefehl', 'BONUS_ACTION'],
      ['Parade', 'REACTION'],
    ]);
    expect(upgrade(KATZE).traits.map((t) => t.name)).toEqual(['Scharfes Riechvermögen']);
  });

  it('macht aus „1W8+3 Hiebschaden" einen strukturierten Angriff', () => {
    const langschwert = upgrade(HOBGOBLIN).actions[1];
    expect(langschwert.attacks).toEqual([
      {
        name: 'Langschwert',
        attack_type: 'WEAPON',
        to_hit_mod: 4,
        target_creature_only: false,
        damage: { die_count: 1, die_type: 'D8', bonus: 3, type: 'slashing' },
      },
    ]);
    // Schaden als EIN String (13 Dateien im Bestand) läuft über denselben Weg.
    expect(upgrade(BLUTFALKE).actions[0].attacks[0].damage).toEqual({
      die_count: 1, die_type: 'D6', bonus: 2, type: 'piercing',
    });
  });

  it('macht aus dem Platzhalter-Angriffsbonus keinen Angriff', () => {
    expect(upgrade(HOBGOBLIN).actions[0].attacks).toEqual([]);
  });

  it('trennt Sprachliste von Sprachprosa', () => {
    expect(upgrade(HOBGOBLIN).languages).toEqual(['Goblinisch', 'Gemeinsprache']);
    expect(upgrade(DROHNE).languages).toEqual([]);
    expect(upgrade(DROHNE).languages_desc).toContain('kann aber nicht sprechen');
  });

  it('rettet den englischen Handle aus dem alten `index`', () => {
    expect(upgrade(KATZE).name_en).toBe('Cat');
    expect(upgradeLegacyMonster({ ...KATZE, index: 'giant-wolf-spider' }).name_en).toBe('Giant Wolf Spider');
    expect(upgrade(DROHNE).name_en).toBe('');
  });

  it('behält handgeschriebene Spielleiter-Prosa, die das Schema nicht kennt', () => {
    const raw = upgradeLegacyMonster(HOBGOBLIN as unknown as Record<string, unknown>);
    expect(raw.description).toBe('Ein disziplinierter Truppenführer.');
    expect(raw.tactics).toBe('Runde 1: Truppenbefehl.');
  });

  it('lässt eine bereits umgestellte Datei unverändert', () => {
    for (const legacy of [KATZE, HOBGOBLIN, DROHNE, BLUTFALKE]) {
      const once = upgradeLegacyMonster(legacy as unknown as Record<string, unknown>);
      const twice = upgradeLegacyMonster(structuredClone(once));
      expect(twice).toEqual(once);
    }
  });
});
