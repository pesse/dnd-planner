/**
 * Die Kerntabelle („Core Traits") einer Open5e-v2-Klasse aus ihrer Markdown-Prosa lesen
 * und eine rohe v2-Klasse auf den internen Typ abbilden.
 *
 * Bewusst `invoke`-frei, wie die Open5e-Mapper: der Node-Importer bündelt `parseCoreTraits`
 * direkt.
 */
import {
  classProgressionSchema,
  type ClassFeature,
  type ClassProgression,
} from '$lib/schemas/classProgression';
import { toSourceKey } from '$lib/schemas/source';
import { emptyProficiencyGrant, type ProficiencyGrant, type SkillGrant } from '$lib/schemas/grants';
import {
  parseSkillNames,
  readAbilityName,
  readArmorTraining,
  readWeaponCategory,
  splitRuleList,
  type ArmorTraining,
  type WeaponCategory,
} from '$lib/schemas/vocabulary';
import { type AbilityName } from '$lib/schemas/abilities';
import { firstInt, numOr } from '$lib/utils/num';

/** v2-Kopf-`saving_throws` (`[{name: "Strength"}]`) → englische Attributsnamen. */
const readAbilityNames = (raw: { name?: string }[]): AbilityName[] =>
  raw.map((s) => readAbilityName(s.name ?? '')).filter((a): a is AbilityName => a !== null);

const fold = (s: string): string =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

//
// Open5e v2 liefert die Kerntabelle als Merkmal mit `feature_type:
// "CORE_TRAITS_TABLE"` und LEEREM `gained_at` — ihr `desc` ist eine Markdown-
// Tabelle `|Zeile|Wert|`. Aus ihr entstehen die vier Übungs-Arten plus die
// Anfangsausrüstung als Prosa. „Primary Ability" und „Hit Point Die" stehen
// bereits strukturiert in v2, „Tool Proficiencies" bleibt bewusst Prosa
// (Werkzeuge sind kein geschlossenes Vokabular in dieser App).

/** Rohe Kerntabellen-Zeilen: Zeilentitel → Wert. */
export function parseCoreTraitRows(desc: string): Record<string, string> {
  const rows: Record<string, string> = {};
  for (const line of desc.split('\n')) {
    const cells = line.split('|');
    // `|Titel|Wert|` → ['', 'Titel', 'Wert', '']; Trenn-/Kopfzeilen haben keinen Titel.
    if (cells.length < 4) continue;
    const title = cells[1].trim();
    const value = cells[2].trim();
    if (!title || /^-+$/.test(title)) continue;
    rows[title] = value;
  }
  return rows;
}

/**
 * „Skill Proficiencies"-Zelle → `skillGrant`. Drei Formen kommen vor:
 *   „Choose 2: Animal Handling, Athletics, … or Survival" → {choose:2, from:[…]}
 *   „Choose any 3 skills"                                 → {choose:3, from:[]}
 *   Aufzählung ohne „Choose"                              → {fixed:[…]}
 */
export function parseSkillGrant(raw: string, context = 'Skill Proficiencies'): SkillGrant {
  const value = raw.trim();
  if (!value || /^none$/i.test(value)) return { fixed: [], choose: 0, from: [] };

  const choose = numOr(value.match(/choose\s+(?:any\s+)?(\d+)/i)?.[1]);
  if (!choose) return { fixed: parseSkillNames(value, context), choose: 0, from: [] };

  // Die Auswahlliste steht nach dem Doppelpunkt; ohne Doppelpunkt („any 3 skills")
  // ist jede Fertigkeit erlaubt.
  const listPart = value.includes(':') ? value.slice(value.indexOf(':') + 1) : '';
  return { fixed: [], choose, from: listPart.trim() ? parseSkillNames(listPart, context) : [] };
}

/** „Saving Throw Proficiencies"-Zelle → englische Attributsnamen. */
function parseSavingThrows(raw: string, context: string): AbilityName[] {
  const out: AbilityName[] = [];
  for (const part of splitRuleList(raw)) {
    const ability = readAbilityName(part);
    if (!ability) throw new Error(`${context}: unbekanntes Attribut "${part}" (aus "${raw}")`);
    if (!out.includes(ability)) out.push(ability);
  }
  return out;
}

/**
 * „Weapon Proficiencies"-Zelle → Kategorien + Sonderfälle.
 * „Simple and Martial weapons" → ['Simple','Martial']; die eingeschränkten Formen
 * („Martial weapons that have the Light property" bei Mönch/Schurke) sind KEINE
 * Kategorie-Übung und landen wörtlich in `weaponsOther`.
 */
function parseWeapons(raw: string): { weapons: WeaponCategory[]; weaponsOther: string[] } {
  const weapons: WeaponCategory[] = [];
  const weaponsOther: string[] = [];
  // NUR an „and" trennen, nicht an „or": das „or" gehört zu den Einschränkungen
  // („… the Finesse or Light property") und darf die Phrase nicht zerreißen.
  for (const phrase of raw.split(/\band\b/gi).map((s) => s.trim()).filter(Boolean)) {
    if (/^none$/i.test(phrase)) continue;
    const category = readWeaponCategory(phrase);
    if (category) {
      if (!weapons.includes(category)) weapons.push(category);
    } else {
      weaponsOther.push(phrase.replace(/[.;]+$/, ''));
    }
  }
  return { weapons, weaponsOther };
}

/** „Armor Training"-Zelle → Rüstungsstufen. Unbekanntes (inkl. „None") fällt weg. */
function parseArmor(raw: string): ArmorTraining[] {
  const out: ArmorTraining[] = [];
  for (const part of splitRuleList(raw)) {
    const training = readArmorTraining(part);
    if (training && !out.includes(training)) out.push(training);
  }
  return out;
}

/**
 * Kerntabellen-Prosa → strukturierter Übungs-Grant + Anfangsausrüstung.
 * Wirft bei unbekannten Fertigkeits-/Attributsnamen (siehe `parseSkillNames`).
 */
export function parseCoreTraits(desc: string, context = 'Kerntabelle'): {
  grant: ProficiencyGrant;
  startingEquipment: string;
} {
  const rows = parseCoreTraitRows(desc);
  const { weapons, weaponsOther } = parseWeapons(rows['Weapon Proficiencies'] ?? '');
  return {
    grant: {
      skills: parseSkillGrant(rows['Skill Proficiencies'] ?? '', context),
      savingThrows: parseSavingThrows(rows['Saving Throw Proficiencies'] ?? '', context),
      weapons,
      weaponsOther,
      armor: parseArmor(rows['Armor Training'] ?? ''),
    },
    startingEquipment: rows['Starting Equipment'] ?? '',
  };
}

interface V2Feature {
  key?: string;
  name?: string;
  desc?: string;
  feature_type?: string;
  gained_at?: { level: number; detail: string | null }[];
  data_for_class_table?: { level: number; column_value: string }[];
}

/** Bildet eine rohe v2-Klasse auf den offenen internen Typ ab. */
export function mapV2(raw: Record<string, unknown>): ClassProgression {
  const feats = (raw.features as V2Feature[]) ?? [];
  const hp = (raw.hit_points as Record<string, string>) ?? {};
  const doc = (raw.document as { key?: string; gamesystem?: { key?: string } }) ?? {};

  // Spalten-Features (data_for_class_table befüllt) → levels[].columns aufbauen.
  const columnFeats = feats.filter((f) => (f.data_for_class_table?.length ?? 0) > 0);
  const levelMap = new Map<number, Record<string, string>>();
  for (const f of columnFeats) {
    for (const row of f.data_for_class_table!) {
      const cols = levelMap.get(row.level) ?? {};
      cols[f.name ?? ''] = row.column_value;
      levelMap.set(row.level, cols);
    }
  }
  const levels = [...levelMap.entries()]
    .map(([level, columns]) => ({ level, columns }))
    .sort((a, b) => a.level - b.level);

  // Kerntabelle: `gained_at` ist leer, deshalb ist sie KEIN Merkmal — aber ihr
  // `desc` trägt Fertigkeiten/Waffen/Rüstung/Rettungswürfe aller 12 Grundklassen.
  const coreTraits = feats.find((f) => f.feature_type === 'CORE_TRAITS_TABLE');
  const core = coreTraits?.desc
    ? parseCoreTraits(coreTraits.desc, `Kerntabelle ${raw.key ?? ''}`)
    : { grant: emptyProficiencyGrant(), startingEquipment: '' };

  // Echte Merkmale (gained_at befüllt).
  const features: ClassFeature[] = feats
    .filter((f) => (f.gained_at?.length ?? 0) > 0)
    .map((f) => ({
      key: f.key ?? '',
      name: f.name ?? '',
      gainedAt: [...new Set((f.gained_at ?? []).map((g) => g.level))].sort((a, b) => a - b),
      desc: f.desc ?? '',
      featureType: f.feature_type,
    }));

  const subclassOf = (raw.subclass_of as { key?: string } | null)?.key || undefined;

  const mapped = {
    key: (raw.key as string) ?? '',
    source: toSourceKey(doc.key),
    name: (raw.name as string) ?? '',
    subclassOf,
    casterType: (raw.caster_type as string) ?? 'NONE',
    hitDie: firstInt(raw.hit_dice ?? hp.hit_dice),
    hpAt1st: hp.hit_points_at_1st_level ?? '',
    hpHigher: hp.hit_points_at_higher_levels ?? '',
    // Kerntabelle. Fehlt sie (Subklassen, Homebrew), bleibt `saving_throws` aus dem
    // v2-Kopf die Quelle der Rettungswürfe — der einzige Teil, den v2 doppelt führt.
    proficiencyGrant: coreTraits
      ? core.grant
      : { ...core.grant, savingThrows: readAbilityNames((raw.saving_throws as { name?: string }[]) ?? []) },
    // Beim Import NICHT ableitbar (steht nicht in v2) — bleiben leer und werden im Vault
    // gepflegt. Ein Re-Import über die Sidebar darf sie deshalb nicht überschreiben.
    skillGrantMulticlass: { fixed: [], choose: 0, from: [] },
    startingEquipmentDe: '',
    startingEquipment: core.startingEquipment,
    document: { key: doc.key ?? '', gamesystem: doc.gamesystem?.key ?? '' },
    levels,
    features,
  };
  return classProgressionSchema.parse(mapped);
}
