/**
 * Der Lauf des Stufenaufstiegs: der Zustand, den die Schritte füllen, und die Schritte
 * selbst. Die Übergänge kommen aus `advance()` (steps.ts), das Dokument ist eine reine
 * Projektion des Zustands (`buildDoc`) — deterministische Schritte brauchen keine Aktion.
 */
import { mod } from '../../domain/skills';
import { computeLevelUpDelta, type LevelUpDelta } from '../levelUp';
import { resolvePastChoices } from '../characterFeatures';
import { type StepId, type AdvanceCtx, isCheckpoint, advance, plannedCheckpoints } from './steps';
import { resolveDeclaredSpells, noDeclaredSpells } from './spells';
import { classAccessGrants, gainedFeaturesFor, computeSubclassFeatures, subclassFeaturesForFlow } from './features';
import { countFeatsToPick } from './questions';
import { slotTotal } from './featUnlocks';
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
    get tools() { return st.toolLib; },
  });

  const knownSpells = createLevelUpKnownSpells({
    get character() { return ctx.character; },
    questions: () => [...choices.baseChoiceQs, ...choices.featChoiceQs, ...st.decisions],
    answers: () => st.answers,
  });

  let runToken = 0;

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const pushStep = (text: string) => { st.steps = [...st.steps, text]; };

  /** Angekündigte Zauberliste, die der Parser nicht lesen konnte — sonst fiele sie stumm weg. */
  const reportUnreadableGrants = () => {
    for (const name of st.declaredSpells.unreadable)
      pushStep(`„${name}" kündigt eine Zauberliste an, die nicht als Tabelle lesbar ist — Zauber nicht automatisch übernommen.`);
  };

  async function ensureSpellLib() {
    if (!st.spellLib.length) st.spellLib = await getSpellLibrary();
    return st.spellLib;
  }

  const steps = createRunSteps({
    st, choices, pushStep, ensureSpellLib,
    get character() { return ctx.character; },
  });

  function summarizeDelta(d: LevelUpDelta): string {
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

  /** Kapselt einen (ggf. mehrteiligen) async-Lauf mit Token-Guard und Fehler-Rücksprung. */
  async function runSegment(resume: StepId, body: (alive: () => boolean) => Promise<void>) {
    if (st.run.kind === 'running') return;
    st.reachedStep = resume;
    // Ein Neustart zählt den Token hoch — das verspätete Settle des alten Laufs fällt stumm durch.
    const myToken = ++runToken;
    st.run = { kind: 'running', step: resume };
    try {
      await body(() => myToken === runToken);
    } catch (e) {
      if (myToken === runToken) st.run = { kind: 'error', at: resume, message: msg(e) };
    }
  }

  function advCtx(): AdvanceCtx {
    return {
      delta: st.delta!,
      featsToPick: st.delta ? countFeatsToPick(st.delta, st.answers, slotTotal(st.featSlots)) : 0,
      styleWork: (st.styleOffer?.allowance ?? 0) + (st.styleOffer?.swaps ?? 0),
      // Die Pools zählen mit: sie stellen keine Frage, aber ohne sie hielte die Maschine
      // nicht an und der Picker käme nie auf den Schirm.
      baseChoices: choices.baseChoiceQs.length + st.optionPools.length,
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
        // Ein Merkmalstext kann einen Zauber nennen, den die Bibliothek nicht führt — gemeldet,
        // damit er inline angelegt werden kann statt still zu fehlen.
        if (st.declaredSpells.flagged.length) st.flagged = [...new Set([...st.flagged, ...st.declaredSpells.flagged])];
        reportUnreadableGrants();
        break;
      case 'subclass-delta':
        pushStep(`Subklasse „${st.chosenSubclass?.name}" — Merkmale werden geladen…`);
        st.subFeatures = await computeSubclassFeatures(st.chosenSubclass!.key, st.delta!.fromLevel, st.delta!.toLevel);
        if (!alive()) return;
        // `subFeatures` bleibt vollständig (Info-Einträge), die Merkmalsstrecke nicht — derselbe
        // Filter, den `gainedFeaturesFor` auf die Subklassen-Merkmale des Deltas legt.
        st.gainedFeatures = [...gainedFeaturesFor(st.delta!), ...subclassFeaturesForFlow(st.subFeatures)];
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
        await steps.runDeclaredChoices();
        break;
      case 'feature-effects':
        await steps.runRiders('base', alive);
        break;
      case 'feat-effects':
        await steps.runRiders('feat', alive);
        break;
      case 'feature-notes':
        steps.runNotes();
        break;
      case 'class-features':
        st.featuresText = steps.seedFeaturesText();
        break;
      case 'ongoing-effects':
        await steps.detectHpPerLevel(alive);
        if (!alive()) return;
        await steps.resolveCharLevelSpells();
        break;
      case 'feat-links':
        // Deklarierter Zauber-Zugang der Talente: Liste, Attribut und Kontingent stehen im Vault.
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
      // Die Änderungen leitet das Dokument selbst aus dem Zustand ab; hier fällt nur, welche
      // Talentwahlen die Entscheidungen freischalten.
      case 'assemble-decisions':
        await steps.runFeatUnlocks();
        break;
    }
  }

  function onEnterCheckpoint(step: StepId) {
    if (step === 'feat-choice') {
      st.featsToPick = countFeatsToPick(st.delta!, st.answers, slotTotal(st.featSlots));
      st.chosenFeats = [];
      getFeats().then((f) => { st.featLib = f; });
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
      styleOffer: st.styleOffer, chosenStyles: st.chosenStyles, styleSwaps: st.styleSwaps,
      grantSources: choices.baseDeclared, choiceSources: choices.declaredSources, charLevelSpells: st.charLevelSpells,
      baseChoiceQs: choices.baseChoiceQs, featChoiceQs: choices.featChoiceQs, gainedFeatures: st.gainedFeatures,
      optionPools: st.optionPools, optionPicks: st.optionPicks,
      optionPicksBefore: ctx.character.optionPicks ?? [],
      hpPerLevelSources: st.hpPerLevelSources, summaryLine: st.summaryLine, featuresText: st.featuresText,
      upTo: viewStep,
    });
  });

  return {
    st,
    choices,
    knownSpells,
    get doc() { return doc; },
    get plannedSteps(): StepId[] { return st.delta ? plannedCheckpoints(advCtx()) : ['choose-class']; },
    ensureSpellLib,

    start(classIndex: number, targetLevel: number, newClass?: { sourceKey: string; name: string }) {
      if (st.run.kind === 'running') return;
      st.chosenSubclass = null; st.subFeatures = []; st.gainedFeatures = []; st.riders = []; st.decisions = []; st.answers = {};
      st.optionPools = []; st.optionPicks = []; st.toolLib = [];
      st.declaredSpells = noDeclaredSpells(); st.charLevelSpells = noDeclaredSpells();
      st.notes = []; st.gaps = [];
      st.chosenFeats = []; st.ownedFeats = []; st.featAccess = []; st.featSlots = [];
      st.styleOffer = null; st.chosenStyles = []; st.styleSwaps = []; st.featRiders = []; st.flagged = [];
      st.hpPerLevelSources = []; st.summaryLine = ''; st.featuresText = '';
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

    resume(from: StepId): Promise<void> {
      if (!st.delta) return Promise.resolve();
      return runSegment(from, (alive) => pipelineBody(from, alive));
    },

    chooseSubclass(key: string, name: string) {
      if (!st.delta) return;
      st.chosenSubclass = { key, name };
      runSegment('subclass-choice', (alive) => pipelineBody('subclass-choice', alive));
    },

    /**
     * Zurück zu einem früheren Checkpoint. Der Zustand bleibt stehen — „Weiter" rechnet die
     * folgenden Schritte neu, und wo ein Schritt seine Wahl neu aufsetzt, ist sie dann weg.
     */
    backTo(step: StepId) {
      if (st.run.kind === 'running' || !isCheckpoint(step)) return;
      st.reachedStep = step;
      st.run = { kind: 'paused', at: step };
    },

    destroy() { runToken++; },
  };
}

export type LevelUpRun = ReturnType<typeof createLevelUpRun>;
