/**
 * Löst die am Charakter VERLINKTEN Merkmale zur Laufzeit aus der lokalen Bibliothek
 * auf — analog zum Zauber-Modell: der Charakter speichert nur Links
 * (`classes[]` → vault/classes, `species` → vault/species, `references.feats[]`
 * → vault/feats), die Inhalte (Name/Beschreibung) kommen aus der Bibliothek.
 *
 * Klassen-/Subklassen-Merkmale werden bis zur aktuellen Stufe aufgezählt
 * (`featuresUpTo`). Fehlt ein Link lokal (kein sourceKey oder nicht in der
 * Bibliothek), wird die Gruppe als `unresolved` markiert, damit die UI dem
 * Nutzer die Verlinkung/Anlage anbieten kann.
 */
import { getProgressionByKey, featuresUpTo } from './classProgression';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getFeats, featDesc, featDisplayName } from '$lib/featsLibrary';
import type { CharacterClass, CharacterSpecies, ReferenceEntry } from '$lib/schemas/character';

/** Ein aufgelöstes Merkmal (Name/Beschreibung DE-bevorzugt). */
export interface ResolvedFeature {
  name: string;
  desc: string;
  gainedAt?: number; // Stufe, auf der es (zuerst) erlangt wird
  key?: string;
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
      ? base.traits.map((t) => ({ name: t.nameDe || t.name, desc: t.descDe || t.desc, key: t.key }))
      : [],
  });

  if (species.subspeciesKey) {
    const sub = await getSpeciesByKey(species.subspeciesKey);
    groups.push({
      title: species.subspeciesName?.trim() || sub?.nameDe || sub?.name || species.subspeciesKey,
      sourceKey: species.subspeciesKey,
      unresolved: !sub,
      features: sub ? sub.traits.map((t) => ({ name: t.nameDe || t.name, desc: t.descDe || t.desc, key: t.key })) : [],
    });
  }
  return groups;
}

/**
 * Löst die verlinkten Talente eines Charakters gegen das Feats-Wörterbuch auf
 * (Beschreibung aus der Bibliothek; Legacy-`desc` nur als letzter Fallback).
 */
export async function resolveFeatLinks(feats: ReferenceEntry[] | undefined): Promise<ResolvedFeature[]> {
  const links = feats ?? [];
  if (!links.length) return [];
  const lib = await getFeats();
  return links.map((ref) => {
    const key = ref.sourceKey?.trim();
    const nm = ref.name.trim().toLowerCase();
    const entry = lib.find(
      (f) => (key && f.sourceKey === key) || featDisplayName(f).toLowerCase() === nm || f.name.toLowerCase() === nm,
    );
    return {
      name: entry ? featDisplayName(entry) : ref.name,
      desc: entry ? featDesc(entry) : (ref.desc ?? ''),
      gainedAt: ref.gainedAt,
      key: ref.sourceKey,
    };
  });
}
