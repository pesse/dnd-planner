<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { llmConfig } from '../stores/llm';
  import { CharacterWizard } from '../services/wizard/characterWizard.svelte';
  import type { Job } from '../services/wizard/job.svelte';
  import { buildWizardCharacter } from '../services/wizard/assembleCharacter';
  import { isComplete as pointBuyComplete } from '../services/wizard/pointBuy';
  import { allowedKeys, isValidAllocation, type AsiAllocation } from '../services/wizard/backgroundAsi';
  import type { AbilityKey } from '../services/wizard/pointBuy';
  import { createSpellStepValues } from '../services/wizard/spellStep.svelte';
  import { getClassTree, type ClassNode } from '../classLibrary';
  import { getSpeciesList, type SpeciesInfo } from '../speciesLibrary';
  import { getBackgroundsList, getBackgroundByKey, type BackgroundInfo } from '../backgroundsLibrary';
  import { collectGrants, type CollectedGrants } from '../services/proficiencyGrants';
  import { masteryOffer, type MasteryOffer } from '../services/weaponMastery';
  import { fightingStyleOffer, type FightingStyleOffer } from '../services/fightingStyle';
  import { classCastingOffer, type ClassCastingOffer } from '../services/spellcasting/classOffer';
  import { getSpellLibrary, spellInfoByKey, type SpellInfo } from '../spellLibrary';
  import type { Character } from '../schemas/characterSchema';
  import WeaponMasteryPicker from './WeaponMasteryPicker.svelte';
  import FightingStylePicker from './FightingStylePicker.svelte';
  import BasicsStep from './wizard/BasicsStep.svelte';
  import PointBuyBlock from './wizard/PointBuyBlock.svelte';
  import BackgroundAsiStep from './wizard/BackgroundAsiStep.svelte';
  import SkillPickStep from './wizard/SkillPickStep.svelte';
  import FeatureChoiceStep from './wizard/FeatureChoiceStep.svelte';
  import SpellStep from './wizard/SpellStep.svelte';
  import EquipmentChoiceStep from './wizard/EquipmentChoiceStep.svelte';
  import ReviewStep from './wizard/ReviewStep.svelte';
  import './wizard/wizard.css';

  let { onComplete, onCancel }: { onComplete: (character: Character) => void; onCancel: () => void } = $props();

  const w = new CharacterWizard(() => get(llmConfig));

  // Schritte über eine ID, nicht über einen festen Index: optionale Schritte fallen weg
  // und verschöben sonst alle nachfolgenden Index-Prüfungen.
  type StepId = 'basics' | 'abilities' | 'background' | 'proficiencies' | 'mastery' | 'fighting-style' | 'features' | 'spells' | 'equipment' | 'review';
  const ALL_STEPS: { id: StepId; label: string }[] = [
    { id: 'basics', label: 'Grundwahl' },
    { id: 'abilities', label: 'Attribute' },
    { id: 'background', label: 'Hintergrund-Bonus' },
    { id: 'proficiencies', label: 'Übungen' },
    { id: 'mastery', label: 'Waffenbeherrschung' },
    { id: 'fighting-style', label: 'Kampfstil' },
    { id: 'features', label: 'Merkmale' },
    { id: 'spells', label: 'Zauber' },
    { id: 'equipment', label: 'Ausrüstung' },
    { id: 'review', label: 'Überblick' },
  ];
  const steps = $derived(
    ALL_STEPS.filter(
      (s) =>
        // Den Schritt, auf dem der Nutzer STEHT, nie herausfiltern — die Bedingungen
        // kippen nachträglich (die Merkmals-Analyse landet spät).
        s.id === currentStep ||
        ((s.id !== 'mastery' || masteryAvailable) &&
          (s.id !== 'fighting-style' || fightingStyleAvailable) &&
          (s.id !== 'spells' || spellsAvailable)),
    ),
  );
  let currentStep = $state<StepId>('basics');
  const stepIndex = $derived(Math.max(0, steps.findIndex((s) => s.id === currentStep)));

  let classTree = $state<ClassNode[]>([]);
  let speciesList = $state<SpeciesInfo[]>([]);
  let backgroundList = $state<BackgroundInfo[]>([]);
  let spellLib = $state<SpellInfo[]>([]);

  let grants = $state<CollectedGrants | null>(null);
  let skillPicks = $state<string[][]>([]); // je offener Wahl eine Auswahl (englische Namen)
  let asiAllowed = $state<AbilityKey[]>([]);
  let choiceAnswers = $state<Record<string, string[]>>({});
  let creating = $state(false);
  let createError = $state('');

  let kickedOff = false;
  let lastBasicsSig = '';

  const aiJobs = $derived([
    { label: 'Merkmale analysieren', job: w.analysis },
    { label: 'Merkmals-Effekte ableiten', job: w.effects },
    { label: 'Klassenmerkmale-Text', job: w.classText },
    { label: 'Volksmerkmale-Text', job: w.speciesText },
    { label: 'Startausrüstung aufbereiten', job: w.equipment },
  ]);
  const runningJobs = $derived(aiJobs.filter((j) => j.job.status === 'running'));
  const aiBusy = $derived(runningJobs.length > 0);

  let nowMs = $state(0);
  let busyStartMs = $state(0);
  $effect(() => {
    if (aiBusy && !busyStartMs) busyStartMs = performance.now();
    else if (!aiBusy) busyStartMs = 0;
  });
  const elapsedSec = $derived(aiBusy && busyStartMs ? Math.floor((nowMs - busyStartMs) / 1000) : 0);
  const stalled = $derived(aiBusy && w.lastActivityMs > 0 && nowMs - w.lastActivityMs > 50_000);

  onMount(() => {
    getClassTree().then((t) => (classTree = t));
    getSpeciesList().then((s) => (speciesList = s));
    getBackgroundsList().then((b) => (backgroundList = b));
    getSpellLibrary().then((s) => (spellLib = s));
    const clock = setInterval(() => (nowMs = performance.now()), 500);
    return () => { clearInterval(clock); w.dispose(); };
  });

  // Nur Grundklassen — die Unterklasse fällt erst ab Stufe 3 an.
  const baseClasses = $derived(classTree.filter((n) => !n.subclassOf));

  function basicsSig(): string {
    return `${w.species.sourceKey}|${w.klass.sourceKey}|${w.background.sourceKey}`;
  }

  async function loadGrants() {
    grants = await collectGrants({
      classes: [{ sourceKey: w.klass.sourceKey, name: w.klass.name, subclassKey: w.klass.subclassKey }],
      species: { sourceKey: w.species.sourceKey },
      backgroundRef: { sourceKey: w.background.sourceKey },
    });
    skillPicks = grants.choices.map(() => []);
    // Mit `chosenSkills` zusammen die Optionsliste der Expertise-Wahl im Merkmals-Schritt.
    w.grantedSkills = grants.skills.map((g) => g.value);
    syncChosenSkills();
  }
  function syncChosenSkills() {
    w.chosenSkills = [...new Set(skillPicks.flat())];
  }
  const openChoicesDone = $derived(
    !grants || grants.choices.every((ch, i) => (skillPicks[i]?.length ?? 0) === ch.choose),
  );

  async function loadAsi() {
    const bg = await getBackgroundByKey(w.background.sourceKey);
    asiAllowed = allowedKeys(bg?.abilityScores ?? []);
    w.asi = {};
  }
  const asiValid = $derived(asiAllowed.length === 0 || isValidAllocation(w.asi, asiAllowed));

  const toolChoicesDone = $derived(w.pendingToolChoices() === 0);

  // Kontingent und wählbare Waffen kommen aus der Bibliothek, nie aus der KI.
  let mastery = $state<MasteryOffer | null>(null);
  const weaponProfs = $derived({
    simple: grants?.weapons.some((g) => g.value === 'Simple') ?? false,
    martial: grants?.weapons.some((g) => g.value === 'Martial') ?? false,
  });
  $effect(() => {
    const key = w.klass.sourceKey;
    const profs = weaponProfs;
    if (!key) { mastery = null; return; }
    let cancelled = false;
    void masteryOffer({
      classes: [{ sourceKey: key, name: w.klass.name, level: 1 }],
      proficiencies: { simpleWeapons: profs.simple, martialWeapons: profs.martial },
    })
      .then((o) => { if (!cancelled) mastery = o; })
      .catch(() => { if (!cancelled) mastery = null; });
    return () => { cancelled = true; };
  });
  const masteryAvailable = $derived((mastery?.allowance ?? 0) > 0);

  // Gespeichert werden Talent-Keys; die Assembly macht daraus Talent-Links in `features[]`.
  let fightingStyle = $state<FightingStyleOffer | null>(null);
  $effect(() => {
    const key = w.klass.sourceKey;
    if (!key) { fightingStyle = null; return; }
    let cancelled = false;
    void fightingStyleOffer({
      classes: [{ sourceKey: key, subclassKey: w.klass.subclassKey, name: w.klass.name, level: 1 }],
    })
      .then((o) => { if (!cancelled) fightingStyle = o; })
      .catch(() => { if (!cancelled) fightingStyle = null; });
    return () => { cancelled = true; };
  });
  const fightingStyleAvailable = $derived((fightingStyle?.allowance ?? 0) > 0);

  // Kontingente aus der Klassentabelle, Optionen aus `vault/spells` — kein KI-Job. Der
  // Schritt erscheint auch ohne Zauberwirker-Klasse, wenn ein Merkmal eine Wahl erzwingt.
  let spellOffer = $state<ClassCastingOffer | null>(null);
  $effect(() => {
    const key = w.klass.sourceKey;
    if (!key) { spellOffer = null; return; }
    let cancelled = false;
    void classCastingOffer({
      classKey: key,
      klasseName: w.klass.name,
      subclassKey: w.klass.subclassKey,
      subclassName: w.klass.subclassName,
      level: 1,
    })
      .then((o) => { if (!cancelled) spellOffer = o; })
      .catch(() => { if (!cancelled) spellOffer = null; });
    return () => { cancelled = true; };
  });
  const spellsAvailable = $derived((spellOffer?.isCaster ?? false) || w.spellPickChoices.length > 0);
  const spellValues = createSpellStepValues(w, () => spellOffer, () => spellLib);

  // Nur die DEKLARIERTEN Wahlen sind Pflicht (die KI-Wahlen können ganz fehlen): ohne sie
  // bliebe die Zauberliste offen und der Zauber-Schritt hätte nichts anzubieten.
  const declaredChoicesDone = $derived(
    w.declaredChoices
      .filter((c) => c.type !== 'spell-pick')
      .every((c) => (choiceAnswers[c.id] ?? []).some((v) => v.trim())),
  );

  /** Baut alles neu und läuft deshalb gefahrlos zweimal — nach Merkmals- und Zauberschritt. */
  function commitFeatureChoices() {
    const declared = new Set(w.declaredChoices.map((c) => c.id));
    const answered = w.featureChoices
      .map((ch) => ({
        id: ch.id,
        choice:
          ch.type === 'spell-pick'
            ? (w.featureSpellPicks[ch.id] ?? []).map((v) => spellInfoByKey(spellLib, v)?.name ?? v).join(', ')
            : (choiceAnswers[ch.id] ?? []).join(', '),
      }))
      .filter((rc) => rc.choice.trim());
    // Zwei Kanäle: nur die Wahlen der KI-Analyse gehen als `<resolved_choices>` zurück ans
    // Modell — eine deklarierte id kennt es nicht, das Merkmal stand nie in seinem Eingang.
    w.resolvedChoices = answered.filter((rc) => !declared.has(rc.id));
    w.declaredAnswers = answered.filter((rc) => declared.has(rc.id));
  }

  const canProceed = $derived.by(() => {
    switch (currentStep) {
      case 'basics': return w.basicsComplete && w.name.trim().length > 0;
      case 'abilities': return pointBuyComplete(w.scores);
      case 'background': return asiValid;
      case 'proficiencies': return openChoicesDone;
      case 'features': return declaredChoicesDone;
      case 'spells': return spellValues.done;
      case 'equipment': return toolChoicesDone;
      default: return true;
    }
  });

  function next() {
    if (!canProceed) return;
    if (currentStep === 'basics') {
      const sig = basicsSig();
      if (!kickedOff) { w.kickoff(); kickedOff = true; lastBasicsSig = sig; }
      else if (sig !== lastBasicsSig) { w.restart(); lastBasicsSig = sig; grants = null; choiceAnswers = {}; }
      loadAsi();
    }
    // Erst nach dem Wahl-Checkpoint, sonst trägt der Text einen Platzhalter
    // („Resistenz gegen [Schadensart]") statt der getroffenen Wahl.
    if (currentStep === 'features') { commitFeatureChoices(); w.finalizeFeatures(); w.summarizeFeatures(); }
    if (currentStep === 'spells') commitFeatureChoices();
    const nextStep = steps[stepIndex + 1];
    if (!nextStep) return;
    if (nextStep.id === 'proficiencies' && !grants) loadGrants();
    currentStep = nextStep.id;
  }
  function back() {
    const prev = steps[stepIndex - 1];
    if (prev) currentStep = prev.id;
  }

  async function create() {
    creating = true;
    createError = '';
    try {
      await w.awaitPending();
      const character = await buildWizardCharacter(w);
      onComplete(character);
    } catch (e) {
      createError = e instanceof Error ? e.message : String(e);
      creating = false;
    }
  }

  function statusText(job: Job<unknown>): string {
    switch (job.status) {
      case 'running': return 'läuft …';
      case 'done': return 'fertig';
      case 'error': return `Fehler: ${job.error}`;
      case 'skipped': return 'übersprungen';
      default: return '—';
    }
  }
</script>

<div class="wizard-backdrop" role="dialog" aria-modal="true" aria-label="Charakter erstellen">
  <div class="wizard">
    <header>
      <h2>Neuer Charakter</h2>
      <button class="close" onclick={onCancel} aria-label="Abbrechen">✕</button>
    </header>

    <ol class="steps">
      {#each steps as s, i}
        <li class:active={i === stepIndex} class:done={i < stepIndex}>{s.label}</li>
      {/each}
    </ol>

    <div class="body">
      {#if currentStep === 'basics'}
        <BasicsStep {w} classes={baseClasses} {speciesList} {backgroundList} />

      {:else if currentStep === 'abilities'}
        <PointBuyBlock bind:scores={w.scores} />

      {:else if currentStep === 'background'}
        <BackgroundAsiStep allowed={asiAllowed} bind:asi={w.asi as AsiAllocation} />

      {:else if currentStep === 'proficiencies'}
        <SkillPickStep {grants} bind:picks={skillPicks} onchange={syncChosenSkills} />

      {:else if currentStep === 'mastery'}
        {#if !mastery}
          <p class="hint">Lade Waffenbeherrschung …</p>
        {:else}
          <p class="hint">Wähle die Waffenarten, deren Meisterschaftseigenschaft du nutzen darfst.</p>
          <WeaponMasteryPicker offer={mastery} bind:masteries={w.masteries} />
        {/if}

      {:else if currentStep === 'fighting-style'}
        {#if !fightingStyle}
          <p class="hint">Lade Kampfstile …</p>
        {:else}
          <p class="hint">Wähle deinen Kampfstil — die Optionen stammen aus der Talent-Bibliothek.</p>
          <FightingStylePicker
            offer={fightingStyle}
            selected={w.fightingStyles}
            onToggle={(key) => {
              w.fightingStyles = w.fightingStyles.includes(key)
                ? w.fightingStyles.filter((k) => k !== key)
                : [...w.fightingStyles, key];
            }}
          />
        {/if}

      {:else if currentStep === 'features'}
        <FeatureChoiceStep {w} bind:answers={choiceAnswers} {statusText} />

      {:else if currentStep === 'spells'}
        <SpellStep {w} offer={spellOffer} library={spellLib} v={spellValues} {statusText} />

      {:else if currentStep === 'equipment'}
        <EquipmentChoiceStep {w} {statusText} done={toolChoicesDone} />

      {:else if currentStep === 'review'}
        <ReviewStep {w} {aiBusy} {createError} {statusText} />
      {/if}
    </div>

    {#if aiBusy}
      <div class="ai-status">
        <span class="spinner" aria-hidden="true"></span>
        <span>KI arbeitet: {runningJobs.map((j) => j.label).join(', ')} ({elapsedSec}s)</span>
      </div>
      {#if stalled}<p class="ai-stall">Seit über 50 s keine Antwort — du kannst warten oder die Grundwahl neu treffen.</p>{/if}
    {/if}

    <footer>
      <button class="secondary" onclick={onCancel}>Abbrechen</button>
      <div class="spacer"></div>
      {#if stepIndex > 0}<button class="secondary" onclick={back} disabled={creating}>Zurück</button>{/if}
      {#if stepIndex < steps.length - 1}
        <button class="primary" onclick={next} disabled={!canProceed}>Weiter</button>
      {:else}
        <button class="primary" onclick={create} disabled={creating}>{creating ? 'Erstelle …' : 'Charakter erstellen'}</button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .wizard-backdrop {
    position: fixed; inset: 0; background: rgba(20, 12, 2, 0.45);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .wizard {
    background: var(--bg); color: var(--ink);
    border: 1px solid var(--border-strong); border-radius: 10px;
    /* Feste Mindesthöhe: ein geöffnetes Dropdown braucht Platz nach unten, sonst
       scrollt der Body. */
    width: min(760px, 92vw); min-height: min(600px, 86vh); max-height: 88vh;
    display: flex; flex-direction: column;
    box-shadow: 0 12px 40px rgba(20, 12, 2, 0.35);
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1.1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1.15rem; font-family: var(--font-display, inherit); color: var(--ink); }
  .close { background: none; border: none; color: var(--ink-muted); font-size: 1.25rem; line-height: 1; cursor: pointer; }
  .steps { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; padding: 0.6rem 1.1rem; font-size: 0.78rem; border-bottom: 1px solid var(--border); }
  .steps li { color: var(--ink-muted); padding: 0.15rem 0.55rem; border-radius: 4px; }
  .steps li.active { background: var(--arcane, var(--gold)); color: #fff; font-weight: 600; }
  .steps li.done { color: var(--ink-soft); }
  .ai-status {
    display: flex; align-items: center; gap: 0.5rem; margin: 0.6rem 1.1rem 0;
    padding: 0.4rem 0.6rem; font-size: 0.82rem; color: var(--ink-soft);
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 5px;
  }
  .spinner {
    flex: 0 0 auto; width: 0.9rem; height: 0.9rem; border-radius: 50%;
    border: 2px solid var(--border-strong); border-top-color: var(--arcane, var(--gold));
    animation: wiz-spin 0.8s linear infinite;
  }
  @keyframes wiz-spin { to { transform: rotate(360deg); } }
  .ai-stall { margin: 0.3rem 1.1rem 0; font-size: 0.78rem; color: var(--danger); }
  .body { flex: 1 1 auto; min-height: 0; padding: 1rem 1.1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.85rem; }
  footer { display: flex; align-items: center; gap: 0.5rem; padding: 0.8rem 1.1rem; border-top: 1px solid var(--border); }
  .spacer { flex: 1; }
</style>
