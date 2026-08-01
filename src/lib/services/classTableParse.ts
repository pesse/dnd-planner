/**
 * Die Kerntabelle („Core Traits") einer Open5e-v2-Klasse aus ihrer Markdown-Prosa lesen
 * und eine rohe v2-Klasse auf den internen Typ abbilden. Wie die Open5e-Mapper bewusst
 * `invoke`-frei, damit der Node-Importer `parseCoreTraits` direkt bündeln kann.
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

const readAbilityNames = (raw: { name?: string }[]): AbilityName[] =>
  raw.map((s) => readAbilityName(s.name ?? '')).filter((a): a is AbilityName => a !== null);

const fold = (s: string): string =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

// Die Kerntabelle kommt als Merkmal mit `feature_type: "CORE_TRAITS_TABLE"` und LEEREM
// `gained_at` — ihr `desc` ist eine Markdown-Tabelle `|Zeile|Wert|`. „Tool Proficiencies"
// bleibt daraus bewusst Prosa: Werkzeuge sind kein geschlossenes Vokabular dieser App.
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
 * Drei Prosa-Formen kommen vor: „Choose 2: Animal Handling, … or Survival" → {choose,from},
 * „Choose any 3 skills" → {choose, from:[]} (leere Liste heißt: jede Fertigkeit erlaubt),
 * eine Aufzählung ohne „Choose" → {fixed}.
 */
export function parseSkillGrant(raw: string, context = 'Skill Proficiencies'): SkillGrant {
  const value = raw.trim();
  if (!value || /^none$/i.test(value)) return { fixed: [], choose: 0, from: [] };

  const choose = numOr(value.match(/choose\s+(?:any\s+)?(\d+)/i)?.[1]);
  if (!choose) return { fixed: parseSkillNames(value, context), choose: 0, from: [] };

  const listPart = value.includes(':') ? value.slice(value.indexOf(':') + 1) : '';
  return { fixed: [], choose, from: listPart.trim() ? parseSkillNames(listPart, context) : [] };
}

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
 * Eingeschränkte Formen („Martial weapons that have the Light property" bei Mönch/Schurke)
 * sind KEINE Kategorie-Übung und landen wörtlich in `weaponsOther`.
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

/** Unbekanntes (inkl. „None") fällt still weg. */
function parseArmor(raw: string): ArmorTraining[] {
  const out: ArmorTraining[] = [];
  for (const part of splitRuleList(raw)) {
    const training = readArmorTraining(part);
    if (training && !out.includes(training)) out.push(training);
  }
  return out;
}

/** Wirft bei unbekannten Fertigkeits-/Attributsnamen, statt sie still zu verlieren. */
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

export function mapV2(raw: Record<string, unknown>): ClassProgression {
  const feats = (raw.features as V2Feature[]) ?? [];
  const hp = (raw.hit_points as Record<string, string>) ?? {};
  const doc = (raw.document as { key?: string; gamesystem?: { key?: string } }) ?? {};

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

  const coreTraits = feats.find((f) => f.feature_type === 'CORE_TRAITS_TABLE');
  const core = coreTraits?.desc
    ? parseCoreTraits(coreTraits.desc, `Kerntabelle ${raw.key ?? ''}`)
    : { grant: emptyProficiencyGrant(), startingEquipment: '' };

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
    // Ohne Kerntabelle (Subklassen, Homebrew) bleibt `saving_throws` aus dem v2-Kopf die
    // Quelle der Rettungswürfe — der einzige Teil, den v2 doppelt führt.
    proficiencyGrant: coreTraits
      ? core.grant
      : { ...core.grant, savingThrows: readAbilityNames((raw.saving_throws as { name?: string }[]) ?? []) },
    // Steht nicht in v2, wird im Vault gepflegt — ein Re-Import darf beides nicht
    // überschreiben, sonst ist die Multiclass-Zeile weg.
    skillGrantMulticlass: { fixed: [], choose: 0, from: [] },
    startingEquipmentDe: '',
    startingEquipment: core.startingEquipment,
    document: { key: doc.key ?? '', gamesystem: doc.gamesystem?.key ?? '' },
    levels,
    features,
  };
  return classProgressionSchema.parse(mapped);
}
