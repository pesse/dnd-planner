/**
 * `mapOpen5eCreature` gegen zwei eingecheckte API-Antworten. Geprüft wird, was der Mapper
 * ENTSCHEIDET — Einheit (Fuß), abgeleitete Werte weglassen, eine Aktionsliste, Sprachprosa —
 * nicht das Durchschreiben von Zahlen.
 */
import { describe, it, expect } from 'vitest';
import { OPEN5E_CAT, OPEN5E_ANCIENT_RED_DRAGON } from '../fixtures/open5eCreatures';
import { mapOpen5eCreature } from '../../src/lib/services/open5eCreatureMapper';
import { parseMonster } from '../../src/lib/utils/schemaValidation';
import { saveBonus, passivePerception } from '../../src/lib/services/monsterDerived';

const cat = mapOpen5eCreature(OPEN5E_CAT);
const dragon = mapOpen5eCreature(OPEN5E_ANCIENT_RED_DRAGON);

describe('mapOpen5eCreature', () => {
  it('erzeugt schemakonforme Monster', () => {
    for (const monster of [cat, dragon]) {
      const parsed = parseMonster(monster);
      expect(parsed.ok, parsed.ok ? '' : parsed.errors.join('; ')).toBe(true);
    }
  });

  it('übernimmt Herkunft, Key und den englischen Namen doppelt', () => {
    expect(cat.key).toBe('srd-2024_cat');
    expect(cat.source).toBe('srd-2024');
    expect(cat.name).toBe('Cat');
    expect(cat.name_en).toBe('Cat');
  });

  it('normalisiert Größe und Typ auf das interne Vokabular', () => {
    expect(cat.size).toBe('Small');
    expect(cat.type).toBe('beast');
    expect(dragon.size).toBe('Gargantuan');
    expect(dragon.alignment).toBe('chaotic evil');
  });

  it('führt Herausforderungsgrad als Zahl', () => {
    expect(cat.challenge_rating).toBe(0);
    expect(dragon.challenge_rating).toBe(24);
  });

  it('speichert Bewegung und Sinne in Fuß', () => {
    expect(cat.speed).toEqual({ walk: 40, climb: 40, fly: 0, swim: 0, burrow: 0, hover: false });
    expect(cat.senses.darkvision).toBe(60);
    expect(dragon.senses).toEqual({ darkvision: 120, blindsight: 60, tremorsense: 0, truesight: 0 });
  });

  it('behält nur geübte Rettungswürfe — der Rest ist der blanke Attributsmodifikator', () => {
    // Open5e liefert alle sechs; beim Drachen sind nur GES und WEI wirklich geübt.
    expect(Object.keys(dragon.saving_throws).sort()).toEqual(['dex', 'wis']);
    expect(dragon.saving_throws.dex).toBe(7);
    expect(saveBonus(dragon, 'str')).toBe(10);
    expect(cat.saving_throws).toEqual({ dex: 4 });
  });

  it('übersetzt Fertigkeiten auf die englischen SRD-Namen', () => {
    expect(cat.skill_bonuses).toEqual({ Perception: 3, Stealth: 4 });
    expect(dragon.skill_bonuses).toEqual({ Perception: 16, Stealth: 7 });
    expect(passivePerception(dragon)).toBe(26);
  });

  it('verwirft die abgeleiteten Felder der API', () => {
    for (const field of ['modifiers', 'saving_throws_all', 'skill_bonuses_all', 'passive_perception', 'proficiency_bonus', 'speed_all']) {
      expect(field in dragon).toBe(false);
    }
  });

  it('liest Immunitäten als englische Schlüssel', () => {
    expect(dragon.damage_immunities).toEqual(['fire']);
    expect(dragon.damage_resistances).toEqual([]);
    expect(dragon.condition_immunities).toEqual([]);
  });

  it('hält die Sprachprosa zusammen mit der Liste', () => {
    expect(dragon.languages).toEqual(['Common', 'Draconic']);
    expect(dragon.languages_desc).toBe('');
    expect(cat.languages).toEqual([]);
  });

  it('legt Aktionen in EINE Liste, sortiert nach Aktionsart und Statblock-Reihenfolge', () => {
    const types = dragon.actions.map((a) => a.action_type);
    expect(types.slice(0, 4)).toEqual(['ACTION', 'ACTION', 'ACTION', 'ACTION']);
    expect(dragon.actions[0].name).toBe('Multiattack');
    expect(new Set(types)).toEqual(new Set(['ACTION', 'LEGENDARY_ACTION']));
    // Die legendären stehen hinten, in ihrer eigenen Reihenfolge.
    expect(dragon.actions.filter((a) => a.action_type === 'LEGENDARY_ACTION').map((a) => a.name)).toEqual([
      'Commanding Presence',
      'Fiery Rays',
      'Pounce',
    ]);
  });

  it('erhält Aufladungen', () => {
    const breath = dragon.actions.find((a) => a.name === 'Fire Breath');
    expect(breath?.usage_limits).toEqual({ type: 'RECHARGE_ON_ROLL', param: 5 });
  });

  it('baut strukturierte Angriffe samt Zusatzschaden', () => {
    const rend = dragon.actions.find((a) => a.name === 'Rend');
    expect(rend?.attacks).toEqual([
      {
        name: 'Rend attack',
        attack_type: 'WEAPON',
        to_hit_mod: 17,
        reach: 15,
        target_creature_only: false,
        damage: { die_count: 2, die_type: 'D8', bonus: 10, type: 'slashing' },
        extra_damage: { die_count: 3, die_type: 'D6', bonus: 0, type: 'fire' },
      },
    ]);
  });

  it('trennt Merkmale von Aktionen und füllt beide Sprachfelder', () => {
    expect(cat.traits).toHaveLength(1);
    expect(cat.traits[0].name).toBe('Jumper');
    expect(cat.traits[0].name_en).toBe('Jumper');
    expect(cat.traits[0].desc_en).toBe(cat.traits[0].desc);
    expect(cat.actions.map((a) => a.name)).toEqual(['Scratch']);
  });
});
