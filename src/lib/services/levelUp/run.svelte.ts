/**
 * Der Lauf des Stufenaufstiegs: der Zustand, den die Schritte füllen, und die Schritte
 * selbst. Die Übergänge kommen aus `advance()` (steps.ts), das Dokument ist eine reine
 * Projektion des Zustands (`buildDoc`) — deterministische Schritte brauchen keine Aktion.
 */
import { mod } from '../../domain/skills';
import { computeLevelUpDelta, type LevelUpDelta } from '../levelUp';
import { resolvePastChoices } from '../characterFeatures';
import { type StepId, type AdvanceCtx, isCheckpoint, advance } from './steps';
import { resolveDeclaredSpells, noDeclaredSpells, learnInfo } from './spells';
import { gainedFeaturesFor, computeSubclassFeatures } from './features';
import { countFeatsToPick } from './questions';
import { buildDoc } from './doc';
import { createLevelUpChoices } from './choices.svelte';
import { createRunSteps } from './runSteps';
import { emptyRiders, emptyRunState, type LevelUpRunState } from './runState';
import { withoutSpellGrantFeatures } from '../grantedSpells';
import { withoutDeclaredChoiceFeatures } from '../declaration/optionList';
import { spellAccessGrantOf, type SpellAccessGrant } from '../spellAccess';
import type { LevelUpDoc } from '../../schemas/levelUp';
import { getSpellLibrary } from '../../spellLibrary';
import { getFeats } from '../../featsLibrary';
import { createRunClock } from '../../utils/runClock.svelte';
import type { Character } from '../../schemas/characterSchema';

export function createLevelUpRun(ctx: { character: Character }) {
  const st = $state<LevelUpRunState>(emptyRunState());
  $effect(() => { resolvePastChoices(ctx.character).then((p) => { st.pastChoices = p; }); });

  const choices = createLevelUpChoices({
    get delta() { return st.delta; },
    get subFeatures() { return st.subFeatures; },
    get chosenFeats() { return st.chosenFeats; },
    get baseAnalysisChoices() { return st.baseAnalysis?.choices ?? []; },
    get featAnalysisChoices() { return st.featAnalysis?.choices ?? []; },
    get baseChoices() { return st.baseChoices; },
    get featChoices() { return st.featChoices; },
    get featAccess() { return st.featAccess; },
    get answers() { return st.answers; },
    get skills() { return ctx.character.skills; },
  });

  const clock = createRunClock(() => st.running);
  let abort: AbortController | null = null;
  let userAborted = false;
  let runToken = 0;

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const runOpts = () => ({ onActivity: () => clock.touch(), signal: abort!.signal });
  const pushStep = (text: string) => { st.steps = [...st.steps, text]; clock.touch(); };

  /** Angekündigte Zauberliste, die der Parser nicht lesen konnte — sonst fiele sie stumm zur KI. */
  const reportUnreadableGrants = () => {
    for (const name of st.declaredSpells.unreadable)
      pushStep(`„${name}" kündigt eine Zauberliste an, die nicht als Tabelle lesbar ist — Zauber nicht automatisch übernommen.`);
  };

  async function ensureSpellLib() {
    if (!st.spellLib.length) st.spellLib = await getSpellLibrary();
    return st.spellLib;
  }

  const steps = createRunSteps({
    st, choices, pushStep, runOpts, ensureSpellLib,
    get character() { return ctx.character; },
  });

  function summarizeDelta(d: LevelUpDelta): string {
    if (d.isHomebrew) return `${d.klasseName || 'Klasse'} ${d.fromLevel} → ${d.toLevel} · Homebrew (KI fragt alles ab)`;
    const parts = [`${d.klasseName || 'Klasse'} ${d.fromLevel} → ${d.toLevel}`];
    if (d.profBonusTo !== d.profBonusFrom) parts.push(`Übungsbonus +${d.profBonusFrom}→+${d.profBonusTo}`);
    const slotGain = d.spellSlotDelta.reduce((a, b) => a + b, 0);
    if (slotGain > 0) parts.push(`+${slotGain} Zauberplatz${slotGain > 1 ? 'e' : ''}`);
    if (d.cantripDelta > 0) parts.push(`+${d.cantripDelta} Zaubertrick${d.cantripDelta > 1 ? 's' : ''}`);
    if (d.preparedDelta > 0) parts.push(`+${d.preparedDelta} vorbereitbar`);
    const feats = d.featuresGained.length + d.subclassFeaturesGained.length;
    if (feats > 0) parts.push(`${feats} Merkmal${feats > 1 ? 'e' : ''}`);
    return parts.join(' · ');
  }

  /** Kapselt einen (ggf. mehrteiligen) async-Lauf mit Token-Guard, Uhr und Fehler-Rücksprung. */
  async function runSegment(resume: StepId, body: (alive: () => boolean) => Promise<void>) {
    if (st.running) return;
    st.running = true; st.error = ''; userAborted = false; st.resumePhase = resume; st.reachedStep = resume;
    const myToken = ++runToken;
    abort = new AbortController(); clock.start();
    st.phase = 'running';
    try {
      await body(() => myToken === runToken);
    } catch (e) {
      if (myToken === runToken && !userAborted) { st.error = msg(e); st.phase = resume; }
    } finally {
      if (myToken === runToken) { clock.stop(); st.running = false; abort = null; }
    }
  }

  function advCtx(): AdvanceCtx {
    return {
      delta: st.delta!,
      featsToPick: st.delta ? countFeatsToPick(st.delta, st.answers) : 0,
      // Die deklarierten Wahlen zählen mit: sonst überspringt die Maschine den Checkpoint,
      // weil das Merkmal gar nicht mehr bei der KI war, und niemand wählt.
      baseChoices: choices.baseChoiceQs.length,
      featChoices: choices.featChoiceQs.length,
    };
  }

  async function pipelineBody(from: StepId, alive: () => boolean) {
    let step = advance(from, advCtx());
    while (!isCheckpoint(step)) {
      await runStep(step, alive);
      if (!alive()) return;
      st.reachedStep = step; // Schritt fertig → seine Änderungen werden im Dokument sichtbar
      step = advance(step, advCtx());
    }
    onEnterCheckpoint(step);
    st.reachedStep = step;
    st.phase = step;
  }

  async function runStep(step: StepId, alive: () => boolean) {
    switch (step) {
      case 'base-delta':
        st.gainedFeatures = gainedFeaturesFor(st.delta!);
        // Schon bekannte Subklasse: ihre Merkmale stehen bereits im Delta. Wird die Subklasse
        // erst in diesem Aufstieg gewählt, ergänzt `subclass-delta` unten.
        st.declaredSpells = resolveDeclaredSpells(
          [...st.delta!.featuresGained, ...st.delta!.subclassFeaturesGained],
          st.delta!.toLevel,
          await ensureSpellLib(),
          st.delta!.klasseName,
        );
        // Ein Merkmalstext kann einen Zauber nennen, den die Bibliothek nicht führt — dieselbe
        // Warnung wie bei KI-Namen, damit er inline angelegt werden kann statt still zu fehlen.
        if (st.declaredSpells.flagged.length) st.flagged = [...new Set([...st.flagged, ...st.declaredSpells.flagged])];
        reportUnreadableGrants();
        break;
      case 'subclass-delta':
        pushStep(`Subklasse „${st.chosenSubclass?.name}" — Merkmale werden geladen…`);
        st.subFeatures = await computeSubclassFeatures(st.chosenSubclass!.key, st.delta!.fromLevel, st.delta!.toLevel);
        if (!alive()) return;
        // `subFeatures` bleibt vollständig (Info-Einträge), der KI-Eingang nicht — dieselben
        // zwei Filter, die `gainedFeaturesFor` auf die Subklassen-Merkmale des Deltas legt.
        st.gainedFeatures = [
          ...gainedFeaturesFor(st.delta!),
          ...withoutDeclaredChoiceFeatures(withoutSpellGrantFeatures(st.subFeatures)),
        ];
        st.declaredSpells = resolveDeclaredSpells(
          [...st.delta!.featuresGained, ...st.delta!.subclassFeaturesGained, ...st.subFeatures],
          st.delta!.toLevel,
          await ensureSpellLib(),
          st.delta!.klasseName,
        );
        if (st.declaredSpells.flagged.length) st.flagged = [...new Set([...st.flagged, ...st.declaredSpells.flagged])];
        reportUnreadableGrants();
        break;
      case 'feature-analysis':
        await steps.runAnalyze('base', alive);
        break;
      case 'feature-effects':
        await steps.runFinalize('base', alive);
        break;
      case 'feat-analysis':
        await steps.runAnalyze('feat', alive);
        break;
      case 'feat-effects':
        await steps.runFinalize('feat', alive);
        break;
      case 'narrative':
        await steps.runNarrative(alive);
        break;
      case 'ongoing-effects':
        await steps.detectHpPerLevel(alive);
        if (!alive()) return;
        await steps.resolveCharLevelSpells();
        break;
      case 'class-features-merge':
        await steps.mergeClassFeatures(alive);
        break;
      case 'feat-links':
        // Deklarierter Zauber-Zugang der Talente: Liste, Attribut und Kontingent stehen im
        // Vault, also fragt der Flow sie ab statt die KI sie aus der Prosa zu deuten.
        st.featAccess = st.chosenFeats
          .map((f) => spellAccessGrantOf(f))
          .filter((g): g is SpellAccessGrant => g !== null);
        if (st.featAccess.length) {
          steps.initFeatureChoices(choices.featAccessChoices);
          pushStep(`${st.featAccess.length} Zauber-Zugang aus der Bibliothek gelesen (ohne KI).`);
        }
        break;
      // `assemble-decisions` fehlt hier absichtlich: das Dokument leitet diese Änderungen
      // selbst aus dem Zustand ab.
    }
  }

  function onEnterCheckpoint(step: StepId) {
    if (step === 'feat-choice') {
      st.featsToPick = countFeatsToPick(st.delta!, st.answers);
      st.chosenFeats = [];
      getFeats().then((f) => { st.featLib = f; });
    } else if (step === 'class-features' && !st.featuresText.trim()) {
      // Sicherheitsnetz: normalerweise hat `class-features-merge` den Text längst gesetzt.
      st.featuresText = steps.seedFeaturesText();
    }
  }

  // Während eines Laufs der zuletzt ABGESCHLOSSENE Schritt — so erscheinen fertige
  // Teilschritte im Dokument, ohne Vorgriff auf den noch laufenden.
  const viewStep = $derived<StepId>(st.phase === 'running' ? st.reachedStep : st.phase);
  const doc = $derived.by<LevelUpDoc>(() => {
    if (!st.delta) return { fromLevel: 0, toLevel: 0, klasse: '', summary: '', changes: [] };
    return buildDoc({
      delta: st.delta, hitDice: ctx.character.hitDice ?? '',
      chosenSubclass: st.chosenSubclass, subFeatures: st.subFeatures, declaredSpells: st.declaredSpells,
      validatedBase: st.validatedBase, validatedFeats: st.validatedFeats,
      answers: st.answers, konMod: mod(ctx.character.kon),
      pickedCantrips: steps.gatherCantrips(), pickedLearned: steps.gatherLearned(),
      learnAsPrepared: !learnInfo(st.delta, st.riders).spellbook,
      chosenFeats: st.chosenFeats.map((f) => ({ key: f.key, name: f.nameDe, gainedAt: f.gainedAt, grants: f.grants })),
      grantSources: choices.baseDeclared, choiceSources: choices.declaredSources, charLevelSpells: st.charLevelSpells,
      baseChoiceQs: choices.baseChoiceQs, featChoiceQs: choices.featChoiceQs, gainedFeatures: st.gainedFeatures,
      hpPerLevelSources: st.hpPerLevelSources, narrativeSummary: st.narrativeSummary, featuresText: st.featuresText,
      upTo: viewStep,
    });
  });

  return {
    st,
    clock,
    choices,
    get doc() { return doc; },
    ensureSpellLib,

    start(classIndex: number, targetLevel: number, newClass?: { sourceKey: string; name: string }) {
      if (st.running) return;
      st.chosenSubclass = null; st.subFeatures = []; st.gainedFeatures = []; st.riders = []; st.decisions = []; st.answers = {};
      st.declaredSpells = noDeclaredSpells(); st.charLevelSpells = noDeclaredSpells();
      st.baseAnalysis = null; st.baseChoices = []; st.featAnalysis = null; st.featChoices = [];
      st.chosenFeats = []; st.featAccess = []; st.featRiders = []; st.flagged = [];
      st.hpPerLevelSources = []; st.narrativeSummary = ''; st.featuresText = '';
      st.validatedBase = emptyRiders();
      st.validatedFeats = emptyRiders();

      runSegment('choose-class', async (alive) => {
        st.steps = [];
        pushStep('Progression & Aufstiegs-Delta werden berechnet…');
        const d = await computeLevelUpDelta(ctx.character, classIndex, targetLevel, newClass);
        if (!alive()) return;
        st.delta = d;
        if (d.atLevelCap) { st.error = 'Diese Klasse ist bereits auf Stufe 20.'; st.phase = 'choose-class'; return; }
        if (d.isHomebrew) {
          st.error = 'Stufenaufstieg ist nur mit hinterlegter Klassen-Progression möglich — für diese Klasse gibt es keine Progressionsdaten.';
          st.phase = 'choose-class';
          return;
        }
        pushStep(`Delta: ${summarizeDelta(d)}`);
        await pipelineBody('choose-class', alive);
      });
    },

    resume(from: StepId) {
      if (!st.delta) return;
      runSegment(from, (alive) => pipelineBody(from, alive));
    },

    chooseSubclass(key: string, name: string) {
      if (!st.delta) return;
      st.chosenSubclass = { key, name };
      runSegment('subclass-choice', (alive) => pipelineBody('subclass-choice', alive));
    },

    /** Derselbe Merge, aber auf dem handbearbeiteten Textfeld-Stand statt auf der Rohfassung. */
    rework() {
      if (!st.delta) return;
      runSegment('class-features', async (alive) => {
        await steps.mergeClassFeatures(alive, st.featuresText);
        st.phase = 'class-features';
      });
    },

    stop() {
      userAborted = true; runToken++; abort?.abort(); clock.stop();
      st.running = false; abort = null; st.phase = st.resumePhase;
    },

    destroy() { abort?.abort(); },
  };
}

export type LevelUpRun = ReturnType<typeof createLevelUpRun>;
