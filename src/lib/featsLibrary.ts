/**
 * Lese-Index der Talent-Bibliothek. Geschrieben wird ausschließlich über den
 * Talent-Karten-Editor — ein Charakter kann nur auf vorhandene Talente verlinken.
 */
import { createLibrary } from './services/library/createLibrary';
import { normName } from './utils/text';
import { FEAT_CATEGORIES, type FeatCategory } from './schemas/vocabulary';
import { castingGrantSchema, type CastingGrant } from './schemas/casting';
import { featureChoiceGrantsSchema, type FeatureChoiceGrant } from './schemas/featureChoice';
import { featureGrantSchema, spellGrantSchema, type FeatureGrant, type SpellGrant } from './schemas/grants';
import { migrateFeatLegacy } from './schemas/feat';

export const FEATS_PATH = './vault/feats';

/** Die Kategorienamen des deutschen SRD 5.2. */
export const FEAT_CATEGORY_DE: Record<FeatCategory, string> = {
  Origin: 'Herkunft',
  General: 'Allgemein',
  'Fighting Style': 'Kampfstil',
  'Epic Boon': 'Epische Gabe',
};

export interface FeatEntry {
  name: string;
  nameDe?: string;
  desc?: string;
  descDe?: string;
  /** Fehlt bei inline erzeugten Talenten. */
  prerequisite?: string;
  prerequisiteDe?: string;
  category?: FeatCategory;
  sourceKey?: string;
  /** Nur Bibliotheks-Talente können sie tragen. */
  grantsChoice?: FeatureChoiceGrant[];
  grantsSpells?: SpellGrant;
  grants?: FeatureGrant;
  grantsCasting?: CastingGrant;
  /** Bei inline erzeugten Talenten leer. */
  path?: string;
}

export function featDisplayName(f: FeatEntry): string {
  return f.nameDe ?? f.name;
}

export function featDesc(f: FeatEntry): string {
  return f.descDe || f.desc || '';
}

export function featPrereq(f: FeatEntry): string {
  return f.prerequisiteDe || f.prerequisite || '';
}

const library = createLibrary<FeatEntry & { path: string }>({
  path: FEATS_PATH,
  displayName: featDisplayName,
  maxResults: 8,
  read: (raw, { path, filename }) => {
    // Dieser Pfad parst feldweise, das Schema-Gate läuft hier nicht — der Fold muss sein.
    const data = migrateFeatLegacy(raw) as Record<string, any>;
    return {
      name: data.name ?? filename.replace('.json', ''),
      nameDe: data.nameDe,
      desc: data.desc,
      descDe: data.descDe,
      prerequisite: data.prerequisite,
      prerequisiteDe: data.prerequisiteDe,
      category: (FEAT_CATEGORIES as readonly string[]).includes(data.category)
        ? (data.category as FeatCategory)
        : undefined,
      // Bibliotheks-Talente führen ihre Identität als `key`; inline gespeicherte als `sourceKey`.
      sourceKey: data.sourceKey ?? data.key,
      grantsChoice: featureChoiceGrantsSchema.safeParse(data.grantsChoice).data,
      grantsSpells: spellGrantSchema.safeParse(data.grantsSpells).data,
      grants: featureGrantSchema.safeParse(data.grants).data,
      grantsCasting: castingGrantSchema.safeParse(data.grantsCasting).data,
      path,
    };
  },
});

export const getFeats = library.list;
export const invalidateFeatsCache = library.invalidate;
export const searchFeats = library.search as (
  library: FeatEntry[],
  query: string,
  maxResults?: number,
) => FeatEntry[];

/**
 * Bibliotheks-Treffer für eine Charakter-Referenz: `sourceKey` zuerst, Name (DE oder EN)
 * als Fallback für Altdaten ohne Key. Einzige Stelle dieser Regel — `resolveFeatLinks`
 * und der Talent-Picker im Charakter-Editor müssen dasselbe „verlinkt" verstehen.
 */
export function matchFeatEntry(
  library: FeatEntry[],
  ref: { sourceKey?: string; name?: string },
): FeatEntry | undefined {
  const key = ref.sourceKey?.trim();
  const nm = normName(ref.name);
  return library.find(
    (f) => (!!key && f.sourceKey === key)
      || (!!nm && (normName(featDisplayName(f)) === nm || normName(f.name) === nm)),
  );
}
