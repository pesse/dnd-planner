/**
 * Der Lauf des Stufenaufstiegs: der Zustand, den die Schritte füllen, und die Schritte
 * selbst. Die Übergänge kommen aus `advance()` (steps.ts), das Dokument ist eine reine
 * Projektion des Zustands (`buildDoc`) — deterministische Schritte brauchen keine Aktion.
 */
import { mod } from '../../domain/skills';
import { computeLevelUpDelta, type LevelUpDelta } from '../levelUp';
import { resolvePastChoices } from '../characterFeatures';
import { type StepId, type AdvanceCtx, isCheckpoint, advance } from './steps';
import { resolveDeclaredSpells, noDeclaredSpells } from './spells';
import { classAccessGrants, gainedFeaturesFor, computeSubclassFeatures, subclassFeaturesForAi } from './features';
import { countFeatsToPick } from './questions';
import { buildDoc } from './doc';
import { createLevelUpChoices } from './choices.svelte';
import { createLevelUpKnownSpells } from './knownSpells.svelte';
import { createRunSteps } from './runSteps';
import { emptyRiders, emptyRunState, stepOf, type LevelUpRunState } from './runState';
import { withoutSpellGrantFeatures } from '../grantedSpells';
import { withoutDeclaredChoiceFeatures } from '../declaration/optionList';
import { spellAccessGrantOf, type SpellAccessGrant } from '../spellcasting/access';
import { isSpellAccessFeature } from '../declaration/casting';
import { nextFeatSourceId } from '../declaration/featInstances';
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
    get baseAccess() { return st.baseAccess; },
    get featAccess() { return st.featAccess; },
    get answers() { return st.answers; },
    get skills() { return ctx.character.skills; },
  });

  const knownSpells = createLevelUpKnownSpells({
    get character() { return ctx.character; },
    questions: () => [...choices.baseChoiceQs, ...choices.featChoiceQs, ...st.decisions],
    answers: () => st.answers,
  });

  const clock = createRunClock(() => st.run.kind === 'running');
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
    if (st.run.kind === 'running') return;
    userAborted = false; st.reachedStep = resume;
    const myToken = ++runToken;
    abort = new AbortController(); clock.start();
    st.run = { kind: 'running', step: resume };
    try {
      await body(() => myToken === runToken);
    } catch (e) {
      if (myToken === runToken && !userAborted) st.run = { kind: 'error', at: resume, message: msg(e) };
    } finally {
      if (myToken === runToken) { clock.stop(); abort = null; }
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
    st.run = { kind: 'paused', at: step };
  }

  async function runStep(step: StepId, alive: () => boolean) {
    switch (step) {
      case 'base-delta':
        st.gainedFeatures = gainedFeaturesFor(st.delta!);
        st.baseAccess = await classAccessGrants(st.delta!);
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
        // `subFeatures` bleibt vollständig (Info-Einträge), der KI-Eingang nicht — derselbe
        // Filter, den `gainedFeaturesFor` auf die Subklassen-Merkmale des Deltas legt.
        st.gainedFeatures = [...gainedFeaturesFor(st.delta!), ...subclassFeaturesForAi(st.subFeatures)];
        st.baseAccess = await classAccessGrants(st.delta!, st.chosenSubclass!.key);
        st.declaredSpells = resolveDeclaredSpells(
          [...st.delta!.featuresGained, ...st.delta!.subclassFeaturesGained, ...st.subFeatures],
          st.delta!.toLevel,
          await ensureSpellLib(),
          st.delta!.klasseName,
        );
        if (st.declaredSpells.flagged.length) st.flagged = [...new Set([...st.flagged, ...st.declaredSpells.flagged])];
        reportUnreadableGrants();
        break;
      case 'declared-choices':
        steps.runDeclaredChoices();
        break;
      case 'feature-effects':
        await steps.runRiders('base', alive);
        break;
      case 'feat-effects':
        await steps.runRiders('feat', alive);
        break;
      case 'feature-notes':
        await steps.runNotes(alive);
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
        // Die Instanz-Id kommt aus dem BESTAND — ein zweites Eingeweihter der Magie ist eine
        // eigene Quelle, und seine Zauber dürfen nicht in die Kontingente des ersten fallen.
        st.featAccess = (
          await Promise.all(
            st.chosenFeats.filter(isSpellAccessFeature).map(async (f) =>
              spellAccessGrantOf(f, {
                gainedAt: f.gainedAt,
                sourceId: await nextFeatSourceId(ctx.character, f.key, f.gainedAt),
              }),
            ),
          )
        ).filter((g): g is SpellAccessGrant => g !== null);
        if (st.featAccess.length) pushStep(`${st.featAccess.length} Zauber-Zugang aus der Bibliothek gelesen.`);
        // Beide Talent-Wahl-Arten in einem Griff: der Zauber-Zugang und die übrigen
        // Deklarationen des Talents halten am selben Checkpoint.
        steps.initFeatureChoices(choices.featChoiceQs);
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
  const viewStep = $derived<StepId>(st.run.kind === 'running' ? st.reachedStep : stepOf(st.run));
  const doc = $derived.by<LevelUpDoc>(() => {
    if (!st.delta) return { fromLevel: 0, toLevel: 0, klasse: '', summary: '', changes: [] };
    return buildDoc({
      delta: st.delta, hitDice: ctx.character.hitDice ?? '',
      chosenSubclass: st.chosenSubclass, subFeatures: st.subFeatures, declaredSpells: st.declaredSpells,
      validatedBase: st.validatedBase, validatedFeats: st.validatedFeats,
      answers: st.answers, conMod: mod(ctx.character.abilities.con),
      pickedCantrips: steps.gatherCantrips(), pickedLearned: steps.gatherLearned(),
      spellOf: steps.spellOf,
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
    knownSpells,
    get doc() { return doc; },
    ensureSpellLib,

    start(classIndex: number, targetLevel: number, newClass?: { sourceKey: string; name: string }) {
      if (st.run.kind === 'running') return;
      st.chosenSubclass = null; st.subFeatures = []; st.gainedFeatures = []; st.riders = []; st.decisions = []; st.answers = {};
      st.declaredSpells = noDeclaredSpells(); st.charLevelSpells = noDeclaredSpells();
      st.notes = []; st.gaps = [];
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
        if (d.atLevelCap) {
          st.run = { kind: 'error', at: 'choose-class', message: 'Diese Klasse ist bereits auf Stufe 20.' };
          return;
        }
        if (d.isHomebrew) {
          st.run = {
            kind: 'error', at: 'choose-class',
            message: 'Stufenaufstieg ist nur mit hinterlegter Klassen-Progression möglich — für diese Klasse gibt es keine Progressionsdaten.',
          };
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
        st.run = { kind: 'paused', at: 'class-features' };
      });
    },

    stop() {
      userAborted = true; runToken++; abort?.abort(); clock.stop();
      if (st.run.kind === 'running') st.run = { kind: 'paused', at: st.run.step };
      abort = null;
    },

    destroy() { abort?.abort(); },
  };
}

export type LevelUpRun = ReturnType<typeof createLevelUpRun>;
