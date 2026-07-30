/**
 * Schreibt die strukturierten Übungs-Grants (`proficiencyGrant`) in die
 * Vault-Bibliotheken — Klassen, Hintergründe, Spezies-Merkmale, Talente.
 *
 * Quellen:
 *   - Klassen: die Kerntabelle aus Open5e v2 (`feature_type: "CORE_TRAITS_TABLE"`),
 *     geparst mit demselben `parseCoreTraits` wie der Live-Import.
 *   - Mehrklassen-Zeile (`skillGrantMulticlass`): steht NICHT in v2, nur im deutschen
 *     SRD-Abschnitt „Als Charakter mit Klassenkombination" — hier als Tabelle
 *     hinterlegt und aus den Klassenlisten selbst gefüllt.
 *   - Hintergründe/Spezies/Talente: die bereits im Vault liegende englische Prosa.
 *
 * **Gate:** vor dem Schreiben werden die 12 aus v2 geparsten Grants gegen die
 * DEUTSCHEN Tabellen des SRD-5.2-Auszugs (`src/lib/data/rules-chunks.json`)
 * gestellt. Beide Quellen sind bekannt deckungsgleich — jede Abweichung ist ein
 * Parser-Fehler und bricht den Lauf ab, bevor eine Datei angefasst wird.
 *
 * Lauf (TypeScript, daher über esbuild gebündelt — kein zusätzliches Paket nötig):
 *
 *   npx esbuild --bundle --platform=node --format=esm --alias:\$lib=./src/lib \
 *     scripts/migrate-proficiency-grants.mts --outfile=/tmp/migrate-grants.mjs \
 *   && node /tmp/migrate-grants.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCoreTraits } from '$lib/services/classProgression';
import { ABILITY_TO_EN, type AbilityKey } from '$lib/schemas/classProgression';
import {
  emptyProficiencyGrant,
  emptySkillGrant,
  parseProseSkillGrant,
  parseSkillNames,
  type AbilityName,
  type ArmorTraining,
  type ProficiencyGrant,
  type SkillGrant,
  type SkillName,
} from '$lib/schemas/shared';
import { SKILL_DEFS } from '$lib/pdf/characterFields';

const DRY_RUN = process.argv.includes('--dry-run');
const VAULT = 'vault';
const RULES_CHUNKS = 'src/lib/data/rules-chunks.json';
const OPEN5E_CLASSES = 'https://api.open5e.com/v2/classes/?document__key=srd-2024&limit=40';

// ── Deutsche Vokabulare (nur für das Gate) ────────────────────────────────────
const SKILL_FROM_DE = new Map<string, SkillName>(SKILL_DEFS.map((d) => [d.label, d.en]));
const ABILITY_FROM_DE: Record<string, AbilityName> = {
  Stärke: 'Strength', Geschicklichkeit: 'Dexterity', Konstitution: 'Constitution',
  Intelligenz: 'Intelligence', Weisheit: 'Wisdom', Charisma: 'Charisma',
};
const ARMOR_FROM_DE: [RegExp, ArmorTraining][] = [
  [/\bleichte?\b/i, 'Light'],
  [/\bmittelschwere?\b/i, 'Medium'],
  [/\bschwere?\b/i, 'Heavy'],
  [/\bschilde\b/i, 'Shields'],
];
const CHOOSE_FROM_DE: Record<string, number> = { eine: 1, zwei: 2, drei: 3, vier: 4 };

/** Deutscher Klassenname (wie in „Hauptmerkmale des …") → v2-Key. */
const DE_CLASS_TO_KEY: Record<string, string> = {
  Barbaren: 'srd-2024_barbarian', Barden: 'srd-2024_bard', Klerikers: 'srd-2024_cleric',
  Druiden: 'srd-2024_druid', Kämpfers: 'srd-2024_fighter', Mönchs: 'srd-2024_monk',
  Paladins: 'srd-2024_paladin', Waldläufers: 'srd-2024_ranger', Schurken: 'srd-2024_rogue',
  Zauberers: 'srd-2024_sorcerer', Hexenmeisters: 'srd-2024_warlock', Magiers: 'srd-2024_wizard',
};

/**
 * Mehrklassen-Fertigkeiten (SRD 5.2, „Als Charakter mit Klassenkombination"):
 * NUR diese drei Klassen gewähren beim Dazukommen überhaupt eine Fertigkeit.
 * `'own'` = aus der eigenen Klassenliste, `'any'` = beliebige Fertigkeit.
 */
const MULTICLASS_SKILLS: Record<string, 'any' | 'own'> = {
  'srd-2024_bard': 'any',
  'srd-2024_rogue': 'own',
  'srd-2024_ranger': 'own',
};

// ── Deutscher SRD-Auszug: Kerntabellen einlesen (Gate-Seite) ───────────────────
interface GermanCoreTraits {
  skills: SkillName[];
  choose: number;
  savingThrows: AbilityName[];
  armor: ArmorTraining[];
  /** Waffen-Rohtext ohne Leerzeichen — die PDF-Extraktion zerreißt hier Wörter. */
  weaponsFolded: string;
}

/**
 * Die deutschen Tabellen stammen aus einem zweispaltigen PDF: der Zeilentitel ist
 * mitten in den Wert hineinextrahiert („Fertigkeiten, in Wähle zwei aus: Athletik,
 * denen du geübt bist Einschüchtern, …"). Die bekannten Titel-Fragmente werden
 * darum vorab entfernt, dann bleibt der Wert lesbar.
 */
const LABEL_FRAGMENTS = [
  /denen du geübt bist/g, /Wähle (?:eine|zwei|drei|vier) aus:/g,
  /Übung im Umgang/g, /mit Waffen/g, /mit Werkzeug/g, /Rüstungsvertrautheit/g,
  /\(siehe [^)]*\)/g,
];

function stripLabels(raw: string): string {
  let s = raw;
  for (const re of LABEL_FRAGMENTS) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function readGermanCoreTraits(): Map<string, GermanCoreTraits> {
  const chunks: { text: string }[] = JSON.parse(readFileSync(RULES_CHUNKS, 'utf8'));
  const out = new Map<string, GermanCoreTraits>();

  for (const chunk of chunks) {
    const start = chunk.text.indexOf('Hauptmerkmale des');
    if (start < 0) continue;
    const seg = chunk.text.slice(start);
    const classDe = seg.match(/^Hauptmerkmale des (\S+)/)?.[1] ?? '';
    const key = DE_CLASS_TO_KEY[classDe];
    if (!key || out.has(key)) continue;

    const cell = (re: RegExp): string => stripLabels(seg.match(re)?.[1] ?? '');
    const savesRaw = cell(/Rettungswürfe, in(.*?)Fertigkeiten/s);
    const skillsRaw = seg.match(/Fertigkeiten, in(.*?)(?:Übung im Umgang|Rüstungsvertrautheit)/s)?.[1] ?? '';
    const weaponsRaw = cell(/Übung im Umgang(.*?)Rüstungsvertrautheit/s);
    const armorRaw = cell(/Rüstungsvertrautheit(.*?)Anfangsausrüstung/s);

    const chooseWord = skillsRaw.match(/Wähle (eine|zwei|drei|vier) aus:/)?.[1]
      ?? skillsRaw.match(/\b(Eine|Zwei|Drei|Vier)\s+Fertigkeiten?\b/i)?.[1]?.toLowerCase()
      ?? '';
    const skillsText = stripLabels(skillsRaw);

    out.set(key, {
      skills: [...SKILL_FROM_DE.keys()].filter((de) => skillsText.includes(de)).map((de) => SKILL_FROM_DE.get(de)!),
      choose: CHOOSE_FROM_DE[chooseWord] ?? 0,
      savingThrows: Object.keys(ABILITY_FROM_DE).filter((de) => savesRaw.includes(de)).map((de) => ABILITY_FROM_DE[de]),
      armor: ARMOR_FROM_DE.filter(([re]) => re.test(armorRaw)).map(([, v]) => v),
      weaponsFolded: weaponsRaw.replace(/\s+/g, '').toLowerCase(),
    });
  }
  return out;
}

// ── Gate: v2-Parse gegen den deutschen Auszug ──────────────────────────────────
const sorted = (xs: readonly string[]): string => [...xs].sort().join(', ');

function compareCoreTraits(key: string, grant: ProficiencyGrant, de: GermanCoreTraits): string[] {
  const problems: string[] = [];
  const en = grant.skills;
  const enSkills = en.choose > 0 && en.from.length === 0 ? [] : [...en.fixed, ...en.from];

  if (sorted(enSkills) !== sorted(de.skills))
    problems.push(`Fertigkeiten EN [${sorted(enSkills)}] ≠ DE [${sorted(de.skills)}]`);
  if (en.choose !== de.choose) problems.push(`Anzahl der Wahl EN ${en.choose} ≠ DE ${de.choose}`);
  if (sorted(grant.savingThrows) !== sorted(de.savingThrows))
    problems.push(`Rettungswürfe EN [${sorted(grant.savingThrows)}] ≠ DE [${sorted(de.savingThrows)}]`);
  if (sorted(grant.armor) !== sorted(de.armor))
    problems.push(`Rüstung EN [${sorted(grant.armor)}] ≠ DE [${sorted(de.armor)}]`);

  // Waffen: die deutsche Extraktion zerreißt „Kriegswaffen" (Mönch: „Kriegswaf fen"),
  // deshalb wird ohne Leerzeichen verglichen. Eine EINGESCHRÄNKTE Kriegswaffen-Übung
  // („… mit der Eigenschaft Leicht") ist keine Kategorie und muss in weaponsOther landen.
  const w = de.weaponsFolded;
  const deSimple = w.includes('einfachewaffen');
  const deMartialRestricted = /kriegswaf+en?mitder/.test(w);
  const deMartial = w.includes('kriegswaf') && !deMartialRestricted;
  if (deSimple !== grant.weapons.includes('Simple')) problems.push(`Einfache Waffen EN/DE uneinig ("${w}")`);
  if (deMartial !== grant.weapons.includes('Martial')) problems.push(`Kriegswaffen EN/DE uneinig ("${w}")`);
  if (deMartialRestricted && !grant.weaponsOther.length)
    problems.push(`DE kennt eingeschränkte Kriegswaffen, EN hat kein weaponsOther ("${w}")`);

  return problems.map((p) => `${key}: ${p}`);
}

// ── Vault-Dateien schreiben ───────────────────────────────────────────────────
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8'));

/** Schreibt mit 2 Leerzeichen Einrückung + abschließendem Zeilenumbruch (Vault-Konvention). */
function writeJson(path: string, data: unknown): void {
  if (DRY_RUN) return;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/**
 * Setzt Felder an einer bestimmten Stelle der Schlüsselreihenfolge — ersetzt
 * `replaceKey`, falls vorhanden, sonst vor `beforeKey`. Hält den Diff klein und
 * die Dateien in Schema-Reihenfolge.
 */
function withFields(
  obj: Record<string, unknown>,
  fields: Record<string, unknown>,
  replaceKey: string | null,
  beforeKey: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let placed = false;
  for (const [k, v] of Object.entries(obj)) {
    if (replaceKey && k === replaceKey) {
      Object.assign(out, fields);
      placed = true;
      continue;
    }
    if (!placed && k === beforeKey && !(replaceKey && replaceKey in obj)) {
      Object.assign(out, fields);
      placed = true;
    }
    if (k in fields) continue; // schon (neu) gesetzt
    out[k] = v;
  }
  if (!placed) Object.assign(out, fields);
  return out;
}

function jsonFiles(dir: string): string[] {
  return readdirSync(join(VAULT, dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(VAULT, dir, f));
}

/** Altbestand: `savingThrows: ['kon','str']` → englische Namen. */
const legacySaves = (raw: unknown): AbilityName[] =>
  Array.isArray(raw) ? raw.map((k) => ABILITY_TO_EN[k as AbilityKey]).filter(Boolean) : [];

async function main(): Promise<void> {
  const german = readGermanCoreTraits();
  if (german.size !== 12) throw new Error(`Deutscher Auszug: ${german.size} von 12 Kerntabellen gefunden`);

  const api = await fetch(OPEN5E_CLASSES).then((r) => r.json() as Promise<{ results: Record<string, unknown>[] }>);
  const coreByKey = new Map<string, { grant: ProficiencyGrant; startingEquipment: string }>();
  for (const cls of api.results) {
    const features = (cls.features as { feature_type?: string; desc?: string }[]) ?? [];
    const table = features.find((f) => f.feature_type === 'CORE_TRAITS_TABLE');
    if (table?.desc) coreByKey.set(cls.key as string, parseCoreTraits(table.desc, `Kerntabelle ${cls.key}`));
  }

  // ── Gate ──
  const problems: string[] = [];
  for (const [key, de] of german) {
    const core = coreByKey.get(key);
    if (!core) { problems.push(`${key}: keine Kerntabelle in Open5e v2`); continue; }
    problems.push(...compareCoreTraits(key, core.grant, de));
  }
  if (problems.length) {
    console.error('Kreuzvalidierung fehlgeschlagen:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`✓ Kreuzvalidierung: alle ${german.size} Kerntabellen stimmen mit dem deutschen SRD-Auszug überein`);

  // ── Klassen ──
  for (const path of jsonFiles('classes')) {
    const obj = readJson(path);
    const key = String(obj.key ?? '');
    const core = coreByKey.get(key);
    const isBase = !obj.subclassOf;

    let grant: ProficiencyGrant;
    let startingEquipment: string;
    if (isBase && core) {
      grant = core.grant;
      startingEquipment = core.startingEquipment;
    } else {
      // Subklassen (und alles ohne Kerntabelle) tragen leere Grants; nur die
      // Rettungswürfe werden mitgenommen, falls Altbestand welche führte.
      grant = { ...emptyProficiencyGrant(), savingThrows: legacySaves(obj.savingThrows) };
      startingEquipment = String(obj.startingEquipment ?? '');
    }

    // Mehrklassen-Zeile: bereits gepflegte Werte NICHT überschreiben.
    const existing = obj.skillGrantMulticlass as SkillGrant | undefined;
    let multiclass: SkillGrant = existing?.fixed?.length || existing?.choose ? existing! : emptySkillGrant();
    if (!existing) {
      const mode = MULTICLASS_SKILLS[key];
      if (mode) multiclass = { fixed: [], choose: 1, from: mode === 'own' ? grant.skills.from : [] };
    }

    writeJson(path, withFields(obj, {
      proficiencyGrant: grant,
      skillGrantMulticlass: multiclass,
      startingEquipment,
    }, 'savingThrows', 'document'));
    console.log(
      `  klasse ${key.padEnd(34)} rw=${grant.savingThrows.length} fk=${grant.skills.fixed.length}+${grant.skills.choose}` +
      ` wa=${grant.weapons.length}/${grant.weaponsOther.length} ru=${grant.armor.length} mc=${multiclass.choose}`,
    );
  }

  // ── Hintergründe: Fertigkeiten aus dem englischen skill_proficiency-Vorteil ──
  for (const path of jsonFiles('backgrounds')) {
    const obj = readJson(path);
    const benefits = (obj.benefits as { type?: string; desc?: string; descDe?: string }[]) ?? [];
    const benefit = benefits.find((b) => b.type === 'skill_proficiency');
    const fixed = benefit?.desc?.trim() ? parseSkillNames(benefit.desc, `Hintergrund ${obj.key}`) : [];

    // Gegenprobe gegen die deutsche Übersetzung desselben Vorteils.
    if (benefit?.descDe) {
      const de = [...SKILL_FROM_DE.keys()].filter((label) => benefit.descDe!.includes(label)).map((l) => SKILL_FROM_DE.get(l)!);
      if (sorted(de) !== sorted(fixed))
        throw new Error(`Hintergrund ${obj.key}: EN [${sorted(fixed)}] ≠ DE [${sorted(de)}]`);
    }

    writeJson(path, withFields(obj, {
      proficiencyGrant: { ...emptyProficiencyGrant(), skills: { fixed, choose: 0, from: [] } },
    }, null, 'document'));
    console.log(`  hintergrund ${String(obj.key).padEnd(30)} fk=${fixed.join(', ') || '—'}`);
  }

  // ── Spezies-Merkmale: Grant nur dort schreiben, wo die Prosa einen hergibt ──
  for (const path of jsonFiles('species')) {
    const obj = readJson(path);
    const traits = (obj.traits as Record<string, unknown>[]) ?? [];
    let touched = 0;
    const next = traits.map((t) => {
      const skills = parseProseSkillGrant(String(t.desc ?? ''));
      if (!skills) return t;
      touched++;
      console.log(`  spezies ${String(obj.key).padEnd(24)} ${String(t.name)}: ${skills.choose} aus ${skills.from.length || 'allen'}`);
      return { ...t, proficiencyGrant: { ...emptyProficiencyGrant(), skills } };
    });
    if (touched) writeJson(path, { ...obj, traits: next });
  }

  // ── Talente: dito (SRD 5.2: nur „Skilled") ──
  for (const path of jsonFiles('feats')) {
    const obj = readJson(path);
    const skills = parseProseSkillGrant(String(obj.desc ?? ''));
    if (!skills) continue;
    writeJson(path, withFields(obj, {
      proficiencyGrant: { ...emptyProficiencyGrant(), skills },
    }, null, 'document'));
    console.log(`  talent ${String(obj.key).padEnd(28)} ${skills.choose} aus ${skills.from.length || 'allen'}`);
  }

  console.log(DRY_RUN ? '\n(dry run — keine Datei geschrieben)' : '\nFertig.');
}

await main();
