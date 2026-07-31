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
 * Immer-vorbereitete Zauberliste eines Merkmals (Kreis-, Domänen-, Eid-, Patronenzauber).
 * `kind` ist ein Diskriminator über die Formen in `grantedSpells.ts`, KEIN Parse-Rezept —
 * ein Regex im Content wäre Code im Inhalt. Die Namen stehen nur in der Tabelle im `desc`;
 * eine zweite Fassung im JSON liefe auseinander.
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

/** Leerer Fertigkeits-Grant (Default-Literal, damit `z.toJSONSchema` es inline auflöst). */
export const emptySkillGrant = (): SkillGrant => ({ fixed: [], choose: 0, from: [] });

/**
 * Was ein Bibliotheks-Artefakt an Übungen gewährt — EINE Form für alle vier
 * Artefakttypen (Klasse, Hintergrund, Spezies-Merkmal, Talent). Genau das ist
 * der Punkt: die Summierung über alle Quellen ist dann eine Funktion, nicht vier
 * (services/proficiencyGrants.ts). Hintergründe füllen nur `skills`, Klassen alles.
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

/** Leerer Übungs-Grant (Default-Literal für `.default()`). */
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
 * Zunahme PRO CHARAKTERSTUFE — Objekt statt Zahl, damit ein zweites Ziel keine
 * Schemamigration braucht. NICHT der Einmal-Schub beim Erwerb („um das Doppelte deiner
 * Charakterstufe"): der ist eine Funktion der Stufe, nicht ein Wert je Stufe.
 */
export const perLevelGrantSchema = z.object({
  hpMax: z.number().int().default(0).describe('Zunahme des TP-Maximums je Charakterstufe.'),
});

/** Leerer pro-Stufe-Grant (Default-Literal für `.default()`). */
export const emptyPerLevelGrant = (): PerLevelGrant => ({ hpMax: 0 });

/**
 * Grundeigenschaften, die ein Merkmal FESTLEGT. Je Eigenschaft ein eigenes Feld statt
 * eines `{property, value}`-Paars: nur so steht die Wertemenge im Schema und ist die
 * Senke über `keyof` total (`PROPERTY_ROUTES`, services/characterProperties.ts).
 *
 * Werte in der SPRACHE DER REGELN (englische Größe, Fuß) — deutsch und metrisch wird erst
 * beim Anwenden des `Change`. Kreaturentyp und Dunkelsicht stehen bewusst NICHT hier: sie
 * haben am Charakter kein Feld und sind Bogen-Notiz, keine Eigenschaft.
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
 * Was ein Merkmal deterministisch GEWÄHRT — dritte Deklaration neben `grantsChoice` und
 * `grantsSpells`, mit demselben Zweck: das Merkmal aus der KI-Deutung herausnehmen.
 *
 * An den drei Trägern OPTIONAL OHNE DEFAULT: fehlt das Feld, ist das Merkmal nicht
 * redigiert und läuft weiter über die KI-Kette, `{}` heißt „geprüft, gewährt nichts".
 * Ohne diese Unterscheidung verlöre ein importiertes Merkmal seine Mechanik unbemerkt.
 */
export const featureGrantSchema = z.object({
  /**
   * Übungen in derselben Form wie an Klasse/Hintergrund/Spezies/Talent — genau darum ist die
   * Summierung über alle Quellen EINE Funktion (services/proficiencyGrants.ts).
   *
   * `skills.choose` ist erlaubt und wird benutzt (Elf „Keen Senses", Talent „Skilled"), aber
   * von einer ANDEREN Senke: `collectGrants` stellt die Frage im Fertigkeitsschritt, während
   * `withGrant`/`proficiencyGrantChanges` nur `skills.fixed` anwenden. Die beiden Wege sind
   * disjunkt — eine offene Wahl wird gefragt, ein fester Grant gesetzt.
   */
  proficiencies: proficiencyGrantSchema.default(emptyProficiencyGrant),
  extraCantrips: z.number().int().default(0).describe('Zusätzlich FREI wählbare Zaubertricks („einen zusätzlichen Zaubertrick aus der Druiden-Zauberliste").'),
  extraPreparedCount: z.number().int().default(0).describe('Zusätzlich vorbereitbare Zauber über die Stufentabelle hinaus.'),
  perLevel: perLevelGrantSchema.default(emptyPerLevelGrant),
  /**
   * Grundeigenschaften. Die einzige Grant-Art, die NICHT über den Rider reist: der Rider ist
   * das Ausgabevokabular des Modells, eine Größe darin hieße, Pass C dürfte sie erfinden.
   * Senke ist `characterPropertyChanges` (services/characterProperties.ts).
   */
  properties: characterPropertiesSchema.default({}),
});

/** true, wenn der Grant nichts gewährt. */
export function isEmptyProficiencyGrant(g: ProficiencyGrant | undefined): boolean {
  if (!g) return true;
  return (
    !g.skills.fixed.length && !g.skills.choose &&
    !g.savingThrows.length && !g.weapons.length && !g.weaponsOther.length && !g.armor.length
  );
}

export type PerLevelGrant = z.infer<typeof perLevelGrantSchema>;
export type FeatureGrant = z.infer<typeof featureGrantSchema>;

/**
 * Altformat: die Übungs-Senke stand als `proficiencyGrant` NEBEN der Deklaration; jetzt darin
 * (`grants.proficiencies`). Betrifft Speziesmerkmale und Talente — am Klassenkopf und am
 * Hintergrund bleibt `proficiencyGrant`, dort ist es kein Merkmal.
 *
 * Das Altfeld wird GELÖSCHT, damit keine zweite Wahrheit zurückbleibt; eine vorhandene
 * Deklaration gewinnt. Muss auf JEDEM Lesepfad laufen: `traitSchema`/`featSchema` sind nicht
 * `strict`, ein vergessener Pfad verliert die Übung also stumm statt mit Parse-Fehler.
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
 * Liest einen Fertigkeits-Grant aus REGEL-PROSA (Spezies-Merkmale, Talente) —
 * anders als die Kerntabelle der Klassen, die eine feste Tabellenform hat.
 * Erkannt werden die drei im SRD 5.2 vorkommenden Formen:
 *
 *   „proficiency in the Insight, Perception, or Survival skill"   → {choose:1, from:[…]}
 *   „proficiency in one skill of your choice"                     → {choose:1, from:[]}
 *   „proficiency in any combination of three skills or tools …"   → {choose:3, from:[]}
 *
 * Bewusst TOLERANT (null statt Wurf): der Aufrufer schickt jede Merkmals-Prosa
 * durch, und alles Nicht-Modellierbare soll einfach Prosa bleiben. Der Wurf-Pfad
 * gehört der Kerntabelle, wo jede Abweichung ein Parser-Fehler ist.
 */
export function parseProseSkillGrant(desc: string): SkillGrant | null {
  const match = desc.match(/proficienc(?:y|ies)\s+in\s+([^.;]+)/i);
  if (!match) return null;
  const phrase = match[1].trim();

  // Freie Wahl mit Anzahl („one skill of your choice", „three skills or tools").
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
