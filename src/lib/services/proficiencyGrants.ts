/**
 * Summiert die Übungen, die ein Charakter aus seinen VERLINKTEN Bibliotheks-
 * Artefakten bekommt — Muster von `characterFeatures.ts`: der Charakter speichert
 * nur Links, die Mechanik wird zur Laufzeit aufgelöst.
 *
 * Weil alle vier Artefakttypen dieselbe `proficiencyGrant`-Form tragen
 * (schemas/grants.ts), ist die Summierung EINE Funktion und nicht vier. Die Werte
 * sind durchgehend ENGLISCH; übersetzt wird erst beim Anwenden auf den Bogen
 * (`skillSheetKey`, `ABILITY_FROM_EN`).
 *
 * **Keine Provenienz im Charakter.** Die Häkchen auf dem Bogen sind die Wahrheit;
 * hier entsteht nur das Angebot, gegen das die UI den Ist-Zustand vergleicht
 * („Schurke: 4 aus 10 — 3 von 4 belegt"). Damit ist die Ableitung idempotent und
 * braucht keine Rücknahme-Logik.
 */
import type { AbilityName } from '$lib/schemas/abilities';
import type { ArmorTraining, SkillName, WeaponCategory } from '$lib/schemas/vocabulary';
import type { ProficiencyGrant, SkillGrant } from '$lib/schemas/grants';
import { isEmptyProficiencyGrant } from '$lib/schemas/grants';
import { readAbilityName } from '$lib/schemas/vocabulary';
import { SKILL_DEFS } from '$lib/pdf/characterFields';
import type { ProficiencyFlags } from '$lib/schemas/characterSchema';
import type { Change } from '$lib/schemas/levelUp';
import { ABILITY_TO_EN, type AbilityKey } from '$lib/schemas/classProgression';
import { getProgressionByKey } from './classProgression';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getFeats, featDisplayName, type FeatEntry } from '$lib/featsLibrary';

// ── Deutsche Anzeige-Labels ───────────────────────────────────────────────────
//
// Die EINE Übersetzungsrichtung für die Oberfläche. Fertigkeiten kommen aus
// `SKILL_DEFS` (dieselbe Tabelle, die den Bogen-Schlüssel liefert), damit Karte,
// Editor und Bogen garantiert dieselben Begriffe zeigen.

const SKILL_LABEL_DE = new Map<SkillName, string>(SKILL_DEFS.map((d) => [d.en, d.label]));

import { abilityKeyOf, ABILITY_LABEL_DE } from '$lib/schemas/abilities';
export { ABILITY_LABEL_DE };

export const WEAPON_LABEL_DE: Record<WeaponCategory, string> = {
  Simple: 'Einfache Waffen',
  Martial: 'Kriegswaffen',
};

export const ARMOR_LABEL_DE: Record<ArmorTraining, string> = {
  Light: 'Leichte Rüstung',
  Medium: 'Mittelschwere Rüstung',
  Heavy: 'Schwere Rüstung',
  Shields: 'Schilde',
};

/** Deutscher Anzeigename einer Fertigkeit; unbekannte Werte unverändert durchreichen. */
export const skillLabelDe = (en: string): string => SKILL_LABEL_DE.get(en as SkillName) ?? en;

/** Deutscher Anzeigename eines Attributs; unbekannte Werte unverändert durchreichen. */
export const abilityLabelDe = (en: string): string => ABILITY_LABEL_DE[en as AbilityName] ?? en;

/** true, wenn ein Grant überhaupt etwas gewährt (steuert leere UI-Abschnitte). */
export const isEmptyGrant = isEmptyProficiencyGrant;

/** Kurze deutsche Zusammenfassung eines Fertigkeits-Grants („2 aus 6", „Athletik, Einschüchtern"). */
export function skillGrantSummary(g: SkillGrant | undefined): string {
  if (!g) return '';
  const parts: string[] = [];
  if (g.fixed.length) parts.push(g.fixed.map(skillLabelDe).join(', '));
  if (g.choose > 0) parts.push(g.from.length ? `${g.choose} aus ${g.from.length}` : `${g.choose} frei wählbar`);
  return parts.join(' · ');
}

/** Woher ein Grant kommt — deutsche Anzeige plus Bibliotheks-Key. */
export interface GrantSource {
  /** z.B. „Schurke", „Soldat", „Elf: Scharfe Sinne", „Talent: Geübt". */
  label: string;
  sourceKey: string;
}

/** Ein einzelner, ohne Wahl gewährter Wert mit seiner Herkunft. */
export interface SourcedGrant<T> {
  value: T;
  source: GrantSource;
}

/** Eine offene Fertigkeits-Wahl: N aus `from` (leer = beliebig). */
export interface OpenChoice {
  source: GrantSource;
  choose: number;
  from: SkillName[];
}

export interface CollectedGrants {
  /** Ohne Wahl gewährte Fertigkeiten. */
  skills: SourcedGrant<SkillName>[];
  /** Noch zu treffende Fertigkeits-Wahlen (eine je Quelle). */
  choices: OpenChoice[];
  savingThrows: SourcedGrant<AbilityName>[];
  weapons: SourcedGrant<WeaponCategory>[];
  weaponsOther: SourcedGrant<string>[];
  armor: SourcedGrant<ArmorTraining>[];
}

/**
 * Was `collectGrants` braucht: ausschließlich die LINKS. Ein `Character` erfüllt
 * das strukturell; der Editor kann stattdessen seinen lokalen Zustand übergeben,
 * ohne den ganzen Charakter zur Abhängigkeit zu machen.
 */
export interface GrantInput {
  classes?: { sourceKey: string; name?: string; subclassKey?: string }[];
  species?: { sourceKey?: string; subspeciesKey?: string };
  backgroundRef?: { sourceKey?: string };
  features?: { sourceKey?: string; name?: string }[];
}

const emptyCollected = (): CollectedGrants => ({
  skills: [], choices: [], savingThrows: [], weapons: [], weaponsOther: [], armor: [],
});

/** Übernimmt einen Fertigkeits-Grant (fest + Wahl) in die Sammlung. */
function addSkillGrant(out: CollectedGrants, grant: SkillGrant | undefined, source: GrantSource): void {
  if (!grant) return;
  for (const value of grant.fixed) out.skills.push({ value, source });
  if (grant.choose > 0) out.choices.push({ source, choose: grant.choose, from: grant.from });
}

/** Übernimmt einen vollständigen Übungs-Grant (alle vier Arten) in die Sammlung. */
function addGrant(out: CollectedGrants, grant: ProficiencyGrant | undefined, source: GrantSource): void {
  if (!grant) return;
  addSkillGrant(out, grant.skills, source);
  for (const value of grant.savingThrows) out.savingThrows.push({ value, source });
  for (const value of grant.weapons) out.weapons.push({ value, source });
  for (const value of grant.weaponsOther) out.weaponsOther.push({ value, source });
  for (const value of grant.armor) out.armor.push({ value, source });
}

/**
 * Englisches Übungs-Vokabular → Bogen-Flag. Die EINE Abbildung für alle Aufrufer (Wizard-
 * Assembly, Änderungs-Anwendung des Aufstiegs) — eine zweite liefe auseinander, und genau
 * daran ist die Fertigkeits-Zuweisung schon einmal still gescheitert (`skillSheetKey`).
 */
export function markWeaponProficiency(flags: ProficiencyFlags, category: string): void {
  if (category === 'Simple') flags.simpleWeapons = true;
  else if (category === 'Martial') flags.martialWeapons = true;
}

export function markArmorTraining(flags: ProficiencyFlags, training: string): void {
  if (training === 'Light') flags.lightArmor = true;
  else if (training === 'Medium') flags.mediumArmor = true;
  else if (training === 'Heavy') flags.heavyArmor = true;
  else if (training === 'Shields') flags.shields = true;
}

/** Die sechs Rettungswurf-Häkchen des Bogens — ein `Character` erfüllt das strukturell. */
export type SaveProfFlags = { [K in AbilityKey as `${K}SaveProf`]: boolean };

/** Englischer Attributsname → Rettungswurf-Häkchen. Dritte Abbildung derselben Art. */
export function markSavingThrow(flags: SaveProfFlags, en: string): void {
  const key = abilityKeyOf(readAbilityName(en));
  if (key) flags[`${key}SaveProf`] = true;
}

/**
 * Die Vault-Übungsform als `Change[]` — die Sprache, in der BEIDE Flows anwenden
 * (`applyChanges`). Die Tabelle ist über `keyof ProficiencyGrant` total: ein neues Feld
 * am Vault-Grant bricht hier den Build, statt still ohne Senke zu bleiben. Genau das ist
 * `weaponsOther` zweimal passiert.
 *
 * `skills.choose` erzeugt bewusst nichts: eine offene Wahl ist kein Grant, sie wird
 * gefragt (Wizard-Fertigkeitsschritt) und kommt als eigener `proficiency`-Change zurück.
 */
export function proficiencyGrantChanges(
  g: ProficiencyGrant,
  meta: { step: string; source: string },
  /**
   * Felder, die auf diesem Weg NICHT emittiert werden sollen, weil sie den Charakter schon
   * anders erreichen (im Aufstieg reist alles außer `weaponsOther` über den Rider). Bewusst
   * eine Ausschluss- und keine Einschlussliste: ein neues Feld am Vault-Grant landet damit
   * per Default IM Dokument, statt still zu fehlen.
   */
  skip: readonly (keyof ProficiencyGrant)[] = [],
): Change[] {
  const out: Change[] = [];
  const routes: { [K in keyof ProficiencyGrant]: () => void } = {
    skills: () => {
      for (const skill of g.skills.fixed)
        out.push({ target: 'proficiency', skill, ...meta, label: `Übung: ${skillLabelDe(skill)}` });
    },
    savingThrows: () => {
      for (const value of g.savingThrows)
        out.push({ target: 'savingThrow', value, ...meta, label: `Rettungswurf: ${abilityLabelDe(value)}` });
    },
    weapons: () => {
      for (const value of g.weapons)
        out.push({ target: 'weaponProficiency', value, ...meta, label: `Übung: ${WEAPON_LABEL_DE[value] ?? value}` });
    },
    weaponsOther: () => {
      for (const value of g.weaponsOther)
        out.push({ target: 'weaponProficiencyOther', value, ...meta, label: `Übung: ${value}` });
    },
    armor: () => {
      for (const value of g.armor)
        out.push({ target: 'armorTraining', value, ...meta, label: `Vertrautheit: ${ARMOR_LABEL_DE[value] ?? value}` });
    },
  };
  for (const [key, run] of Object.entries(routes) as [keyof ProficiencyGrant, () => void][])
    if (!skip.includes(key)) run();
  return out;
}

/** Talent-Eintrag zu einem Referenz-Key/-Namen (wie `resolveFeatLinks`). */
function findFeat(lib: FeatEntry[], key: string | undefined, name: string): FeatEntry | undefined {
  const k = key?.trim();
  const n = name.trim().toLowerCase();
  return lib.find(
    (f) =>
      (k && f.sourceKey === k) ||
      (n && (featDisplayName(f).toLowerCase() === n || f.name.toLowerCase() === n)),
  );
}

/**
 * Alle Übungs-Grants eines Charakters, aufgelöst gegen die lokale Bibliothek.
 *
 * Die Reihenfolge in `classes[]` ist maßgeblich: `classes[0]` ist die STARTKLASSE
 * und gewährt die volle Kerntabelle, jede weitere ist per Klassenkombination
 * dazugekommen und gewährt nur `skillGrantMulticlass` (im SRD 5.2: nur
 * Barde/Schurke/Waldläufer überhaupt eine Fertigkeit). Fehlt ein Link lokal,
 * fällt seine Quelle einfach aus — das Panel zeigt dann nichts statt zu raten.
 */
export async function collectGrants(c: GrantInput): Promise<CollectedGrants> {
  const out = emptyCollected();
  const featLib = await getFeats();

  // ── Hintergrund (+ Herkunftstalent, das nicht in features steht) ──
  const bgKey = c.backgroundRef?.sourceKey ?? '';
  if (bgKey) {
    const bg = await getBackgroundByKey(bgKey);
    if (bg) {
      addGrant(out, bg.proficiencyGrant, { label: bg.nameDe || bg.name || bgKey, sourceKey: bgKey });
      if (bg.featKey) {
        const originFeat = findFeat(featLib, bg.featKey, '');
        if (originFeat)
          addGrant(out, originFeat.grants?.proficiencies, {
            label: `Herkunftstalent: ${featDisplayName(originFeat)}`,
            sourceKey: bg.featKey,
          });
      }
    }
  }

  // ── Klassen: [0] volle Kerntabelle, [1..] nur die Mehrklassen-Zeile ──
  for (const [i, cls] of (c.classes ?? []).entries()) {
    if (!cls.sourceKey) continue;
    const prog = await getProgressionByKey(cls.sourceKey);
    if (!prog) continue;
    const source: GrantSource = { label: cls.name?.trim() || prog.nameDe || prog.name, sourceKey: cls.sourceKey };
    if (i === 0) addGrant(out, prog.proficiencyGrant, source);
    else addSkillGrant(out, prog.skillGrantMulticlass, source);
  }

  // ── Spezies + Unterspezies: der Grant hängt am einzelnen MERKMAL, und dort ist
  //    `grants.proficiencies` die einzige Übungs-Senke (am Klassenkopf/Hintergrund
  //    bleibt `proficiencyGrant` — die sind keine Merkmale). ──
  for (const key of [c.species?.sourceKey, c.species?.subspeciesKey]) {
    if (!key) continue;
    const spec = await getSpeciesByKey(key);
    if (!spec) continue;
    const specName = spec.nameDe || spec.name || key;
    for (const trait of spec.traits)
      addGrant(out, trait.grants?.proficiencies, {
        label: `${specName}: ${trait.nameDe || trait.name}`,
        sourceKey: trait.key || key,
      });
  }

  // ── Verlinkte Talente ──
  // Wahl-Annotationen liegen in derselben Liste; sie tragen einen Merkmals-Key, den das
  // Talent-Wörterbuch nicht kennt, und fallen deshalb ohne Sonderfall heraus.
  for (const ref of c.features ?? []) {
    const entry = findFeat(featLib, ref.sourceKey, ref.name ?? '');
    if (!entry) continue;
    addGrant(out, entry.grants?.proficiencies, {
      label: `Talent: ${featDisplayName(entry)}`,
      sourceKey: entry.sourceKey ?? '',
    });
  }

  return out;
}

/** Alle Fertigkeiten, die in irgendeiner offenen Wahl vorkommen dürfen. */
export function choiceAllows(choice: OpenChoice, skill: SkillName): boolean {
  return choice.from.length === 0 || choice.from.includes(skill);
}
