/**
 * Eval-Case: featureEffects für Druide 2→3 / Zirkel des Landes.
 *
 * Zwei Steps (= die beiden E-Loop-Durchläufe der echten Maschine):
 *   Pass 1 — ohne aufgelöste Wahl: erwartet genau EINE Landart-Auswahl mit
 *            resolvesEffects=true und (noch) keine grantedSpells auf diesem Rider.
 *   Pass 2 — mit aufgelöster Landart: erwartet konkrete Kreissprüche als
 *            grantedSpells und keine offene (resolvesEffects=true) Landart-Wahl mehr.
 */
import type { FeatureEffects } from '../../src/lib/schemas/levelUp';
import { buildFeatureEffectsInput } from '../../src/lib/services/aiActions/featureEffectsAction';
import type { Assertion, EvalStep } from '../harness';
import {
  druidSummary,
  druidClassContext,
  circleOfLandFeatures,
  EXPECTED_LAND_TYPES,
  EXPECTED_CIRCLE_SPELLS,
  RESOLVED_LAND,
} from '../fixtures/druid-l3-circle-of-land';

type Rider = FeatureEffects['riders'][number];
type Choice = Rider['choicePrompts'][number];

interface LandChoice {
  rider: Rider;
  prompt: Choice;
}

function allChoicePrompts(fe: FeatureEffects): { rider: Rider; prompt: Choice }[] {
  return fe.riders.flatMap((r) => r.choicePrompts.map((prompt) => ({ rider: r, prompt })));
}

function choiceText(p: Choice): string {
  return [p.prompt, p.help, ...(p.options ?? []).map((o) => `${o.value} ${o.label}`)]
    .join(' ')
    .toLowerCase();
}

function referencesLand(p: Choice): boolean {
  return /land|gelände|terrain/i.test(choiceText(p));
}

/** Offene (konsequenzbehaftete) Landart-Auswahlen. */
function openLandChoices(fe: FeatureEffects): LandChoice[] {
  return allChoicePrompts(fe).filter((x) => x.prompt.resolvesEffects === true && referencesLand(x.prompt));
}

function grantedSpellsLower(fe: FeatureEffects): Set<string> {
  return new Set(fe.riders.flatMap((r) => r.grantedSpells).map((s) => s.toLowerCase().trim()));
}

// ── Pass 1: ohne aufgelöste Wahl ────────────────────────────────────────────────

const pass1Assertions: Assertion<FeatureEffects>[] = [
  {
    id: 'has-riders',
    label: 'liefert mindestens einen Rider',
    core: true,
    check: (fe) => fe.riders.length > 0,
  },
  {
    id: 'has-subclass-rider',
    label: 'Rider aus Subklasse vorhanden',
    core: true,
    check: (fe) => fe.riders.some((r) => r.source === 'subclass'),
  },
  {
    id: 'one-open-land-choice',
    label: 'genau EINE offene Landart-Auswahl (resolvesEffects=true)',
    core: true,
    check: (fe) => openLandChoices(fe).length === 1,
  },
  {
    id: 'land-choice-has-options',
    label: 'Landart-Auswahl hat ≥3 Optionen',
    core: true,
    check: (fe) => (openLandChoices(fe)[0]?.prompt.options?.length ?? 0) >= 3,
  },
  {
    id: 'no-spells-before-choice',
    label: 'noch keine grantedSpells vor der Wahl',
    core: true,
    check: (fe) => {
      const lc = openLandChoices(fe)[0];
      return !!lc && lc.rider.grantedSpells.length === 0;
    },
  },
  {
    id: 'options-cover-expected',
    label: 'Optionen decken erwartete Landarten ab (weich)',
    core: false,
    check: (fe) => {
      const lc = openLandChoices(fe)[0];
      if (!lc) return false;
      const opts = lc.prompt.options.map((o) => `${o.value} ${o.label}`.toLowerCase());
      const hits = EXPECTED_LAND_TYPES.filter((exp) => opts.some((o) => o.includes(exp.toLowerCase())));
      return hits.length >= 2;
    },
  },
];

// ── Pass 2: Landart aufgelöst ────────────────────────────────────────────────────

const pass2Assertions: Assertion<FeatureEffects>[] = [
  {
    id: 'grants-spells',
    label: 'gewährt Kreissprüche (grantedSpells nicht leer)',
    core: true,
    check: (fe) => fe.riders.some((r) => r.grantedSpells.length > 0),
  },
  {
    id: 'no-open-land-choice',
    label: 'keine offene Landart-Wahl mehr (resolvesEffects=false)',
    core: true,
    check: (fe) => openLandChoices(fe).length === 0,
  },
];

if (EXPECTED_CIRCLE_SPELLS.length > 0) {
  pass2Assertions.push({
    id: 'spells-match-expected',
    label: 'gewährte Kreissprüche enthalten die Referenzliste (weich)',
    core: false,
    check: (fe) => {
      const got = grantedSpellsLower(fe);
      return EXPECTED_CIRCLE_SPELLS.every((s) => got.has(s.toLowerCase().trim()));
    },
  });
}

export function buildDruidCircleSteps(): EvalStep<FeatureEffects>[] {
  const pass1Input = buildFeatureEffectsInput({
    summary: druidSummary,
    classContext: druidClassContext,
    features: circleOfLandFeatures,
  });

  const pass2Input = buildFeatureEffectsInput({
    summary: druidSummary,
    classContext: druidClassContext,
    features: circleOfLandFeatures,
    resolvedChoices: [
      { feature: 'Zirkel des Landes', prompt: 'Wähle deine Landart', choice: RESOLVED_LAND },
    ],
  });

  return [
    { label: 'Pass 1 — Landart-Auswahl erwartet', input: pass1Input, assertions: pass1Assertions },
    { label: `Pass 2 — Landart "${RESOLVED_LAND}" aufgelöst`, input: pass2Input, assertions: pass2Assertions },
  ];
}
