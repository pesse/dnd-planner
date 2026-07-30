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
import { spellAccessGrantOf, withoutSpellAccessFeatures, type SpellAccessGrant } from '../spellAccess';
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
  /** Klassen-/Subklassen-/Talent-Merkmale — Grundlage für Analyse UND Klassentext. */
  gained: GainedFeature[];
  /**
   * Eingang der KI-Analyse: `gained` OHNE die Merkmale, deren Wahl der Flow deterministisch
   * führt (deklarierter Zauber-Zugang, siehe `spellAccess`). Getrennt von `gained`, weil der
   * deutsche Merkmalstext sie weiter braucht — er entsteht aus `descDe`, nicht aus der Deutung.
   */
  analysisGained: GainedFeature[];
  /** Deklarierte Zauber-Zugänge („Magiekundiger") — deterministisch, ohne KI. */
  spellAccess: SpellAccessGrant[];
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
 * Spezialisierung, die der HINTERGRUND seinem Herkunftstalent mitgibt — „Magic Initiate
 * (Wizard)" → „Wizard". Nur der Hintergrund legt sie fest: im Talent-Wörterbuch steht
 * die generische Fassung („Cleric, Druid, or Wizard"), die KI müsste die Liste also raten.
 * Leer bei allen Talenten ohne Klammer-Zusatz (Zäh, Wachsam, Geschult …).
 *
 * ENGLISCH zuerst: der Wert landet im Analyse-Prompt und treibt dort `spellClass`. Das
 * deutsche „Magier" wäre genau die Zauberer/Magier-Kollision, die CLASS_MAP schon einmal
 * verdreht hat.
 */
function featSpecialisation(bg: Background | null): string {
  const benefit = bg?.benefits.find((b) => b.type === 'feat');
  const raw = benefit?.desc || benefit?.descDe || '';
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

  // EINE Aufbereitung, englisch geführt: `name`/`desc` sind die kanonischen Felder (so
  // liest sie jeder Deutungs-Call), `nameDe`/`descDe` reisen als Quelle der beiden
  // Übersetzungs-Calls mit. Fehlt eine Sprachfassung, fällt sie auf die andere zurück.
  const level1 = (p: ClassProgression | null, source: 'class' | 'subclass'): GainedFeature[] =>
    p
      ? featuresUpTo(p, 1)
          .filter((f) => !isFlowOwnedChoiceFeature(f))
          .map((f) => ({ name: f.name || f.nameDe || '', nameDe: f.nameDe || f.name, desc: f.desc || f.descDe || '', descDe: f.descDe, source, gainedAt: 1, key: f.key }))
      : [];

  const gained: GainedFeature[] = [...level1(prog, 'class'), ...level1(sub, 'subclass')];
  const spellAccess: SpellAccessGrant[] = [];

  // Herkunftstalent als eigenes Merkmal (steht nicht in features[], kommt aus dem Hintergrund).
  if (bg?.featKey) {
    const feat = feats.find((f) => f.sourceKey === bg.featKey);
    if (feat) {
      const specialisation = featSpecialisation(bg);
      gained.push({
        name: feat.name || featDisplayName(feat),
        nameDe: featDisplayName(feat),
        desc: feat.desc || featDesc(feat),
        descDe: feat.descDe,
        source: 'feat',
        gainedAt: 1,
        key: bg.featKey,
        choice: specialisation || undefined,
      });
      const access = spellAccessGrantOf(
        { key: bg.featKey, name: feat.name || featDisplayName(feat), nameDe: featDisplayName(feat), grantsChoice: feat.grantsChoice },
        specialisation,
      );
      if (access) spellAccess.push(access);
    }
  }

  // Was der Flow selbst abfragt, sieht die KI nicht: sonst erfindet sie eine zweite,
  // konkurrierende Wahl (und beim Zauber-Kontingent eine falsche Anzahl).
  const analysisGained = withoutSpellAccessFeatures(gained, spellAccess);

  const toSummary = (g: GainedFeature): SummaryFeature => ({
    name: g.name,
    nameDe: g.nameDe,
    desc: g.desc,
    source: g.source === 'subclass' ? 'class' : g.source,
    group: g.source === 'feat' ? background.name : klass.name,
    gainedAt: g.gainedAt,
    choice: g.choice,
  });

  const traits = spec?.traits ?? [];

  // Speziesmerkmale als Analyse-Eingang: nur so erkennt die KI erzwungene Volks-Wahlen
  // (Drakonische Urahnen, Elfenlinie …).
  const speciesFeatures: GainedFeature[] = traits.map((t) => ({
    name: t.name || t.nameDe || '',
    nameDe: t.nameDe || t.name,
    desc: t.desc || t.descDe || '',
    descDe: t.descDe,
    source: 'species',
    gainedAt: 1,
    key: t.key,
  }));

  const summaryClass = gained.map(toSummary);
  const summarySpecies: SummaryFeature[] = speciesFeatures.map((f) => ({
    name: f.name,
    nameDe: f.nameDe,
    desc: f.desc,
    source: 'species',
    group: species.name,
  }));

  // Voller Merkmalsbestand für die fortlaufenden TP-Effekte (Zäh, Zwergische Zähigkeit).
  const effectFeatures: EffectFeature[] = [...gained, ...speciesFeatures].map((f) => ({
    key: f.key ?? '',
    name: f.name,
    desc: f.desc,
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

  return {
    gained,
    analysisGained,
    spellAccess,
    speciesFeatures,
    effectFeatures,
    summaryClass,
    summarySpecies,
    classContext,
  };
}
