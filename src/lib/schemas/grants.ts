/**
 * Was ein Bibliotheks-Artefakt deterministisch GEWÄHRT: Übungen, Zauberlisten,
 * pro-Stufe-Zunahmen und Grundeigenschaften.
 */
import { z } from 'zod';
import { ABILITY_NAMES } from './abilities';
import {
  ARMOR_TRAININGS,
  MONSTER_SIZE_KEYS,
  SKILL_NAMES,
  WEAPON_CATEGORIES,
  readSkillName,
  splitRuleList,
  type SkillName,
} from './vocabulary';

/**
 * `kind` ist ein Diskriminator über die Formen in `grantedSpells.ts`, KEIN Parse-Rezept — ein
 * Regex im Content wäre Code im Inhalt. Die Namen stehen nur in der Tabelle im `desc`.
 */
export const SPELL_GRANT_KINDS = ['levelTable'] as const;
export type SpellGrantKind = (typeof SPELL_GRANT_KINDS)[number];

export const spellGrantSchema = z.object({
  kind: z.enum(SPELL_GRANT_KINDS).describe('Form, in der die Liste im Merkmalstext steht.'),
});
export type SpellGrant = z.infer<typeof spellGrantSchema>;

/** Wahl-fähiger Fertigkeits-Grant. `from: []` bei `choose > 0` = beliebige Fertigkeit. */
export const skillGrantSchema = z.object({
  fixed: z.array(z.enum(SKILL_NAMES)).default([]).describe('Ohne Wahl gewährte Fertigkeiten.'),
  choose: z.number().int().min(0).default(0).describe('Wie viele Fertigkeiten frei gewählt werden.'),
  from: z.array(z.enum(SKILL_NAMES)).default([]).describe('Auswahlliste; leer = beliebige Fertigkeit.'),
});

/** Default-Literal, damit `z.toJSONSchema` es inline auflöst — gilt für alle `empty*` hier. */
export const emptySkillGrant = (): SkillGrant => ({ fixed: [], choose: 0, from: [] });

/**
 * EINE Form für alle vier Artefakttypen — nur deshalb ist die Summierung über alle Quellen
 * eine Funktion und nicht vier (services/proficiencyGrants.ts).
 */
export const proficiencyGrantSchema = z.object({
  skills: skillGrantSchema.default(emptySkillGrant),
  savingThrows: z.array(z.enum(ABILITY_NAMES)).default([]),
  weapons: z.array(z.enum(WEAPON_CATEGORIES)).default([]),
  weaponsOther: z
    .array(z.string())
    .default([])
    .describe('Waffen-Übungen außerhalb der zwei Kategorien, z.B. "Martial weapons that have the Light property".'),
  armor: z.array(z.enum(ARMOR_TRAININGS)).default([]),
});

export const emptyProficiencyGrant = (): ProficiencyGrant => ({
  skills: emptySkillGrant(),
  savingThrows: [],
  weapons: [],
  weaponsOther: [],
  armor: [],
});

export type SkillGrant = z.infer<typeof skillGrantSchema>;
export type ProficiencyGrant = z.infer<typeof proficiencyGrantSchema>;

/**
 * Zunahme PRO CHARAKTERSTUFE, nicht der Einmal-Schub beim Erwerb. Objekt statt Zahl, damit
 * ein zweites Ziel keine Schemamigration braucht.
 */
export const perLevelGrantSchema = z.object({
  hpMax: z.number().int().default(0).describe('Zunahme des TP-Maximums je Charakterstufe.'),
});

export const emptyPerLevelGrant = (): PerLevelGrant => ({ hpMax: 0 });

/**
 * Je Eigenschaft ein eigenes Feld statt `{property, value}`: nur so steht die Wertemenge im
 * Schema und ist die Senke über `keyof` total (`PROPERTY_ROUTES`). Werte in der SPRACHE DER
 * REGELN; Kreaturentyp und Dunkelsicht sind Bogen-Notiz, keine Eigenschaft.
 */
export const CHARACTER_PROPERTIES = ['size', 'speedFeet'] as const;
export type CharacterPropertyName = (typeof CHARACTER_PROPERTIES)[number];

export const characterPropertiesSchema = z.object({
  size: z
    .enum(MONSTER_SIZE_KEYS)
    .optional()
    .describe('Größenkategorie, englisches Vokabular. Fehlt = das Merkmal legt sie nicht fest.'),
  speedFeet: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Grundbewegungsrate in FUSS (Einheit des Regeltexts); die Umrechnung in Meter passiert beim Anwenden.'),
});
export type CharacterProperties = z.infer<typeof characterPropertiesSchema>;

/**
 * An den drei Trägern OPTIONAL OHNE DEFAULT: fehlt das Feld, ist das Merkmal nicht redigiert
 * und läuft weiter über die KI-Kette, `{}` heißt „geprüft, gewährt nichts". Ohne diese
 * Unterscheidung verlöre ein importiertes Merkmal seine Mechanik unbemerkt.
 */
export const featureGrantSchema = z.object({
  /**
   * `skills.choose` ist erlaubt (Elf, „Skilled"), hat aber eine ANDERE Senke: `collectGrants`
   * stellt die Frage im Fertigkeitsschritt, `withGrant`/`proficiencyGrantChanges` wenden nur
   * `skills.fixed` an. Offene Wahl wird gefragt, fester Grant gesetzt.
   */
  proficiencies: proficiencyGrantSchema.default(emptyProficiencyGrant),
  extraCantrips: z.number().int().default(0).describe('Zusätzlich FREI wählbare Zaubertricks („einen zusätzlichen Zaubertrick aus der Druiden-Zauberliste").'),
  extraPreparedCount: z.number().int().default(0).describe('Zusätzlich vorbereitbare Zauber über die Stufentabelle hinaus.'),
  perLevel: perLevelGrantSchema.default(emptyPerLevelGrant),
  /**
   * Die einzige Grant-Art, die NICHT über den Rider reist: der Rider ist das Ausgabevokabular
   * des Modells, eine Größe darin hieße, Pass C dürfte sie erfinden.
   */
  properties: characterPropertiesSchema.default({}),
});

/**
 * Über `keyof ProficiencyGrant` total: ein neues Übungsfeld bricht den Build, statt hier
 * still als „leer" durchzugehen — und ein leerer Grant filtert das ganze Merkmal weg.
 */
export function isEmptyProficiencyGrant(g: ProficiencyGrant | undefined): boolean {
  if (!g) return true;
  const filled: { [K in keyof ProficiencyGrant]: () => boolean } = {
    skills: () => g.skills.fixed.length > 0 || g.skills.choose > 0,
    savingThrows: () => g.savingThrows.length > 0,
    weapons: () => g.weapons.length > 0,
    weaponsOther: () => g.weaponsOther.length > 0,
    armor: () => g.armor.length > 0,
  };
  return !Object.values(filled).some((has) => has());
}

export type PerLevelGrant = z.infer<typeof perLevelGrantSchema>;
export type FeatureGrant = z.infer<typeof featureGrantSchema>;

/**
 * Hebt das Altfeld `proficiencyGrant` nach `grants.proficiencies` und LÖSCHT es, damit keine
 * zweite Wahrheit bleibt. Muss auf JEDEM Lesepfad laufen: die Schemas sind nicht `strict`,
 * ein vergessener Pfad verliert die Übung stumm statt mit Parse-Fehler.
 */
export function foldLegacyProficiencyGrant(obj: Record<string, unknown>): Record<string, unknown> {
  const legacy = obj.proficiencyGrant;
  delete obj.proficiencyGrant;
  const parsed = proficiencyGrantSchema.safeParse(legacy);
  if (!parsed.success || isEmptyProficiencyGrant(parsed.data)) return obj;

  const grants = (obj.grants ?? {}) as Record<string, unknown>;
  if (isEmptyProficiencyGrant(proficiencyGrantSchema.safeParse(grants.proficiencies).data)) {
    grants.proficiencies = parsed.data;
    obj.grants = grants;
  }
  return obj;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/**
 * Die drei im SRD 5.2 vorkommenden Prosa-Formen:
 *   „…in the Insight, Perception, or Survival skill" → {choose:1, from:[…]}
 *   „…in one skill of your choice"                   → {choose:1, from:[]}
 *   „…in any combination of three skills or tools"   → {choose:3, from:[]}
 * Bewusst TOLERANT (null statt Wurf): der Aufrufer schickt jede Prosa durch, und alles
 * Nicht-Modellierbare soll Prosa bleiben.
 */
export function parseProseSkillGrant(desc: string): SkillGrant | null {
  const match = desc.match(/proficienc(?:y|ies)\s+in\s+([^.;]+)/i);
  if (!match) return null;
  const phrase = match[1].trim();

  const counted = phrase.match(/\b(one|two|three|four|five|\d+)\s+(?:more\s+)?skills?\b/i);
  if (counted && /choice|combination/i.test(phrase)) {
    const n = NUMBER_WORDS[counted[1].toLowerCase()] ?? Number(counted[1]);
    return n > 0 ? { fixed: [], choose: n, from: [] } : null;
  }

  // Benannte Fertigkeiten. Ein „or" macht daraus eine Wahl, ein „and" einen festen Grant.
  const names: SkillName[] = [];
  for (const part of splitRuleList(phrase)) {
    const skill = readSkillName(part);
    if (!skill) return null; // Prosa, die diese App nicht als Übung modelliert
    if (!names.includes(skill)) names.push(skill);
  }
  if (!names.length) return null;
  return /\bor\b/i.test(phrase)
    ? { fixed: [], choose: 1, from: names }
    : { fixed: names, choose: 0, from: [] };
}
