/**
 * Hintergrund-Adapter aus Open5e v2 (`/v2/backgrounds/`), Muster wie `speciesData.ts`.
 * `nameDe`/`descDe` bleiben beim Import leer; bei den SRD-5.2-Hintergründen auch `desc` —
 * Open5e führt dort keinen Fließtext, nur die Vorteile.
 */
import { backgroundSchema, type Background, type Benefit, type BenefitType, BENEFIT_TYPES } from '$lib/schemas/background';
import { toSourceKey } from '$lib/schemas/source';
import { emptyProficiencyGrant, type ProficiencyGrant } from '$lib/schemas/grants';
import { parseSkillNames } from '$lib/schemas/vocabulary';
import { getBackground as fetchBackground } from './open5eClient';

interface V2Benefit {
  name?: string;
  desc?: string;
  type?: string;
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Unbekannte `type`-Werte fallen auf 'other' — das Schema-Enum bleibt geschlossen. */
function readBenefitType(raw: string | undefined): BenefitType {
  return (BENEFIT_TYPES as readonly string[]).includes(raw ?? '') ? (raw as BenefitType) : 'other';
}

/** Open5e schreibt sie als Aufzählung: "Strength, Dexterity, Constitution". */
function readAbilityScores(desc: string): string[] {
  return desc
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Der Klammerzusatz gehört nicht zum Talent: "Magic Initiate (Cleric)" → `magic-initiate`. */
function readFeatKey(desc: string, source: string): string {
  const name = desc.split('(')[0];
  const s = slug(name);
  return s ? `${source}_${s}` : '';
}

/**
 * Eine Aufzählung ohne Wahl („Insight and Religion") — alle 16 SRD-Hintergründe haben
 * genau zwei FESTE Fertigkeiten. Ein unbekannter Name wirft, statt still zu fehlen.
 */
function readSkillGrant(benefits: Benefit[], bgKey: string): ProficiencyGrant {
  const desc = benefits.find((b) => b.type === 'skill_proficiency')?.desc?.trim();
  if (!desc) return emptyProficiencyGrant();
  return {
    ...emptyProficiencyGrant(),
    skills: { fixed: parseSkillNames(desc, `Hintergrund ${bgKey}`), choose: 0, from: [] },
  };
}

export function mapV2Background(raw: Record<string, unknown>): Background {
  const rawBenefits = (raw.benefits as V2Benefit[]) ?? [];
  const doc = (raw.document as { key?: string; gamesystem?: { key?: string } }) ?? {};
  const bgKey = (raw.key as string) ?? '';
  const source = toSourceKey(doc.key);

  // Open5e liefert keine Benefit-Keys; ohne einen deterministischen wären sie nicht
  // referenzierbar (wie bei den Spezies-Merkmalen).
  const benefits: Benefit[] = rawBenefits.map((b) => ({
    key: bgKey && b.name ? `${bgKey}_${slug(b.name)}` : '',
    type: readBenefitType(b.type),
    name: b.name ?? '',
    desc: b.desc ?? '',
  }));

  const abilityBenefit = benefits.find((b) => b.type === 'ability_score');
  const featBenefit = benefits.find((b) => b.type === 'feat');

  const mapped = {
    key: bgKey,
    source,
    name: (raw.name as string) ?? '',
    desc: typeof raw.desc === 'string' ? raw.desc : '',
    abilityScores: abilityBenefit ? readAbilityScores(abilityBenefit.desc) : [],
    featKey: featBenefit ? readFeatKey(featBenefit.desc, source) : '',
    proficiencyGrant: readSkillGrant(benefits, bgKey),
    document: { key: doc.key ?? '', gamesystem: doc.gamesystem?.key ?? '' },
    benefits,
  };
  return backgroundSchema.parse(mapped);
}

const cache = new Map<string, Background | null>();

/** Jeder Fehlschlag wird zu `null` — der Aufrufer degradiert, statt zu raten. */
export async function getBackground(key: string): Promise<Background | null> {
  if (cache.has(key)) return cache.get(key)!;
  try {
    const background = mapV2Background(await fetchBackground(key));
    cache.set(key, background);
    return background;
  } catch {
    cache.set(key, null);
    return null;
  }
}
