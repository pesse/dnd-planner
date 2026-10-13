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
  import FullscreenWizard from './ui/FullscreenWizard.svelte';
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
  import './levelUp/levelUp.css';

  let { character, onApply, onclose }: {
    character: Character;
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
</script>

{#snippet progression()}
  <span class="field-label">Was sich ändert</span>
  {#if ui.progressionGroups.length}
    <div class="facts">
      {#each ui.progressionGroups as g}
        <div class="proto-group">
          <div class="proto-heading">{g.heading}</div>
          {#each g.lines as l}<div class="fact">• {l}</div>{/each}
        </div>
      {/each}
    </div>
  {:else}
    <span class="field-hint">Noch keine Änderungen.</span>
  {/if}
{/snippet}

{#snippet subclassDetail()}
  <SubclassDetail {ui} />
{/snippet}

{#snippet actions()}
  <div class="actions">
    {#if isPausedAt(st.run, 'choose-class')}
      <button class="secondary-btn" onclick={onclose}>Schließen</button>
      <button class="primary-btn" onclick={() => ui.startFlow()}
              disabled={(ui.isNewClass && !ui.newClassKey) || (!ui.isNewClass && ui.effectiveFrom >= 20)}>Weiter</button>
    {:else if isPausedAt(st.run, 'subclass-choice')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => st.chosenSubclass && run.chooseSubclass(st.chosenSubclass.key, st.chosenSubclass.name)} disabled={!st.chosenSubclass}>Weiter</button>
    {:else if isPausedAt(st.run, 'new-features')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('new-features')}>Weiter</button>
    {:else if isPausedAt(st.run, 'feature-choices')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('feature-choices')} disabled={!run.choices.allBaseAnswered}>Weiter</button>
    {:else if isPausedAt(st.run, 'player-decisions')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('player-decisions')} disabled={!ui.allAnswered}>Weiter</button>
    {:else if isPausedAt(st.run, 'feat-choice')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('feat-choice')} disabled={!ui.featsDone || !ui.stylesDone}>Weiter</button>
    {:else if isPausedAt(st.run, 'feat-choices')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('feat-choices')} disabled={!run.choices.allFeatAnswered}>Weiter</button>
    {:else if isPausedAt(st.run, 'class-features')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => ui.confirmClassFeatures()}>Weiter</button>
    {:else if isPausedAt(st.run, 'review')}
      <button class="secondary-btn" onclick={onclose}>Verwerfen</button>
      <button class="primary-btn" onclick={() => ui.apply()}>In den Entwurf übernehmen</button>
    {/if}
  </div>
{/snippet}

<FullscreenWizard
  title="⬆ Stufenaufstieg — {character.name}"
  label="Stufenaufstieg"
  scope="lvlup"
  {steps}
  {current}
  {onclose}
  detail={isPausedAt(st.run, 'subclass-choice') ? subclassDetail : undefined}
  preview={progression}
  footer={actions}
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

  {#if st.run.kind === 'error'}<p class="hint err">{st.run.message}</p>{/if}

  </div>
</FullscreenWizard>

<style>
  .main { display: flex; flex-direction: column; gap: 0.7rem; max-width: 60rem; }
  .actions { flex: 1; }
  .proto-group { display: flex; flex-direction: column; gap: 0.15rem; }
  .proto-heading { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
</style>
