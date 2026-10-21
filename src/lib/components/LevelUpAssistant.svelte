<script lang="ts">
  /**
   * Oberfläche des Stufenaufstieg-Assistenten. Die Zustandsmaschine liegt in
   * `levelUp/steps.ts`, Lauf und Zustand in `levelUp/run.svelte.ts`, die abgeleiteten
   * Wahlen in `levelUp/choices.svelte.ts`, der UI-Zustand dieser Oberfläche in
   * `levelUp/assistantState.svelte.ts`.
   */
  import { onDestroy } from 'svelte';
  import { createLevelUpRun } from '../services/levelUp/run.svelte';
  import { isPausedAt, stepOf } from '../services/levelUp/runState';
  import { STEP_META, type StepId } from '../services/levelUp/steps';
  import { type LevelUpDelta } from '../services/levelUp';
  import { type LevelUpChangeSet } from '../schemas/levelUp';
  import { type Character } from '../schemas/characterSchema';
  import { type ApplyContext } from '../services/applyChanges';
  import { characterWithChanges } from '../services/characterWithChanges';
  import CharacterPreview from './wizard/CharacterPreview.svelte';
  import FullscreenWizard, { CHOICE_LIST_WIDTH } from './ui/FullscreenWizard.svelte';
  import SubclassDetail from './levelUp/SubclassDetail.svelte';
  import { createLevelUpAssistantUi } from './levelUp/assistantState.svelte';
  import ChooseClassStep from './levelUp/ChooseClassStep.svelte';
  import SubclassChoiceStep from './levelUp/SubclassChoiceStep.svelte';
  import NewFeaturesPanel from './levelUp/NewFeaturesPanel.svelte';
  import QuestionsPanel from './levelUp/QuestionsPanel.svelte';
  import OptionPoolPanel from './levelUp/OptionPoolPanel.svelte';
  import PlayerDecisionsPanel from './levelUp/PlayerDecisionsPanel.svelte';
  import FeatChoicePanel from './levelUp/FeatChoicePanel.svelte';
  import FightingStylePanel from './levelUp/FightingStylePanel.svelte';
  import ClassFeaturesPanel from './levelUp/ClassFeaturesPanel.svelte';
  import SpellCreatorPanel from './levelUp/SpellCreatorPanel.svelte';
  import ReviewPanel from './levelUp/ReviewPanel.svelte';
  import './wizard/wizard.css';
  import './levelUp/levelUp.css';

  let { character, applyContext, onApply, onclose }: {
    character: Character;
    applyContext: ApplyContext;
    onApply: (changeSet: LevelUpChangeSet, delta: LevelUpDelta) => void;
    onclose: () => void;
  } = $props();

  const run = createLevelUpRun({ get character() { return character; } });
  const st = run.st;
  onDestroy(() => run.destroy());

  const ui = createLevelUpAssistantUi(run, () => character, (changeSet, delta) => onApply(changeSet, delta), () => onclose());

  // Die Zustandsmaschine kennt ihre Checkpoints erst beim Erreichen — die Leiste zeigt die
  // bisher besuchten, ohne Rücksprung.
  let visited = $state<StepId[]>([]);
  $effect(() => {
    if (st.run.kind === 'running') return;
    const at = stepOf(st.run);
    if (at !== 'done' && !visited.includes(at)) visited = [...visited, at];
  });
  const steps = $derived(visited.map((id) => ({ id, label: STEP_META[id].label })));
  const current = $derived(Math.max(0, visited.indexOf(stepOf(st.run))));

  // Während eines Laufs fehlt „Weiter" — der nächste Checkpoint steht noch nicht fest.
  const forward = $derived.by<{ label: string; disabled: boolean; go: () => void } | null>(() => {
    if (st.run.kind === 'running') return null;
    const step = (disabled: boolean, go: () => void) => ({ label: 'Weiter', disabled, go });
    switch (stepOf(st.run)) {
      case 'choose-class':
        return step((ui.isNewClass && !ui.newClassKey) || (!ui.isNewClass && ui.effectiveFrom >= 20), () => ui.startFlow());
      case 'subclass-choice':
        return step(!st.chosenSubclass, () => st.chosenSubclass && run.chooseSubclass(st.chosenSubclass.key, st.chosenSubclass.name));
      case 'new-features': return step(false, () => run.resume('new-features'));
      case 'feature-choices': return step(!run.choices.allBaseAnswered, () => run.resume('feature-choices'));
      case 'player-decisions': return step(!ui.allAnswered, () => run.resume('player-decisions'));
      case 'feat-choice': return step(!ui.featsDone || !ui.stylesDone, () => run.resume('feat-choice'));
      case 'feat-choices': return step(!run.choices.allFeatAnswered, () => run.resume('feat-choices'));
      case 'class-features': return step(false, () => ui.confirmClassFeatures());
      case 'review': return { label: 'In den Entwurf übernehmen', disabled: false, go: () => ui.apply() };
      default: return null;
    }
  });

  const baseline = $derived($state.snapshot(character) as Character);
  const previewCharacter = $derived(
    st.delta ? characterWithChanges(baseline, run.doc.changes, applyContext, st.delta) : baseline,
  );
</script>

{#snippet progression()}
  <CharacterPreview character={previewCharacter} baseline={st.delta ? baseline : null} emptyText="">
    {#if ui.progressionGroups.length}
      <div class="facts">
        <h3>Was sich ändert</h3>
        {#each ui.progressionGroups as g}
          <div class="proto-group">
            <div class="proto-heading">{g.heading}</div>
            {#each g.lines as l}<div class="fact">• {l}</div>{/each}
          </div>
        {/each}
      </div>
    {/if}
  </CharacterPreview>
{/snippet}

{#snippet subclassDetail()}
  <SubclassDetail {ui} />
{/snippet}

{#snippet footer()}
  <button class="secondary" onclick={onclose}>{stepOf(st.run) === 'review' ? 'Verwerfen' : 'Abbrechen'}</button>
  <div class="spacer"></div>
  {#if forward}
    <button class="primary" onclick={forward.go} disabled={forward.disabled}>{forward.label}</button>
  {/if}
{/snippet}

<FullscreenWizard
  title="⬆ Stufenaufstieg — {character.name}"
  label="Stufenaufstieg"
  scope="wizard lvlup"
  {steps}
  {current}
  {onclose}
  mainWidth={isPausedAt(st.run, 'subclass-choice') ? CHOICE_LIST_WIDTH : undefined}
  detail={isPausedAt(st.run, 'subclass-choice') ? subclassDetail : undefined}
  preview={progression}
  {footer}
>
  <div class="main">
  {#if isPausedAt(st.run, 'choose-class')}
    <ChooseClassStep {ui} />
  {/if}

  {#if isPausedAt(st.run, 'subclass-choice')}
    <SubclassChoiceStep {ui} />
  {/if}

  {#if isPausedAt(st.run, 'new-features')}
    <NewFeaturesPanel {ui} />
  {/if}

  {#if isPausedAt(st.run, 'feature-choices')}
    <p class="hint">Wahl(en) der neuen Merkmale — Optionen und Wirkung stehen in der Bibliothek, hier wird nur ausgewählt.</p>
    {#if ui.choices.baseChoiceQs.length}
      <QuestionsPanel {ui} list={ui.choices.baseChoiceQs} />
    {/if}
    <OptionPoolPanel {ui} />
  {/if}

  {#if isPausedAt(st.run, 'feat-choices')}
    <p class="hint">Wahl(en) der gewählten Talente — Liste, Attribut und Anzahl stehen in der Bibliothek, hier wird nur ausgewählt.</p>
    <QuestionsPanel {ui} list={ui.choices.featChoiceQs} />
  {/if}

  {#if isPausedAt(st.run, 'player-decisions')}
    <PlayerDecisionsPanel {ui} />
  {/if}

  {#if isPausedAt(st.run, 'feat-choice')}
    <FightingStylePanel {ui} />
    {#if st.featsToPick > 0}<FeatChoicePanel {ui} />{/if}
  {/if}

  {#if isPausedAt(st.run, 'class-features')}
    <ClassFeaturesPanel {ui} />
  {/if}

  <SpellCreatorPanel {ui} />

  {#if isPausedAt(st.run, 'review')}
    <ReviewPanel {ui} />
  {/if}

  {#if st.run.kind === 'error'}<p class="warn">{st.run.message}</p>{/if}

  </div>
</FullscreenWizard>

<style>
  .main { display: flex; flex-direction: column; gap: 0.7rem; max-width: 60rem; }
  .spacer { flex: 1; }
  .facts h3 { margin: 0; font-size: 0.95rem; font-family: var(--font-display, inherit); }
  .proto-group { display: flex; flex-direction: column; gap: 0.15rem; }
  .proto-heading { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
</style>
