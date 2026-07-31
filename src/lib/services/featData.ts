/**
 * Talent-(Feat-)Bibliotheks-Adapter — gespeist DIREKT aus Open5e v2 (`/v2/feats/`).
 *
 * Bildet die rohe v2-Struktur auf das zweisprachige `featSchema` ab. `benefits[]`
 * (Open5e listet die Talent-Effekte als Liste) werden in einen Beschreibungstext
 * zusammengefasst. `nameDe`/`descDe`/`prerequisiteDe` bleiben beim Import leer und
 * werden per LLM-Übersetzung nachgefüllt.
 */
import { featSchema, migrateFeatLegacy, type Feat } from '$lib/schemas/feat';
import { toSourceKey } from '$lib/schemas/source';
import { emptyProficiencyGrant, parseProseSkillGrant } from '$lib/schemas/grants';
import { FEAT_CATEGORIES } from '$lib/schemas/vocabulary';

/** Bildet ein rohes v2-Talent auf das offene, zweisprachige Schema ab. */
export function mapV2Feat(raw: Record<string, unknown>): Feat {
  const doc = (raw.document as { key?: string; gamesystem?: { key?: string } }) ?? {};
  const benefits = (raw.benefits as { desc?: string }[]) ?? [];
  const benefitText = benefits.map((b) => b.desc).filter(Boolean).join('\n\n');
  const desc = [typeof raw.desc === 'string' ? raw.desc : '', benefitText].filter(Boolean).join('\n\n');
  // Gewährte Fertigkeitsübungen aus der Prosa (SRD 5.2: nur „Skilled").
  const skills = parseProseSkillGrant(desc);

  const mapped = {
    key: (raw.key as string) ?? '',
    source: toSourceKey(doc.key),
    name: (raw.name as string) ?? '',
    // Open5e nennt die Kategorie `type`; ein fremdes Dokument (a5e, toh) kann Werte
    // außerhalb des 2024er Vokabulars liefern → auf den Default zurückfallen.
    category: (FEAT_CATEGORIES as readonly string[]).includes(raw.type as string)
      ? (raw.type as Feat['category'])
      : undefined,
    prerequisite: typeof raw.prerequisite === 'string' ? raw.prerequisite : '',
    desc,
    proficiencyGrant: skills ? { ...emptyProficiencyGrant(), skills } : emptyProficiencyGrant(),
    document: { key: doc.key ?? '', gamesystem: doc.gamesystem?.key ?? '' },
  };
  // Wie bei der Spezies: der Mapper schreibt die Altform, der Fold hebt sie in `grants`.
  return featSchema.parse(migrateFeatLegacy(mapped));
}
