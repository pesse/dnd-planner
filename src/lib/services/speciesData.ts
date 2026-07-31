/**
 * Spezies-Bibliotheks-Adapter — gespeist DIREKT aus Open5e v2 (`/v2/species/`).
 *
 * Ablauf (Muster von `classProgression.ts`): v2-Spezies holen (open5eApi) → auf
 * das offene, zweisprachige Schema mappen (`mapV2Species`) → Zod-validieren → in
 * einem In-Memory-Cache (pro Session) halten. `nameDe`/`descDe` bleiben beim
 * Import leer und werden per LLM-Übersetzung nachgefüllt.
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

/** Größe robust aus String oder Objekt (`{name}`) lesen. */
function readSize(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') return String((raw as { name?: string }).name ?? '');
  return '';
}

/** Deterministischer Slug aus einem Namen (für stabile Trait-Keys). */
function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Bildet eine rohe v2-Spezies auf das offene, zweisprachige Schema ab. */
export function mapV2Species(raw: Record<string, unknown>): Species {
  const rawTraits = (raw.traits as V2Trait[]) ?? [];
  const doc = (raw.document as { key?: string; gamesystem?: { key?: string } }) ?? {};
  const specKey = (raw.key as string) ?? '';

  // Open5e liefert keine Trait-Keys → deterministisch aus Spezies-Key + Name-Slug
  // erzeugen, damit Merkmale stabil referenzierbar sind (z.B. für pro-Stufe-Effekte).
  const traits: Trait[] = rawTraits.map((t) => {
    // Fertigkeitsübung aus der Merkmals-Prosa (Elf „Keen Senses", Mensch „Skillful");
    // alles Nicht-Modellierbare bleibt Prosa, siehe `parseProseSkillGrant`.
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
  // Der Mapper schreibt die Altform `proficiencyGrant`; `migrateSpeciesLegacy` hebt sie in die
  // Deklaration. Ohne das würde der Parse sie stumm verwerfen (das Schema ist nicht `strict`).
  return speciesSchema.parse(migrateSpeciesLegacy(mapped));
}

// ── Cache + Zugriff ──────────────────────────────────────────────────────────
const cache = new Map<string, Species | null>();

/**
 * Holt (und cached) eine Spezies zu einem v2-Key. Netzfehler / unbekannter Key /
 * unparsebares Dokument → null (Aufrufer degradieren, statt zu raten).
 */
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
