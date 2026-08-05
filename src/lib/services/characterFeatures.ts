/**
 * Löst die am Charakter VERLINKTEN Merkmale zur Laufzeit aus der Bibliothek auf.
 * Ein nicht auflösbarer Link wird als `unresolved` markiert statt verschluckt — nur so
 * kann die UI die Verlinkung anbieten.
 */
import { getProgressionByKey, featuresUpTo } from './classProgression';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getFeats, featDesc, featDisplayName, matchFeatEntry } from '$lib/featsLibrary';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { BENEFIT_TYPE_LABELS } from '$lib/schemas/background';
import { spellAccessGrantOf, spellAccessValues, type SpellAccessValues } from './spellcasting/access';
import { characterLevel, featInstances } from './spellcasting/resolve';
import type { AbilityKey } from '$lib/schemas/classProgression';
import type { CharacterClass, CharacterSpecies, CharacterBackground, CharacterFeatureEntry } from '$lib/schemas/characterSchema';
import type { FeatureGrant } from '$lib/schemas/grants';
import { declaredFeatures, type DeclaredFeature, type FeatureSource } from './declaredFeature';

/** Name und Beschreibung DE-bevorzugt — das ist die Anzeigeform, nicht die KI-Eingabe. */
export interface ResolvedFeature {
  name: string;
  desc: string;
  gainedAt?: number; // Stufe, auf der es ZUERST erlangt wird
  key?: string;
  choice?: string;
  /** Fehlt bei Altdaten; `{}` heißt dagegen „geprüft, gewährt nichts". */
  grants?: FeatureGrant;
  /** Kein Bibliothekstreffer — Name/Beschreibung stammen aus dem Charakter selbst. */
  unresolved?: boolean;
}

export interface ResolvedFeatureGroup {
  title: string; // „Waldläufer 5" · „Kreis des Mondes" · „Zwerg"
  sourceKey: string;
  unresolved: boolean;
  features: ResolvedFeature[];
}

function firstGainedAt(gainedAt: number[], level: number): number | undefined {
  const eligible = gainedAt.filter((l) => l <= level);
  return eligible.length ? Math.min(...eligible) : undefined;
}

/** Eine Gruppe je Klasse UND je verlinkter Subklasse, jeweils bis zur Klassenstufe. */
export async function resolveClassFeatures(classes: CharacterClass[]): Promise<ResolvedFeatureGroup[]> {
  const groups: ResolvedFeatureGroup[] = [];
  for (const cls of classes ?? []) {
    if (!cls.name.trim() && !cls.sourceKey) continue;
    const level = cls.level || 1;

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
 * Das Herkunftstalent hängt hier als eigener Eintrag an: im Charakter steht es NICHT in
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
 * `choice` führt das englische kanonische Label (so geht es an die KI zurück), `choiceDe`
 * die Anzeige — Altbestand hat nur `choice`, dort steht dann noch Deutsch.
 */
export function choiceDisplay(e: { choice: string; choiceDe?: string }): string {
  return e.choiceDe?.trim() || e.choice;
}

/**
 * Zerlegt das Ledger in Entscheidungen zu vorhandenen Merkmalen und alles Übrige
 * (Talent-Links, bei getauschtem Klassen-Link auch verwaiste Entscheidungen). Die Keys
 * kommen vom Aufrufer, damit Karte und Editor dieselbe Logik teilen.
 */
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
    // Mehrfachvergabe (Expertise auf 1 UND 6) rendert als EIN Merkmal — die Entscheidungen
    // sammeln sich deshalb, statt sich zu überschreiben.
    const prev = annotations.get(e.sourceKey);
    const shown = choiceDisplay(e);
    annotations.set(e.sourceKey, prev ? `${prev}; ${shown}` : shown);
  }
  return { annotations, unmatched };
}

export function keysOf(groups: ResolvedFeatureGroup[]): string[] {
  return groups.flatMap((g) => g.features.map((f) => f.key ?? '').filter(Boolean));
}

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
 * Erwartet die von `splitFeatureEntries` NICHT zugeordneten Einträge. Ein auch im
 * Wörterbuch unbekannter Eintrag behält seinen `key` — sonst verschwände er still.
 */
export async function resolveFeatLinks(feats: CharacterFeatureEntry[] | undefined): Promise<ResolvedFeature[]> {
  const links = feats ?? [];
  if (!links.length) return [];
  const lib = await getFeats();
  return links.map((ref) => {
    const entry = matchFeatEntry(lib, ref);
    return {
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

/** Die Entscheidungen sind hier schon in die Merkmale eingetragen (`withChoices`). */
export interface ResolvedCharacterFeatures {
  speciesGroups: ResolvedFeatureGroup[];
  classGroups: ResolvedFeatureGroup[];
  backgroundGroups: ResolvedFeatureGroup[];
  featEntries: ResolvedFeature[];
  orphanChoices: ResolvedFeature[]; // Entscheidung ohne zugeordnetes Merkmal
}

/**
 * Die Reihenfolge ist zwingend: erst alle Gruppen, dann `splitFeatureEntries` über deren
 * Keys — nur so trennen sich Entscheidung und Talent-Link. Aufrufer mit anderem
 * Zwischenbedarf (Editor, LevelUp) nutzen bewusst die Einzelfunktionen.
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
 * Zur Anzeigezeit gerechnet, nichts wird zurückgeschrieben: der Übungsbonus steigt, ein
 * gespeicherter SG würde altern. Ohne beantwortetes Attribut fällt der Zugang heraus.
 */
export async function resolveSpellAccess(c: {
  classes?: CharacterClass[];
  species?: CharacterSpecies;
  backgroundRef?: CharacterBackground;
  features?: CharacterFeatureEntry[];
  proficiencyBonus?: number;
  mods: Record<AbilityKey, number>;
}): Promise<SpellAccessValues[]> {
  const level = characterLevel(c.classes);
  const out: SpellAccessValues[] = [];
  for (const inst of await featInstances(c.features, c.backgroundRef)) {
    const grant = spellAccessGrantOf(
      {
        key: inst.featureKey,
        name: inst.entry.name,
        nameDe: inst.entry.nameDe,
        grantsChoice: inst.entry.grantsChoice,
        grantsCasting: inst.entry.grantsCasting,
      },
      { specialisation: inst.specialisation, level, gainedAt: inst.gainedAt, sourceId: inst.sourceId },
    );
    if (!grant) continue;

    const values = spellAccessValues(grant, c.features ?? [], c.mods, c.proficiencyBonus ?? 2);
    if (values) out.push(values);
  }
  return out;
}

export interface PastChoice {
  featureKey: string;
  feature: string; // Anzeigename; Fallback = Key
  /** Englisches kanonisches Label — bei Altbestand noch deutsch (der Prompt sagt das). */
  choice: string;
}

/**
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
 * Entscheidung ohne Merkmal — getauschter Klassen-Link oder verschobener Key nach Re-Import.
 * Wird angezeigt statt verschluckt, damit die fehlende Verlinkung sichtbar bleibt.
 */
export function isOrphanChoice(f: ResolvedFeature): boolean {
  return !!f.unresolved && !!f.choice;
}

/**
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

/**
 * Ein deklariertes Merkmal samt TRÄGER — der Rohstoff der Wahl-Plätze
 * (`services/characterChoices.ts`).
 */
export interface DeclaredSlotSource {
  feature: DeclaredFeature;
  group: string; // „Schurke 6" · „Elf" · „Talente"
  /**
   * Vergabe-Stufen, ein Wahl-Platz je Stufe. Steht am Träger, nicht an `DeclaredFeature`:
   * dasselbe Bibliotheks-Merkmal ist mehrfach vergeben (Expertise auf 1 UND 6).
   */
  gainedAt: number[];
  /**
   * Maßgebliche Stufe für `options[].spells`: KLASSENstufe am Klassenmerkmal,
   * CHARAKTERstufe bei Spezies und Talent — deshalb läuft `declaredSpellGrants` zweimal.
   */
  level: number;
  /** Vorgabe der QUELLE des Merkmals; nur das Herkunftstalent trägt eine. */
  specialisation?: string;
  /** Quellen-Id der Instanz; Vorgabe ist der Merkmals-Key (`castingSourceId`). */
  sourceId?: string;
}

/**
 * Nicht `resolveClassFeatures`: das faltet die Mehrfachvergabe auf `firstGainedAt` zusammen
 * und liefert Anzeigetext. Hier braucht es die VOLLE `gainedAt`-Liste (sonst schuldet ein
 * Schurke der Stufe 6 nur eine Expertise statt zwei) und den englischen Text.
 */
export async function declaredClassFeatures(classes: CharacterClass[]): Promise<DeclaredSlotSource[]> {
  const out: DeclaredSlotSource[] = [];
  for (const cls of classes ?? []) {
    const level = cls.level || 1;
    const carriers: { key: string; source: FeatureSource; name: string }[] = [];
    if (cls.sourceKey) carriers.push({ key: cls.sourceKey, source: 'class', name: cls.name.trim() });
    if (cls.subclassKey) carriers.push({ key: cls.subclassKey, source: 'subclass', name: cls.subclassName?.trim() ?? '' });
    for (const carrier of carriers) {
      const prog = await getProgressionByKey(carrier.key);
      if (!prog) continue;
      const group = `${carrier.name || prog.nameDe || prog.name || carrier.key} ${level}`;
      const raw = featuresUpTo(prog, level);
      // Index-gleich: `declaredFeatures` mappt 1:1 — `gainedAt` steht nur am Rohmerkmal.
      declaredFeatures(carrier.source, raw).forEach((feature, i) => {
        out.push({ feature, group, gainedAt: raw[i].gainedAt, level });
      });
    }
  }
  return out;
}

/**
 * Ein Wahl-Platz je INSTANZ, nicht je Talent-Key: `featInstances` trennt ein zweimal
 * genommenes Talent und hält das von Hand verlinkte Herkunftstalent mit dem aus dem
 * Hintergrund zusammen. `spellAccess` trägt zusätzlich Vorgabe und Quellen-Id, weil beide
 * seine Frage bestimmen.
 */
export async function declaredFeatFeatures(
  features: CharacterFeatureEntry[] | undefined,
  background: CharacterBackground | undefined,
  charLevel: number,
): Promise<DeclaredSlotSource[]> {
  const out: DeclaredSlotSource[] = [];
  for (const inst of await featInstances(features, background)) {
    const [feature] = declaredFeatures('feat', [{
      key: inst.featureKey,
      name: inst.entry.name,
      nameDe: inst.entry.nameDe,
      desc: inst.entry.desc,
      grants: inst.entry.grants,
      grantsChoice: inst.entry.grantsChoice,
      grantsSpells: inst.entry.grantsSpells,
      grantsCasting: inst.entry.grantsCasting,
    }]);
    out.push({
      feature,
      group: 'Talente',
      // Gekappt an der Charakterstufe: eine Erwerbsstufe über ihr (Altdaten, Tippfehler)
      // würde ihren Platz sonst wegfiltern und die Wahl unsichtbar machen.
      gainedAt: [Math.min(inst.gainedAt, charLevel)],
      level: charLevel,
      specialisation: inst.specialisation,
      sourceId: inst.sourceId,
    });
  }
  return out;
}
