// Mapping der PDF-Feldnamen (Taendler v2.8.x) auf unser Datenmodell; die Rechen-
// formeln stammen aus dem extrahierten PDF-JavaScript. Die Datentypen leben im
// Zod-Schema (schemas/characterSchema.ts) und werden hier nur re-exportiert.

import type { Character, CharacterSpells, Attack, SpellEntry, SpellRef, ProficiencyFlags, PersonalData, CharacterFeatureEntry, CharacterClass, CharacterSpecies, CharacterBackground } from '../schemas/characterSchema';
import type { SpellAccessValues } from '../services/spellcasting/access';
import { SKILL_DEFS, mod } from '../domain/skills';
import { MASTERY_BY_LABEL } from '../itemLabels';
import { int as toInt, sign } from '../utils/num';
import { emptySpellcasting } from '../services/spellcasting/write';
import { ABILITY_KEYS, type AbilityKey, type AbilityScores } from '../schemas/abilities';

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

export function emptySpells(): CharacterSpells {
  return {
    spellcastingClass: '',
    spellcastingAbility: '',
    saveDC: 0,
    attackBonus: 0,
    autoCalc: false,
    slots: Array.from({ length: 9 }, () => ({ total: 0, used: 0 })),
    cantrips: [],
    byLevel: {},
  };
}

/**
 * Gegenstück zu `withMasterySuffix` (characterExport.ts) — ohne das wüchse der Waffenname
 * bei jedem Export/Import-Zyklus. Entfernt NUR eine bekannte Meisterschaftseigenschaft,
 * „Langschwert (+1)" bleibt; `MASTERY_BY_LABEL` ist die Anzeigetabelle rückwärts gelesen.
 */
export function stripMasterySuffix(name: string): string {
  const m = name.match(/^(.*\S)\s*\(([^()]+)\)\s*$/);
  return m && MASTERY_BY_LABEL[m[2].trim().toLowerCase()] ? m[1] : name;
}

/**
 * „Eingeweihter der Magie: … **(SG 13, Angriff +5)**" — das PDF hat nur EINEN Zauberblock und
 * der gehört der Klasse. Die Marke wird beim Export gerechnet statt gespeichert (der
 * Übungsbonus steigt auf 5/9/13/17) und beim Import wieder abgeschnitten, sonst wächst sie
 * je Zyklus. Beide Richtungen stehen hier: eine Form, eine Datei.
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

/** Die drei Lesarten eines Formularfeldes: Text, Zahl, Häkchen. */
interface FieldReader {
  f: (key: string) => string;
  num: (key: string) => number;
  prof: (key: string) => boolean;
}

function fieldReader(fields: Record<string, string>): FieldReader {
  const f = (key: string) => fields[key] ?? '';
  return { f, num: (key) => toInt(f(key)), prof: (key) => f(key) !== 'Off' && f(key) !== '' };
}

/** Fertigkeitswerte nach der Formel des PDF-Skripts (Alleskönner = halber Bonus, abgerundet). */
function parseSkills(
  r: FieldReader,
  attrMods: AbilityScores,
  profBonus: number,
  alleskoenner: boolean,
): CharacterData['skills'] {
  const skills: CharacterData['skills'] = {};
  for (const skill of SKILL_DEFS) {
    const isProficient = r.prof(skill.profField);
    const isExpertise = r.prof(skill.expField);
    const attrMod = attrMods[skill.attr];
    const value = isProficient
      ? attrMod + profBonus * (isExpertise ? 2 : 1)
      : alleskoenner ? Math.floor(attrMod + profBonus / 2) : attrMod;
    skills[skill.key] = { value, prof: isProficient, exp: isExpertise };
  }
  return skills;
}

function parseAttacks(r: FieldReader): Attack[] {
  const attacks: Attack[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = stripMasterySuffix(r.f(`Angriff${i}`));
    if (name) {
      attacks.push({
        name,
        bonus: r.f(`Bonus${i}`),
        damage: r.f(`Schaden${i}`),
        type: r.f(`Schadentyp${i}`),
        range: r.f(`Reichweite${i}`),
      });
    }
  }
  return attacks;
}

/** Die 6 Zeilen für Sprachen bzw. Werkzeuge; leere Zeilen fallen weg. */
function parseSixLines(r: FieldReader, prefix: string): string[] {
  return [1, 2, 3, 4, 5, 6].map((i) => r.f(`${prefix}${i}`)).filter(Boolean);
}

function parseInventory(r: FieldReader): CharacterData['inventory'] {
  const inventory: CharacterData['inventory'] = [];
  for (let i = 1; i <= 55; i++) {
    const name = r.f(`Inventar${i}`);
    if (name) inventory.push({ name, count: r.f(`InventarAnz${i}`), weight: r.f(`InventarGew${i}`) });
  }
  return inventory;
}

function parseSpellSlots(r: FieldReader): CharacterSpells['slots'] {
  const slots: CharacterSpells['slots'] = [];
  for (let lvl = 1; lvl <= 9; lvl++)
    slots.push({ total: r.num(`ZauberplätzeGesamt${lvl}`), used: r.num(`ZauberplätzeVerbraucht${lvl}`) });
  return slots;
}

function parseCantrips(r: FieldReader): CharacterSpells['cantrips'] {
  const cantrips: CharacterSpells['cantrips'] = [];
  for (let i = 1; i <= 8; i++) {
    const name = r.f(`Zaubertrick${i}`);
    if (name) cantrips.push({ name });
  }
  return cantrips;
}

function parseSpellsByLevel(r: FieldReader): CharacterSpells['byLevel'] {
  const byLevel: CharacterSpells['byLevel'] = {};
  for (let lvl = 1; lvl <= 9; lvl++) {
    const entries: SpellEntry[] = [];
    for (let i = 1; i <= SPELL_FIELDS_PER_LEVEL[lvl]; i++) {
      const name = r.f(`Zauber${lvl}_${i}`);
      if (name) entries.push({ name, prepared: r.prof(`ZauberActive${lvl}_${i}`) });
    }
    if (entries.length) byLevel[String(lvl)] = entries;
  }
  return byLevel;
}

function parseSpells(r: FieldReader): CharacterSpells {
  return {
    spellcastingClass: r.f('Zauberklasse'),
    spellcastingAbility: r.f('AttributZauberwirken'),
    saveDC: r.num('ZauberRettungswurfSG'),
    attackBonus: r.num('ZauberAngriffsbonus'),
    autoCalc: false,
    slots: parseSpellSlots(r),
    cantrips: parseCantrips(r),
    byLevel: parseSpellsByLevel(r),
  };
}

function parseProficiencies(r: FieldReader): ProficiencyFlags {
  return {
    simpleWeapons: r.prof('EinfachWaffenProf'),
    martialWeapons: r.prof('KriegswaffenProf'),
    // Das Formular hat für Einzelwaffen nur das eine Textfeld — der Import legt alles in den
    // Freitext, der Rundlauf ist hier bewusst verlustig. Zurück in die Liste holt es das
    // Altbestands-Angebot im Editor (`weaponsFix`, characterLegacyLinks.ts).
    individualWeapons: [],
    otherWeapons: r.f('SonstigeWaffen'),
    lightArmor: r.prof('LeichteRüstungProf'),
    mediumArmor: r.prof('MittlereRüstungProf'),
    heavyArmor: r.prof('SchwereRüstungProf'),
    shields: r.prof('SchildeProf'),
  };
}

function parsePersonal(r: FieldReader): PersonalData {
  return {
    rassenmerkmale: r.f('Rassenmerkmale'),
    alter: r.f('Alter'),
    geschlecht: r.f('Geschlecht'),
    sizeCat: r.f('SizeCat'),
    gesinnung: r.f('Gesinnung'),
    glaube: r.f('Glaube'),
    lebensstil: r.f('Lebensstil'),
    taeglicheKosten: r.f('TäglicheKosten'),
    augenfarbe: r.f('Augenfarbe'),
    haarfarbe: r.f('Haarfarbe'),
    hautfarbe: r.f('Hautfarbe'),
    gewicht: r.f('Gewicht'),
    koerpergroesse: r.f('Körpergrösse'),
    aussehen: r.f('Aussehen'),
  };
}

export function parseCharacterData(fields: Record<string, string>): CharacterData {
  const r = fieldReader(fields);
  const { f, num } = r;

  const profBonus = num('Übungsbonus');
  const alleskoenner = r.prof('Alleskoenner');

  const abilities = {} as AbilityScores;
  const mods = {} as AbilityScores;
  const saveProfs = {} as Record<AbilityKey, boolean>;
  for (const key of ABILITY_KEYS) {
    const field = PDF_ABILITY_FIELD[key];
    const score = num(field);
    abilities[key] = score;
    mods[key] = mod(score);
    saveProfs[key] = r.prof(`${field}Prof`);
  }

  return {
    // BEWUSST v1: PDF-Felder sind Freitext (Klasse/Volk/Hintergrund). Die Upgrade-Pipeline
    // (schemas/characterUpgrades.ts) strukturiert sie beim ersten Laden der geschriebenen Datei.
    _version: 1,
    name: f('Charaktername_page1'),
    classes: [], // strukturierte Klassen: aus classLevel beim Laden migriert (best-effort)
    classLevel: f('KlasseUndStufe'),
    playerName: f('Spielername'),
    // background- und species-Link wie im Editor: sourceKey leer (die Bibliotheks-
    // Verknüpfung entsteht dort), Name = Freitext aus dem Formularfeld.
    backgroundRef: { sourceKey: '', name: f('Hintergrund') },
    background: f('Hintergrund'),
    species: { sourceKey: '', name: f('Volk') },
    race: f('Volk'),
    xp: f('Erfahrungspunkte'),
    abilities, mods, saveProfs,
    ac: f('Rüstungsklasse'),
    initiative: f('Initiative'),
    speed: f('Bewegungsrate'),
    hpMax: f('TrefferpunkteMaximum'),
    hpCurrent: f('AktTrefferpunkte'),
    hpTemp: f('TempTrefferpunkte'),
    proficiencyBonus: profBonus,
    passivePerception: f('PassiveWeisheit'),
    hitDice: f('Trefferwürfel'),
    skills: parseSkills(r, mods, profBonus, alleskoenner),
    attacks: parseAttacks(r),
    classFeatures: stripSpellValues([f('Klassenmerkmale1'), f('Klassenmerkmale2')].filter(Boolean).join('\n\n')),
    traits: f('Persönlichkeitsmerkmale'),
    ideals: f('Ideale'),
    bonds: f('Bindungen'),
    flaws: f('Makel'),
    languages: parseSixLines(r, 'Sprache'),
    tools: parseSixLines(r, 'WerkzeugUndAndere'),
    alleskoenner,
    currency: { km: f('KM'), sm: f('SM'), em: f('EM'), gm: f('GM'), pm: f('PM') },
    inventory: parseInventory(r),
    inventoryNotes: '',
    totalWeight: f('Gesamtlast'),
    // Der PDF-Rand bleibt flach; `services/spellcasting/legacy.ts` hebt ihn beim Laden.
    spellcasting: emptySpellcasting(),
    spells: parseSpells(r),
    proficiencies: parseProficiencies(r),
    personal: parsePersonal(r),
    // Das PDF führt die Waffenbeherrschung nur als Namenssuffix am Angriff (oben
    // abgeschnitten) — welche Waffen gewählt sind, entscheidet der Editor.
    masteries: [],
    // Talent-Links und Merkmals-Entscheidungen sind nicht Teil des PDFs → leer starten.
    features: [],
  };
}
