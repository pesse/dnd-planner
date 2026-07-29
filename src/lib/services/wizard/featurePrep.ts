/**
 * Aufbereitung der Stufe-1-Merkmale für die KI-Jobs des Erstell-Wizards.
 *
 * Bewusst RUNENFREI und aus `characterWizard.svelte.ts` herausgezogen: die Eval-Strecke
 * läuft in `environment: 'node'` ohne Svelte-Compiler und kann eine `.svelte.ts` nicht
 * importieren. Ohne diese Trennung müsste die Fixture den Aufbau abschreiben — und würde
 * vom echten Wizard-Eingang wegdriften.
 */
import { getProgressionByKey, featuresUpTo } from '../classProgression';
import type { ClassProgression } from '$lib/schemas/classProgression';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import type { Background } from '$lib/schemas/background';
import { getFeats, featDesc, featDisplayName } from '$lib/featsLibrary';
import { isFlowOwnedChoiceFeature } from '../levelUp';
import type { FeatureClassContext, GainedFeature } from '../aiActions/featureEffectsAction';
import type { SummaryFeature } from '../aiActions/fieldSummaryAction';
import type { EffectFeature } from '../aiActions/levelUpEffectsAction';
import { CASTER_ABILITY_DE, CASTER_ABILITY_KEY } from '../spellcasting';

/** Die Grundwahl, aus der die Aufbereitung entsteht (strukturell = die Felder des Wizards). */
export interface FeatureBasics {
  species: { sourceKey: string; name: string };
  klass: { sourceKey: string; name: string; subclassKey?: string; subclassName?: string };
  background: { sourceKey: string; name: string };
}

/** Was `buildFeaturePrep` einmalig aufbereitet (von allen Merkmals-Jobs geteilt). */
export interface FeaturePrep {
  /** Klassen-/Subklassen-/Talent-Merkmale — Eingang für Merkmals-Analyse UND Klassentext. */
  gained: GainedFeature[];
  /** Speziesmerkmale als Analyse-Eingang: erzwungene Wahlen (Drakonische Urahnen,
   *  Elfenlinie …) stecken hier, nicht in `gained` (das wäre sonst im Klassentext). */
  speciesFeatures: GainedFeature[];
  /** Kompletter Merkmalsbestand für die fortlaufenden Effekte (TP/Stufe). */
  effectFeatures: EffectFeature[];
  summaryClass: SummaryFeature[];
  summarySpecies: SummaryFeature[];
  classContext: FeatureClassContext;
}

/**
 * Spezialisierung, die der HINTERGRUND seinem Herkunftstalent mitgibt — „Eingeweihter der
 * Magie (Magier)" → „Magier". Nur der Hintergrund legt sie fest: im Talent-Wörterbuch steht
 * die generische Fassung („Cleric, Druid, or Wizard"), die KI müsste die Liste also raten.
 * Leer bei allen Talenten ohne Klammer-Zusatz (Zäh, Wachsam, Geschult …).
 */
function featSpecialisation(bg: Background | null): string {
  const benefit = bg?.benefits.find((b) => b.type === 'feat');
  const raw = benefit?.descDe || benefit?.desc || '';
  return raw.match(/\(([^)]+)\)/)?.[1]?.trim() ?? '';
}

export async function buildFeaturePrep(basics: FeatureBasics): Promise<FeaturePrep> {
  const { species, klass, background } = basics;
  const [prog, sub, spec, bg, feats] = await Promise.all([
    getProgressionByKey(klass.sourceKey),
    klass.subclassKey ? getProgressionByKey(klass.subclassKey) : Promise.resolve(null),
    getSpeciesByKey(species.sourceKey),
    getBackgroundByKey(background.sourceKey),
    getFeats(),
  ]);

  const level1 = (p: ClassProgression | null, source: 'class' | 'subclass'): GainedFeature[] =>
    p
      ? featuresUpTo(p, 1)
          .filter((f) => !isFlowOwnedChoiceFeature(f))
          .map((f) => ({ name: f.nameDe || f.name, desc: f.desc, descDe: f.descDe, source, gainedAt: 1, key: f.key }))
      : [];

  const gained: GainedFeature[] = [...level1(prog, 'class'), ...level1(sub, 'subclass')];

  // Herkunftstalent als eigenes Merkmal (steht nicht in features[], kommt aus dem Hintergrund).
  if (bg?.featKey) {
    const feat = feats.find((f) => f.sourceKey === bg.featKey);
    // `desc` bleibt der ENGLISCHE Regeltext (so liest der Prompt das Feld), `descDe` die
    // Übersetzung — Talente ohne die eine Sprache fallen auf die andere zurück.
    if (feat) {
      gained.push({
        name: featDisplayName(feat),
        desc: feat.desc || featDesc(feat),
        descDe: featDesc(feat),
        source: 'feat',
        gainedAt: 1,
        key: bg.featKey,
        choice: featSpecialisation(bg) || undefined,
      });
    }
  }

  const toSummary = (g: GainedFeature): SummaryFeature => ({
    name: g.name,
    desc: g.descDe || g.desc,
    source: g.source === 'subclass' ? 'class' : g.source,
    group: g.source === 'feat' ? background.name : klass.name,
    gainedAt: g.gainedAt,
    choice: g.choice,
  });

  const summaryClass = gained.map(toSummary);
  const traits = spec?.traits ?? [];
  const summarySpecies: SummaryFeature[] = traits.map((t) => ({
    name: t.nameDe || t.name,
    desc: t.descDe || t.desc,
    source: 'species',
    group: species.name,
  }));

  // Speziesmerkmale als Analyse-Eingang: nur so erkennt die KI erzwungene Volks-Wahlen
  // (Drakonische Urahnen, Elfenlinie …). desc = EN-Regeltext (maßgeblich), descDe = DE.
  const speciesFeatures: GainedFeature[] = traits.map((t) => ({
    name: t.nameDe || t.name,
    desc: t.desc,
    descDe: t.descDe,
    source: 'species',
    gainedAt: 1,
    key: t.key,
  }));

  // Voller Merkmalsbestand für die fortlaufenden TP-Effekte (Zäh, Zwergische Zähigkeit).
  const effectFeatures: EffectFeature[] = [...gained, ...speciesFeatures].map((f) => ({
    key: f.key ?? '',
    name: f.name,
    desc: f.descDe || f.desc,
  }));

  const slug = klass.sourceKey.split('_').pop() ?? '';
  const classContext: FeatureClassContext = {
    klasseName: klass.name,
    subclassName: klass.subclassName ?? '',
    casterType: prog?.casterType ?? 'NONE',
    casterKind: (prog?.casterType ?? 'NONE') === 'NONE' ? 'none' : 'prepared',
    spellcastingAbility: CASTER_ABILITY_DE[CASTER_ABILITY_KEY[slug]] ?? '',
    toLevel: 1,
  };

  return { gained, speciesFeatures, effectFeatures, summaryClass, summarySpecies, classContext };
}
