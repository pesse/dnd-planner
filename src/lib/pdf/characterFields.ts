// Mapping der PDF-Feldnamen (Taendler v2.8.x) auf unser Datenmodell. Das PDF ist reines
// AUSGABEformat — gelesen wird es nicht mehr. Die Datentypen leben im Zod-Schema
// (schemas/characterSchema.ts) und werden hier nur re-exportiert.

import type { Character, CharacterSpells, Attack, SpellEntry, SpellRef, ProficiencyFlags, PersonalData, CharacterFeatureEntry, CharacterClass, CharacterSpecies, CharacterBackground } from '../schemas/characterSchema';
import type { SpellAccessValues } from '../services/spellcasting/access';
import type { AbilityKey } from '../schemas/abilities';
import { sign } from '../utils/num';

/** Der legitime Übersetzungsrand — die PDF-Feldnamen, vom Taendler-Formular diktiert. */
export const PDF_ABILITY_FIELD: Record<AbilityKey, string> = {
  str: 'Str', dex: 'Ges', con: 'Kon', int: 'Int', wis: 'Wei', cha: 'Cha',
};

export type {
  Character,
  CharacterSpells,
  Attack,
  SpellEntry,
  SpellRef,
  ProficiencyFlags,
  PersonalData,
  CharacterFeatureEntry,
  CharacterClass,
  CharacterSpecies,
  CharacterBackground,
};

/** Bisheriger Name des Charakter-Datentyps — Alias auf das Zod-Schema. */
export type CharacterData = Character;
/** JSON-Speicherformat (Metadaten sind Teil von Character). */
export type CharacterJSON = Character;

/** Zauber-Textfelder je Grad in der Taendler-Vorlage. */
export const SPELL_FIELDS_PER_LEVEL: Record<number, number> = { 1:13, 2:13, 3:13, 4:13, 5:9, 6:9, 7:9, 8:7, 9:7 };

export function emptyProficiencies(): ProficiencyFlags {
  return {
    simpleWeapons: false, martialWeapons: false, individualWeapons: [], otherWeapons: '',
    lightArmor: false, mediumArmor: false, heavyArmor: false, shields: false,
  };
}

export function emptyPersonal(): PersonalData {
  return {
    rassenmerkmale: '', alter: '', geschlecht: '', sizeCat: '',
    gesinnung: '', glaube: '', lebensstil: '', taeglicheKosten: '',
    augenfarbe: '', haarfarbe: '', hautfarbe: '', gewicht: '',
    koerpergroesse: '', aussehen: '',
  };
}

/**
 * „Eingeweihter der Magie: … **(SG 13, Angriff +5)**" — das PDF hat nur EINEN Zauberblock und
 * der gehört der Klasse. Die Marke wird beim Export gerechnet statt gespeichert (der
 * Übungsbonus steigt auf 5/9/13/17); `withSpellValues` schneidet eine vorhandene vorher ab,
 * sonst wüchse sie mit jedem Export.
 */
const SPELL_VALUES_MARK = /\s*\(SG \d+, Angriff [+-]\d+\)/g;

export function stripSpellValues(text: string): string {
  return text.replace(SPELL_VALUES_MARK, '');
}

/** Trägt die Notizzeile dieses Zugangs schon (Merkmal + Attribut müssen passen). */
const isNoteFor = (line: string, v: SpellAccessValues): boolean =>
  line.trimStart().startsWith(`${v.featureDe}:`) && line.includes(`Zauber über ${v.abilityDe}`);

/**
 * Hängt die Werte an die vorhandene Notizzeile — fehlt sie (Altbestand, gelöschter Text),
 * entsteht eine neue in derselben Form. Idempotent: eine alte Marke fällt vorher weg.
 */
export function withSpellValues(text: string, rows: SpellAccessValues[]): string {
  if (!rows.length) return text;

  const base = stripSpellValues(text);
  const lines = base ? base.split('\n') : [];
  const used = new Set<number>();
  const added: string[] = [];
  for (const v of rows) {
    const mark = ` (SG ${v.saveDC}, Angriff ${sign(v.attackBonus)})`;
    const i = lines.findIndex((l, idx) => !used.has(idx) && isNoteFor(l, v));
    if (i >= 0) {
      used.add(i);
      lines[i] += mark;
    } else {
      added.push(`${v.featureDe}: Zauber über ${v.abilityDe}${mark}`);
    }
  }
  return [...lines, ...added].join('\n');
}

