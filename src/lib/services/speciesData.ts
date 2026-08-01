/**
 * Spezies-Adapter, gespeist direkt aus Open5e v2 (`/v2/species/`), Muster wie
 * `classProgression.ts`. `nameDe`/`descDe` bleiben beim Import leer — die füllt
 * später die LLM-Übersetzung.
 */
import { speciesSchema, migrateSpeciesLegacy, type Species, type Trait } from '$lib/schemas/species';
import { toSourceKey } from '$lib/schemas/source';
import { emptyProficiencyGrant, parseProseSkillGrant } from '$lib/schemas/grants';
import { getSpecies as fetchSpecies } from './open5eClient';

interface V2Trait {
  key?: string;
  name?: string;
  desc?: string;
}

/** v2 liefert die Größe mal als String, mal als `{name}`. */
function readSize(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') return String((raw as { name?: string }).name ?? '');
  return '';
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function mapV2Species(raw: Record<string, unknown>): Species {
  const rawTraits = (raw.traits as V2Trait[]) ?? [];
  const doc = (raw.document as { key?: string; gamesystem?: { key?: string } }) ?? {};
  const specKey = (raw.key as string) ?? '';

  // Open5e liefert keine Trait-Keys; ohne einen deterministischen wären Merkmale nicht
  // stabil referenzierbar (pro-Stufe-Effekte, Deklarationen).
  const traits: Trait[] = rawTraits.map((t) => {
    // Nur die Fertigkeitsübung ist aus der Prosa modellierbar, der Rest bleibt Text.
    const skills = parseProseSkillGrant(t.desc ?? '');
    return {
      key: t.key || (specKey && t.name ? `${specKey}_${slug(t.name)}` : ''),
      name: t.name ?? '',
      desc: t.desc ?? '',
      proficiencyGrant: skills ? { ...emptyProficiencyGrant(), skills } : emptyProficiencyGrant(),
    };
  });

  const mapped = {
    key: specKey,
    source: toSourceKey(doc.key),
    name: (raw.name as string) ?? '',
    size: readSize(raw.size),
    speed: typeof raw.speed === 'string' ? raw.speed : String((raw.speed as { walk?: number })?.walk ?? ''),
    document: { key: doc.key ?? '', gamesystem: doc.gamesystem?.key ?? '' },
    traits,
  };
  // Der Mapper schreibt die Altform `proficiencyGrant`; `migrateSpeciesLegacy` hebt sie in
  // die Deklaration. Ohne das verwirft der Parse sie stumm — das Schema ist nicht `strict`.
  return speciesSchema.parse(migrateSpeciesLegacy(mapped));
}

const cache = new Map<string, Species | null>();

/** Jeder Fehlschlag wird zu `null` — der Aufrufer degradiert, statt zu raten. */
export async function getSpecies(key: string): Promise<Species | null> {
  if (cache.has(key)) return cache.get(key)!;
  try {
    const species = mapV2Species(await fetchSpecies(key));
    cache.set(key, species);
    return species;
  } catch {
    cache.set(key, null);
    return null;
  }
}
