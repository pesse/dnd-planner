/**
 * Die Arbeitsschritte eines Aufstiegs — deterministische Auswertung der Deklarationen und
 * ihre Projektionen. Sie schreiben in den Lauf-Zustand, angetrieben von `run.svelte.ts`.
 */
import type { GainedFeature } from '../analysis/types';
import { hpPerLevelSources as computeHpPerLevel, hpPerLevelSum, type PerLevelFeature } from '../perLevelEffects';
import {
  declaredSpeciesFeatures, resolveSpeciesTraits, resolveClassFeatures, resolveFeatLinks,
} from '../characterFeatures';
import { validateRiderSpells, resolveDeclaredSpells, resolveSpellNames } from './spells';
import { featToGainedFeature } from './features';
import { buildDecisions } from './questions';
import { featureChoiceChanges } from './changes';
import { featUnlocks } from './featUnlocks';
import { fightingStyleOptions } from '../fightingStyle';
import { featInstances } from '../declaration/featInstances';
import { featuresUpTo, getProgressionByKey } from '../classProgression';
import { levelUpPools } from './pools';
import { getItemsByDir } from '../../itemLibrary';
import { sheetNoteLines, fallbackSheetNotes } from './sheetNotes';
import { expertiseRiders } from '../declaration/expertise';
import { skillProficiencyRiders } from '../declaration/skillProficiency';
import { languageRiders } from '../declaration/languages';
import { toolProficiencyRiders } from '../declaration/toolProficiency';
import { abilityIncreaseRiders } from '../declaration/abilityIncrease';
import {
  optionListNoteLines, optionListRiders, optionSpellNames, unredactedChoiceFeatures,
  withoutDeclaredChoiceFeatures,
} from '../declaration/optionList';
import { declaredGrantRiders } from '../declaration/grants';
import { declarationGapLines, type GapCandidate } from '../declarationGap';
import { spellAccessNoteLines, withoutSpellAccessFeatures } from '../spellcasting/access';
import type { FeatureRider, LevelUpQuestion } from '../../schemas/levelUp';
import { spellInfoByKey, type SpellInfo } from '../../spellLibrary';
import { totalLevel } from '../../schemas/classLevelText';
import type { Character } from '../../schemas/characterSchema';
import type { LevelUpChoices } from './choices.svelte';
import type { LevelUpRunState } from './runState';

export interface RunStepsDeps {
  st: LevelUpRunState;
  choices: LevelUpChoices;
  character: Character;
  /** Meldet eine Aktivität ins Schritt-Log und stupst die Uhr an. */
  pushStep: (text: string) => void;
  ensureSpellLib: () => Promise<SpellInfo[]>;
}

export function createRunSteps(ctx: RunStepsDeps) {
  const { st, choices, pushStep, ensureSpellLib } = ctx;

  /** `spell.key` → Bibliotheks-Eintrag; erst nach `ensureSpellLib()` sinnvoll befüllt. */
  const spellOf = (key: string) => spellInfoByKey(st.spellLib, key);

  function maxSpellLevel(): number {
    let m = 0;
    for (let i = 0; i < 9; i++) {
      const total = (ctx.character.spells?.slots?.[i]?.total ?? 0) + (st.delta?.spellSlotDelta?.[i] ?? 0);
      if (total > 0) m = i + 1;
    }
    return m;
  }

  /** Die Charakterstufe NACH diesem Aufstieg — nicht die Klassenstufe (`delta.toLevel`). */
  const newCharLevel = (): number => totalLevel(ctx.character.classes) + (st.delta!.toLevel - st.delta!.fromLevel);

  /** Die am Charakter GESPEICHERTE Antwort eines Merkmals, englisch kanonisch. */
  const storedChoiceOf = (f: { key?: string }): string =>
    st.pastChoices.find((p) => p.featureKey === f.key)?.choice ?? '';

  function initAnswers(questions: LevelUpQuestion[]) {
    // Bestehende Antworten ERHALTEN; nur für neue Fragen Defaults setzen.
    const a: Record<string, string | string[]> = { ...st.answers };
    for (const q of questions) {
      if (q.id in a) continue;
      if (q.type === 'multiselect' || q.type === 'spell-picker') a[q.id] = [];
      else if (q.type === 'choice') a[q.id] = q.defaultValue || q.options[0]?.value || '';
      else a[q.id] = q.defaultValue ?? '';
    }
    st.answers = a;
  }
  /**
   * Bewusst LEER vorbelegen statt auf die erste Option: der Spieler soll jede Wahl aktiv
   * treffen, sonst stünde etwa eine folgenreiche Landart stillschweigend fest.
   */
  function initFeatureChoices(questions: LevelUpQuestion[]) {
    const a: Record<string, string | string[]> = { ...st.answers };
    for (const q of questions) {
      if (q.id in a) continue;
      a[q.id] = q.type === 'multiselect' || q.type === 'spell-picker' ? [] : '';
    }
    st.answers = a;
  }

  function featuresFor(kind: 'base' | 'feat'): GainedFeature[] {
    return kind === 'base'
      ? st.gainedFeatures
      : withoutDeclaredChoiceFeatures(
          withoutSpellAccessFeatures(st.chosenFeats.map((f) => featToGainedFeature(f, st.delta!.toLevel)), st.featAccess),
        );
  }

  /**
   * Die deklarierten Wahlen der Basis-Merkmale leer vorbelegen und die Options-Pools lesen —
   * der Checkpoint folgt und zeigt beides. Die Pools hängen an der Subklasse, also erst hier:
   * eine JETZT gewählte steht davor noch nicht am Charakter.
   */
  async function runDeclaredChoices() {
    // VOR `initFeatureChoices`: die Werkzeug-Wahl ist mit Optionen ein `multiselect` und ohne
    // ein Freitext — die Vorbelegung unterscheidet [] von ''.
    if (!st.toolLib.length) st.toolLib = await getItemsByDir('tools').catch(() => []);
    const declaredQs = [
      ...choices.baseOptionChoices, ...choices.baseExpertiseChoices, ...choices.baseSkillProfChoices,
      ...choices.baseLanguageChoices, ...choices.baseToolChoices, ...choices.baseAbilityChoices,
      ...choices.baseAccessChoices,
    ];
    initFeatureChoices(declaredQs);
    pushStep(declaredQs.length
      ? `${declaredQs.length} Wahl(en) aus der Bibliothek gelesen.`
      : 'Keine Wahl nötig.');

    const d = st.delta!;
    st.optionPicks = [...(ctx.character.optionPicks ?? [])];
    st.optionPools = await levelUpPools(
      {
        sourceKey: d.sourceKey,
        subclassKey: st.chosenSubclass?.key || d.subclassKey,
        name: d.klasseName,
      },
      st.optionPicks,
      d.fromLevel,
      d.toLevel,
    ).catch(() => []);
    if (st.optionPools.length)
      pushStep(`${st.optionPools.length} Options-Pool/Pools zur Auswahl (Kontingent aus der Stufentabelle).`);
  }

  /**
   * Nach den Merkmals-Wahlen und Pool-Wahlen: erst mit deren Antworten steht fest, welche
   * bedingte Talentwahl greift. Gezählt über ALLE Merkmale bis zur Zielstufe, nicht nur die
   * neuen — eine Pool-Wahl schaltet die Wahl eines längst vorhandenen Merkmals frei.
   */
  async function runFeatUnlocks() {
    const d = st.delta!;
    const subKey = st.chosenSubclass?.key || d.subclassKey;
    const [prog, sub] = await Promise.all([
      getProgressionByKey(d.sourceKey),
      subKey ? getProgressionByKey(subKey) : Promise.resolve(null),
    ]);
    const features = [...(prog ? featuresUpTo(prog, d.toLevel) : []), ...(sub ? featuresUpTo(sub, d.toLevel) : [])];
    const ledger = ctx.character.features ?? [];
    // Die Antworten DIESES Laufs zuerst: `pickAnswer` nimmt die erste passende.
    const answered = featureChoiceChanges(choices.baseChoiceQs, st.answers, new Map(), d.toLevel, 'assemble-decisions')
      .flatMap((c) => (c.target === 'featureChoice' ? [{ sourceKey: c.sourceKey, choice: c.choice }] : []));
    const unlocks = featUnlocks(
      features,
      d,
      { ledger, picks: ctx.character.optionPicks ?? [] },
      { ledger: [...answered, ...ledger], picks: st.optionPicks },
    );
    st.featSlots = unlocks.conditional;
    st.ownedFeats = (await featInstances(ctx.character.features, ctx.character.backgroundRef)).map((i) => i.featureKey);
    st.chosenStyles = [];
    st.styleSwaps = [];
    st.styleOffer = null;
    if (!unlocks.fightingStyle && !unlocks.styleSwaps) return;
    const all = await fightingStyleOptions();
    const owned = all.filter((o) => st.ownedFeats.includes(o.sourceKey));
    st.styleOffer = {
      allowance: unlocks.fightingStyle,
      swaps: owned.length ? unlocks.styleSwaps : 0,
      options: all,
      owned,
    };
    if (st.styleOffer.allowance || st.styleOffer.swaps)
      pushStep(`Kampfstil: ${st.styleOffer.allowance} neu, ${st.styleOffer.swaps} tauschbar.`);
  }

  /**
   * Die Rider einer Seite: rein aus den Deklarationen der Bibliothek und den Antworten
   * darauf. `declaredGrantRiders` steht getrennt neben den Wahl-Ridern, weil die Rider einer
   * Zweigwahl die Grants der GEWÄHLTEN OPTION tragen und das unbedingte `grants` des
   * Merkmals nicht ersetzen dürfen.
   */
  async function runRiders(kind: 'base' | 'feat', alive: () => boolean) {
    await ensureSpellLib();
    if (!alive()) return;
    const grantSources = kind === 'base' ? choices.baseDeclared : choices.featDeclared;
    // Die Stufe einer Options-Zauberliste: am Klassenmerkmal die KLASSEN-, am Talent die
    // CHARAKTERstufe (`declaredSpellGrants` liest dieselbe Unterscheidung).
    const optionLevel = kind === 'base' ? st.delta!.toLevel : newCharLevel();
    const answerOf = (id: string) => choices.optionAnswer(id);
    const riders: FeatureRider[] = [
      ...declaredGrantRiders(grantSources),
      ...optionListRiders(grantSources, answerOf, optionLevel),
      ...expertiseRiders(grantSources, answerOf),
      ...skillProficiencyRiders(grantSources, answerOf),
      ...languageRiders(grantSources, answerOf),
      ...toolProficiencyRiders(grantSources, answerOf),
      ...abilityIncreaseRiders(grantSources, answerOf),
    ];
    const validated = validateRiderSpells(riders, st.spellLib, st.delta!.klasseName);
    if (validated.flagged.length) st.flagged = [...new Set([...st.flagged, ...validated.flagged])];
    reportGaps(grantSources, unredactedOf(grantSources));
    if (kind === 'base') {
      st.validatedBase = validated;
      st.riders = validated.riders;
      st.decisions = buildDecisions(st.delta!, st.riders, { maxSpellLevel: maxSpellLevel(), klasseName: st.delta!.klasseName });
      initAnswers(st.decisions);
      pushStep(st.decisions.length ? `${st.decisions.length} Entscheidung(en) vorbereitet.` : 'Keine offenen Entscheidungen.');
    } else {
      st.validatedFeats = validated;
      st.featRiders = validated.riders;
    }
  }

  /** Merkmale, deren gewählter Zweig nichts deklariert — Wahl getroffen, Wirkung offen. */
  const unredactedOf = (declared: typeof choices.baseDeclared) =>
    unredactedChoiceFeatures(declared, (id) => choices.optionAnswer(id))
      .map((f) => ({ ...f, desc: f.desc ?? '', gainedAt: st.delta!.toLevel }));

  /**
   * Der Preis des Schnitts: eine undeklarierte Wahl fängt niemand mehr auf. Ins Schritt-Log
   * UND (über `seedFeaturesText`) ins Klassenmerkmale-Feld, damit die Lücke den Lauf überlebt.
   */
  function reportGaps(features: readonly GapCandidate[], unredacted: readonly { name: string; nameDe?: string }[]) {
    const lines = declarationGapLines(features, unredacted).filter((l) => !st.gaps.includes(l));
    if (!lines.length) return;
    st.gaps = [...st.gaps, ...lines];
    for (const l of lines) pushStep(l);
  }

  /** Je Merkmal eine Bogenzeile, rein aus der Bibliothek. */
  function runNotes() {
    // Merkmale, deren gewählter Zweig nichts deklariert, kommen hier dazu: mechanisch ist
    // nichts von ihnen zu holen, ihre Prosa braucht trotzdem eine Zeile.
    const features = [
      ...featuresFor('base'), ...unredactedOf(choices.baseDeclared),
      ...featuresFor('feat'), ...unredactedOf(choices.featDeclared),
    ];
    st.notes = fallbackSheetNotes(features);
    st.summaryLine = summaryLine();
  }

  function summaryLine(): string {
    const names = [...st.gainedFeatures.map((f) => f.nameDe || f.name), ...st.chosenFeats.map((f) => f.nameDe)];
    const sub = st.chosenSubclass ? ` · Subklasse: ${st.chosenSubclass.name}` : '';
    return `${st.delta!.klasseName} Stufe ${st.delta!.fromLevel} → ${st.delta!.toLevel}${sub}${names.length ? ` · ${names.join(', ')}` : ''}`;
  }

  const seedFeaturesText = () =>
    [
      ctx.character.classFeatures,
      ...sheetNoteLines(st.notes),
      ...optionListNoteLines(choices.declaredOptionFeatures, (id) => choices.optionAnswer(id)),
      ...spellAccessNoteLines(choices.baseAccess, st.answers),
      ...spellAccessNoteLines(st.featAccess, st.answers),
      ...st.gaps,
    ]
      .filter((s) => s?.trim())
      .join('\n');

  /**
   * Eigener Aufruf neben `declaredSpells`, weil `declaredSpellGrants` genau EINE Stufe filtert:
   * am Klassenmerkmal die Klassen-, am Trait oder Talent die CHARAKTERstufe (die
   * Elfenlinien-Tabelle 1/3/5 hängt daran). Idempotent, `applyChanges` dedupliziert.
   */
  async function resolveCharLevelSpells() {
    const charLevel = newCharLevel();
    const species = await declaredSpeciesFeatures(ctx.character.species);
    const sources = [...species, ...choices.featDeclared];
    const lib = await ensureSpellLib();
    // Dazu die Zeilen einer bei der ERSCHAFFUNG getroffenen Zweigwahl (Elfenabstammung 3/5):
    // die Wahl wird nicht erneut gestellt, ihre Antwort steht am Charakter.
    st.charLevelSpells = resolveSpellNames(
      optionSpellNames(species, storedChoiceOf, charLevel),
      lib,
      st.delta!.klasseName,
      resolveDeclaredSpells(sources, charLevel, lib, st.delta!.klasseName),
    );
    if (st.charLevelSpells.flagged.length) st.flagged = [...new Set([...st.flagged, ...st.charLevelSpells.flagged])];
  }

  // Über den GESAMTEN Merkmalsbestand, nicht nur den neuen: `grants.perLevel` wirkt
  // rückwirkend auf alle Stufen. Die Dedup liegt im Service, damit Wizard und Aufstieg
  // dieselbe Regel benutzen.
  async function detectHpPerLevel(alive: () => boolean) {
    st.hpPerLevelSources = [];
    try {
      const groups = [
        ...((await resolveSpeciesTraits(ctx.character.species)) ?? []),
        ...(await resolveClassFeatures(ctx.character.classes)),
      ];
      // Nur die Talent-Links: Wahl-Annotationen bringen keinen eigenen Merkmalstext mit,
      // ihr Merkmal steckt schon in `groups`.
      const featLinks = await resolveFeatLinks((ctx.character.features ?? []).filter((f) => !f.choice?.trim()));
      const features: PerLevelFeature[] = [
        ...groups.flatMap((g) => g.features),
        ...featLinks,
        ...st.gainedFeatures,
        ...st.chosenFeats,
      ].map((f) => ({ key: f.key ?? '', name: f.name, grants: f.grants }));
      if (!alive()) return;
      st.hpPerLevelSources = computeHpPerLevel(features);
      const perLevelSum = hpPerLevelSum(st.hpPerLevelSources);
      if (perLevelSum > 0)
        pushStep(`Fortlaufende TP: +${perLevelSum}/Stufe (${st.hpPerLevelSources.map((s) => s.feature).join(', ')}).`);
    } catch {
      st.hpPerLevelSources = [];
    }
  }

  function gatherLearned(): { key: string; name: string; level: number }[] {
    const q = st.decisions.find((d) => d.id === 'learned_spells');
    if (!q) return [];
    return ((st.answers['learned_spells'] as string[]) ?? [])
      .map((key) => { const info = spellOf(key); return info ? { key, name: info.name, level: info.level } : null; })
      .filter((x): x is { key: string; name: string; level: number } => !!x);
  }
  function gatherCantrips(): { key: string; name: string }[] {
    return ((st.answers['cantrips'] as string[]) ?? [])
      .map((key) => { const info = spellOf(key); return info ? { key, name: info.name } : null; })
      .filter((x): x is { key: string; name: string } => !!x);
  }

  return {
    initAnswers, initFeatureChoices,
    runDeclaredChoices, runFeatUnlocks, runRiders, runNotes,
    seedFeaturesText,
    resolveCharLevelSpells, detectHpPerLevel,
    gatherLearned, gatherCantrips, spellOf,
  };
}

export type LevelUpSteps = ReturnType<typeof createRunSteps>;
