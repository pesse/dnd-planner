/**
 * Talent-(Feat-)Bibliotheks-Adapter — gespeist DIREKT aus Open5e v2 (`/v2/feats/`).
 *
 * Bildet die rohe v2-Struktur auf das zweisprachige `featSchema` ab. `benefits[]`
 * (Open5e listet die Talent-Effekte als Liste) werden in einen Beschreibungstext
 * zusammengefasst. `nameDe`/`descDe`/`prerequisiteDe` bleiben beim Import leer und
 * werden per LLM-Übersetzung nachgefüllt.
 */
import { featSchema, type Feat } from '$lib/schemas/feat';
import { toSourceKey } from '$lib/schemas/shared';

/** Bildet ein rohes v2-Talent auf das offene, zweisprachige Schema ab. */
export function mapV2Feat(raw: Record<string, unknown>): Feat {
  const doc = (raw.document as { key?: string; gamesystem?: { key?: string } }) ?? {};
  const benefits = (raw.benefits as { desc?: string }[]) ?? [];
  const benefitText = benefits.map((b) => b.desc).filter(Boolean).join('\n\n');
  const desc = [typeof raw.desc === 'string' ? raw.desc : '', benefitText].filter(Boolean).join('\n\n');

  const mapped = {
    key: (raw.key as string) ?? '',
    source: toSourceKey(doc.key),
    name: (raw.name as string) ?? '',
    prerequisite: typeof raw.prerequisite === 'string' ? raw.prerequisite : '',
    desc,
    document: { key: doc.key ?? '', gamesystem: doc.gamesystem?.key ?? '' },
  };
  return featSchema.parse(mapped);
}
