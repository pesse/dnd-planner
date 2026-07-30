/**
 * Löst die am Charakter VERLINKTEN Merkmale zur Laufzeit aus der lokalen Bibliothek
 * auf — analog zum Zauber-Modell: der Charakter speichert nur Links
 * (`classes[]` → vault/classes, `species` → vault/species, `backgroundRef` →
 * vault/backgrounds, `features[]` → vault/feats), die Inhalte
 * (Name/Beschreibung) kommen aus der Bibliothek.
 *
 * Klassen-/Subklassen-Merkmale werden bis zur aktuellen Stufe aufgezählt
 * (`featuresUpTo`). Fehlt ein Link lokal (kein sourceKey oder nicht in der
 * Bibliothek), wird die Gruppe als `unresolved` markiert, damit die UI dem
 * Nutzer die Verlinkung/Anlage anbieten kann.
 */
import { getProgressionByKey, featuresUpTo } from './classProgression';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getFeats, featDesc, featDisplayName, matchFeatEntry } from '$lib/featsLibrary';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { BENEFIT_TYPE_LABELS } from '$lib/schemas/background';
import { spellAccessGrantOf, spellAccessValues, type SpellAccessValues } from './spellAccess';
import type { AbilityKey } from '$lib/schemas/classProgression';
import type { CharacterClass, CharacterSpecies, CharacterBackground, CharacterFeatureEntry } from '$lib/schemas/character';
import type { FeatureGrant } from '$lib/schemas/shared';
import { declaredFeatures, type DeclaredFeature } from './declaredFeature';

/** Ein aufgelöstes Merkmal (Name/Beschreibung DE-bevorzugt). */
export interface ResolvedFeature {
  name: string;
  desc: string;
  gainedAt?: number; // Stufe, auf der es (zuerst) erlangt wird
  key?: string;
  /** Getroffene Entscheidung aus `character.features[]` — nur bei Wahl-Merkmalen gesetzt. */
  choice?: string;
  /** Deklarierte Mechanik des Bibliotheks-Merkmals (`featureGrantSchema`); fehlt bei Altdaten. */
  grants?: FeatureGrant;
  /** true = kein Bibliothekstreffer; Name/Beschreibung stammen aus dem Charakter selbst. */
  unresolved?: boolean;
}

/** Eine Merkmalsgruppe (eine Klasse/Subklasse/Spezies). */
export interface ResolvedFeatureGroup {
  title: string; // Anzeige, z.B. „Waldläufer 5" / „Kreis des Mondes" / „Zwerg"
  sourceKey: string;
  /** true = Link nicht auflösbar (fehlender sourceKey oder nicht in der Bibliothek). */
  unresolved: boolean;
  features: ResolvedFeature[];
}

/** Kleinste erlangte Stufe ≤ Zielstufe (für die Anzeige „Stufe X"). */
function firstGainedAt(gainedAt: number[], level: number): number | undefined {
  const eligible = gainedAt.filter((l) => l <= level);
  return eligible.length ? Math.min(...eligible) : undefined;
}

/**
 * Löst die Klassen-Merkmale eines Charakters bis zur jeweiligen Stufe auf,
 * inkl. Subklassen-Merkmale. Eine Gruppe je Klasse und je verlinkter Subklasse.
 */
export async function resolveClassFeatures(classes: CharacterClass[]): Promise<ResolvedFeatureGroup[]> {
  const groups: ResolvedFeatureGroup[] = [];
  for (const cls of classes ?? []) {
    if (!cls.name.trim() && !cls.sourceKey) continue;
    const level = cls.level || 1;

    // Grundklasse
    const prog = cls.sourceKey ? await getProgressionByKey(cls.sourceKey) : null;
    groups.push({
      title: cls.name.trim() || cls.sourceKey,
      sourceKey: cls.sourceKey,
      unresolved: !prog,
      features: prog
        ? featuresUpTo(prog, level).map((f) => ({
            name: f.nameDe || f.name,
            desc: f.descDe || f.desc,
            gainedAt: firstGainedAt(f.gainedAt, level),
            key: f.key,
            grants: f.grants,
          }))
        : [],
    });

    // Subklasse (falls verlinkt)
    if (cls.subclassKey) {
      const sub = await getProgressionByKey(cls.subclassKey);
      groups.push({
        title: (cls.subclassName?.trim() || sub?.nameDe || sub?.name || cls.subclassKey),
        sourceKey: cls.subclassKey,
        unresolved: !sub,
        features: sub
          ? featuresUpTo(sub, level).map((f) => ({
              name: f.nameDe || f.name,
              desc: f.descDe || f.desc,
              gainedAt: firstGainedAt(f.gainedAt, level),
              key: f.key,
              grants: f.grants,
            }))
          : [],
      });
    }
  }
  return groups;
}

/**
 * Löst die Spezies-Traits eines Charakters auf (inkl. optionaler Unterspezies).
 * null, wenn kein Spezies-Link vorhanden ist.
 */
export async function resolveSpeciesTraits(species: CharacterSpecies | undefined): Promise<ResolvedFeatureGroup[] | null> {
  if (!species || (!species.sourceKey && !species.name.trim())) return null;
  const groups: ResolvedFeatureGroup[] = [];

  const base = species.sourceKey ? await getSpeciesByKey(species.sourceKey) : null;
  groups.push({
    title: species.name.trim() || base?.nameDe || base?.name || species.sourceKey,
    sourceKey: species.sourceKey,
    unresolved: !base,
    features: base
      ? base.traits.map((t) => ({ name: t.nameDe || t.name, desc: t.descDe || t.desc, key: t.key, grants: t.grants }))
      : [],
  });

  if (species.subspeciesKey) {
    const sub = await getSpeciesByKey(species.subspeciesKey);
    groups.push({
      title: species.subspeciesName?.trim() || sub?.nameDe || sub?.name || species.subspeciesKey,
      sourceKey: species.subspeciesKey,
      unresolved: !sub,
      features: sub ? sub.traits.map((t) => ({ name: t.nameDe || t.name, desc: t.descDe || t.desc, key: t.key, grants: t.grants })) : [],
    });
  }
  return groups;
}

/**
 * Löst die Vorteile des verlinkten Hintergrunds auf. null, wenn kein Hintergrund
 * gepflegt ist. Das Herkunftstalent wird zusätzlich gegen das Feats-Wörterbuch
 * aufgelöst und als eigener Eintrag angehängt — im Charakter steht es nicht in
 * `features`, es kommt allein aus dem Hintergrund.
 */
export async function resolveBackground(background: CharacterBackground | undefined): Promise<ResolvedFeatureGroup | null> {
  if (!background || (!background.sourceKey && !background.name.trim())) return null;

  const base = background.sourceKey ? await getBackgroundByKey(background.sourceKey) : null;
  const title = background.name.trim() || base?.nameDe || base?.name || background.sourceKey;
  if (!base) return { title, sourceKey: background.sourceKey, unresolved: true, features: [] };

  const features: ResolvedFeature[] = base.benefits.map((b) => ({
    // Ohne eigenen Namen bleibt die Art des Vorteils die Überschrift.
    name: b.nameDe || b.name || BENEFIT_TYPE_LABELS[b.type],
    desc: b.descDe || b.desc,
    key: b.key,
  }));

  if (base.featKey) {
    const lib = await getFeats();
    const entry = lib.find((f) => f.sourceKey === base.featKey);
    features.push({
      name: `Herkunftstalent: ${entry ? featDisplayName(entry) : base.featKey}`,
      desc: entry ? featDesc(entry) : '',
      key: base.featKey,
    });
  }

  return { title, sourceKey: background.sourceKey, unresolved: false, features };
}

/**
 * Teilt das Merkmals-Ledger anhand der bereits aufgelösten Merkmals-Keys in seine zwei
 * Eintragsarten: `annotations` sind Entscheidungen zu einem vorhandenen Merkmal,
 * `unmatched` alles Übrige (Talent-Links; bei getauschtem Klassen-Link auch verwaiste
 * Entscheidungen). Der Aufrufer sammelt die Keys aus seinen Gruppen — nur so bleibt es
 * für die Karte (eine Liste) und den Editor (drei getrennte Abschnitte) dasselbe Stück Logik.
 */
/**
 * Die getroffene Wahl, wie sie einem Menschen gezeigt wird. `choice` führt das englische
 * kanonische Label (so geht es an die KI und so kommt es als `<past_choices>` zurück),
 * `choiceDe` die Anzeige — Altbestand hat nur `choice`, dort steht dann noch Deutsch.
 */
export function choiceDisplay(e: { choice: string; choiceDe?: string }): string {
  return e.choiceDe?.trim() || e.choice;
}

export function splitFeatureEntries(
  entries: CharacterFeatureEntry[] | undefined,
  resolvedKeys: Iterable<string>,
): { annotations: Map<string, string>; unmatched: CharacterFeatureEntry[] } {
  const known = new Set(resolvedKeys);
  const annotations = new Map<string, string>();
  const unmatched: CharacterFeatureEntry[] = [];
  for (const e of entries ?? []) {
    if (!e.choice.trim() || !e.sourceKey || !known.has(e.sourceKey)) {
      unmatched.push(e);
      continue;
    }
    // Ein Merkmal kann mehrfach vergeben werden (Expertise auf 1 UND 6), wird aber als EIN
    // Merkmal gerendert — die Entscheidungen sammeln sich deshalb, statt sich zu überschreiben.
    const prev = annotations.get(e.sourceKey);
    const shown = choiceDisplay(e);
    annotations.set(e.sourceKey, prev ? `${prev}; ${shown}` : shown);
  }
  return { annotations, unmatched };
}

/** Alle Merkmals-Keys aufgelöster Gruppen — Eingabe für `splitFeatureEntries`. */
export function keysOf(groups: ResolvedFeatureGroup[]): string[] {
  return groups.flatMap((g) => g.features.map((f) => f.key ?? '').filter(Boolean));
}

/** Schreibt die passenden Entscheidungen in die Merkmale einer Gruppe (ohne zu mutieren). */
export function withChoices(groups: ResolvedFeatureGroup[], annotations: Map<string, string>): ResolvedFeatureGroup[] {
  if (!annotations.size) return groups;
  return groups.map((g) => ({
    ...g,
    features: g.features.map((f) => {
      const choice = f.key ? annotations.get(f.key) : undefined;
      return choice ? { ...f, choice } : f;
    }),
  }));
}

/**
 * Löst die verlinkten Talente eines Charakters gegen das Feats-Wörterbuch auf
 * (Beschreibung aus der Bibliothek; Legacy-`desc` nur als letzter Fallback).
 *
 * Erwartet die Einträge, die `mergeFeatureChoices` NICHT zuordnen konnte. Ein Eintrag,
 * den auch das Wörterbuch nicht kennt, ist keine stille Lücke: `key` bleibt gesetzt,
 * damit der Aufrufer ihn als unzugeordnete Entscheidung anzeigen kann.
 */
export async function resolveFeatLinks(feats: CharacterFeatureEntry[] | undefined): Promise<ResolvedFeature[]> {
  const links = feats ?? [];
  if (!links.length) return [];
  const lib = await getFeats();
  return links.map((ref) => {
    const entry = matchFeatEntry(lib, ref);
    return {
      // Ohne Treffer und ohne Namen bleibt der Key die einzige Anzeige — besser als leer.
      name: entry ? featDisplayName(entry) : ref.name || ref.sourceKey,
      desc: entry ? featDesc(entry) : (ref.desc ?? ''),
      gainedAt: ref.gainedAt,
      key: ref.sourceKey,
      choice: choiceDisplay(ref) || undefined,
      grants: entry?.grants,
      unresolved: !entry,
    };
  });
}

/**
 * Vollständig aufgelöste Merkmale eines Charakters — Klasse/Subklasse, Spezies,
 * Hintergrund, Talent-Links und die verwaisten Entscheidungen, in genau den Gruppen,
 * die Karte und KI-Kontext brauchen. Die Entscheidungen sind schon in die Merkmale
 * eingetragen (`withChoices`).
 */
export interface ResolvedCharacterFeatures {
  speciesGroups: ResolvedFeatureGroup[];
  classGroups: ResolvedFeatureGroup[];
  backgroundGroups: ResolvedFeatureGroup[];
  featEntries: ResolvedFeature[]; // Talent-Links (kein verwaister Entscheidungs-Eintrag)
  orphanChoices: ResolvedFeature[]; // Entscheidung ohne zugeordnetes Merkmal
}

/**
 * Die eine Stelle, an der Klassen-/Spezies-/Hintergrund-Merkmale und Talent-Links
 * zusammen aufgelöst werden. Die Reihenfolge ist zwingend: erst alle Gruppen, dann
 * `splitFeatureEntries` über deren Keys — nur so entscheidet sich, welcher Ledger-Eintrag
 * eine Entscheidung zu einem vorhandenen Merkmal ist und welcher ein Talent-Link.
 *
 * Konsument mit anderem Zwischenbedarf (Editor: drei getrennte Abschnitte; LevelUp:
 * nur Merkmale ohne Entscheidung) bleibt bewusst bei der direkten Verwendung der
 * Einzelfunktionen — hier steht die eine Sequenz für Karte und KI-Kontext.
 */
export async function resolveCharacterFeatures(c: {
  classes?: CharacterClass[];
  species?: CharacterSpecies;
  backgroundRef?: CharacterBackground;
  features?: CharacterFeatureEntry[];
}): Promise<ResolvedCharacterFeatures> {
  const [cls, spec, bg] = await Promise.all([
    resolveClassFeatures(c.classes ?? []),
    resolveSpeciesTraits(c.species),
    resolveBackground(c.backgroundRef),
  ]);
  const groups = [...cls, ...(spec ?? []), ...(bg ? [bg] : [])];
  const { annotations, unmatched } = splitFeatureEntries(c.features, keysOf(groups));
  const featLinks = await resolveFeatLinks(unmatched);
  return {
    speciesGroups: withChoices(spec ?? [], annotations),
    classGroups: withChoices(cls, annotations),
    backgroundGroups: withChoices(bg ? [bg] : [], annotations),
    featEntries: featLinks.filter((f) => !isOrphanChoice(f)),
    orphanChoices: featLinks.filter(isOrphanChoice),
  };
}

/**
 * Zauberwerte der merkmals-gewährten Zugänge (Eingeweihter der Magie & Co.), zur Anzeigezeit aus
 * Deklaration + Ledger gerechnet. Nichts wird zurückgeschrieben: der Übungsbonus steigt, ein
 * gespeicherter SG würde altern. Ohne beantwortetes Attribut fällt der Zugang heraus.
 */
export async function resolveSpellAccess(c: {
  features?: CharacterFeatureEntry[];
  proficiencyBonus?: number;
  mods: Record<AbilityKey, number>;
}): Promise<SpellAccessValues[]> {
  const entries = c.features ?? [];
  if (!entries.length) return [];

  const lib = await getFeats();
  const out: SpellAccessValues[] = [];
  const seen = new Set<string>();
  for (const ref of entries) {
    const key = ref.sourceKey ?? '';
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const feat = matchFeatEntry(lib, ref);
    if (!feat) continue;
    const grant = spellAccessGrantOf({
      key: feat.sourceKey,
      name: feat.name,
      nameDe: feat.nameDe,
      grantsChoice: feat.grantsChoice,
    });
    if (!grant) continue;

    const values = spellAccessValues(grant, entries, c.mods, c.proficiencyBonus ?? 2);
    if (values) out.push(values);
  }
  return out;
}

/** Eine früher getroffene Entscheidung, aufgelöst auf den Merkmalsnamen (für KI-Kontext). */
export interface PastChoice {
  featureKey: string;
  feature: string; // Anzeigename des Merkmals; Fallback = Key
  /** Englisches kanonisches Label — bei Altbestand noch deutsch (der Prompt sagt das). */
  choice: string;
}

/**
 * Die bereits getroffenen Entscheidungen des Charakters mit aufgelöstem Merkmalsnamen.
 * Bewusst ohne Regelprosa: die Merkmalstexte kommen im Prompt ohnehin aus der Bibliothek,
 * hier zählt allein „zu diesem Merkmal steht die Wahl schon fest".
 */
export async function resolvePastChoices(c: {
  classes?: CharacterClass[];
  species?: CharacterSpecies;
  backgroundRef?: CharacterBackground;
  features?: CharacterFeatureEntry[];
}): Promise<PastChoice[]> {
  const withChoice = (c.features ?? []).filter((e) => e.choice.trim() && e.sourceKey);
  if (!withChoice.length) return [];

  const [cls, spec, bg] = await Promise.all([
    resolveClassFeatures(c.classes ?? []),
    resolveSpeciesTraits(c.species),
    resolveBackground(c.backgroundRef),
  ]);
  const nameByKey = new Map<string, string>();
  for (const g of [...cls, ...(spec ?? []), ...(bg ? [bg] : [])])
    for (const f of g.features) if (f.key) nameByKey.set(f.key, f.name);

  return withChoice.map((e) => ({
    featureKey: e.sourceKey,
    feature: nameByKey.get(e.sourceKey) || e.name || e.sourceKey,
    choice: e.choice,
  }));
}

/**
 * Eine Entscheidung, deren Merkmal nirgends auftaucht — passiert, wenn der Klassen-Link
 * getauscht wurde oder ein Re-Import den Merkmals-Key verschoben hat. Wird angezeigt statt
 * verschluckt, damit die fehlende Verlinkung sichtbar bleibt.
 */
export function isOrphanChoice(f: ResolvedFeature): boolean {
  return !!f.unresolved && !!f.choice;
}

/**
 * Die Speziesmerkmale eines Charakters als Deklarationsquelle.
 *
 * Nicht `resolveSpeciesTraits`: das liefert `descDe || desc` fürs Anzeigen, hier braucht es
 * den ENGLISCHEN Text — die Zauber-Stufentabelle wird daraus gelesen (`grantedSpells.ts`).
 */
export async function declaredSpeciesFeatures(
  species: CharacterSpecies | undefined,
): Promise<DeclaredFeature[]> {
  const keys = [species?.sourceKey, species?.subspeciesKey].filter((k): k is string => !!k?.trim());
  const specs = await Promise.all(keys.map((k) => getSpeciesByKey(k)));
  return specs.flatMap((spec) => (spec ? declaredFeatures('species', spec.traits) : []));
}
