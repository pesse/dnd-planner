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
  import { STEP_META, timelineIndex, type StepId } from '../services/levelUp/steps';
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
  import ChooseClassDetail from './levelUp/ChooseClassDetail.svelte';
  import SubclassChoiceStep from './levelUp/SubclassChoiceStep.svelte';
  import NewFeaturesPanel from './levelUp/NewFeaturesPanel.svelte';
  import QuestionsPanel from './levelUp/QuestionsPanel.svelte';
  import OptionPoolPanel from './levelUp/OptionPoolPanel.svelte';
  import PlayerDecisionsPanel from './levelUp/PlayerDecisionsPanel.svelte';
  import FeatChoicePanel from './levelUp/FeatChoicePanel.svelte';
  import FightingStylePanel from './levelUp/FightingStylePanel.svelte';
  import SpellCreatorPanel from './levelUp/SpellCreatorPanel.svelte';
  import ChangeList from './levelUp/ChangeList.svelte';
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

  // Der geplante Weg plus alles schon Besuchte: ein Zähler kann nach dem Besuch wieder auf 0
  // fallen, der Schritt bleibt trotzdem in der Leiste.
  let visited = $state<StepId[]>([]);
  $effect(() => {
    if (st.run.kind === 'running') return;
    const at = stepOf(st.run);
    if (at !== 'done' && !visited.includes(at)) visited = [...visited, at];
  });
  const stepIds = $derived(
    [...new Set([...visited, ...run.plannedSteps])].sort((a, b) => timelineIndex(a) - timelineIndex(b)),
  );
  const steps = $derived(stepIds.map((id) => ({ id, label: STEP_META[id].label })));
  const current = $derived(Math.max(0, stepIds.indexOf(stepOf(st.run))));
  const idle = $derived(st.run.kind !== 'running');

  function goBack(i: number) {
    const target = stepIds[i];
    visited = visited.filter((s) => timelineIndex(s) <= timelineIndex(target));
    run.backTo(target);
  }

  // Während eines Laufs fehlt „Weiter" — der nächste Checkpoint steht noch nicht fest.
  const forward = $derived.by<{ label: string; disabled: boolean; go: () => unknown } | null>(() => {
    if (st.run.kind === 'running') return null;
    const step = (disabled: boolean, go: () => unknown) => ({ label: 'Weiter', disabled, go });
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
      default: return null;
    }
  });

  // Am letzten Checkpoint übernimmt „Weiter" gleich: die Seitenleiste zeigt längst alles,
  // die übrigen Schritte rechnen nur noch.
  const isLast = $derived(
    !!st.delta && !['choose-class', 'subclass-choice'].includes(stepOf(st.run)) && stepIds.at(-1) === stepOf(st.run),
  );
  async function finish(go: () => unknown) {
    await go();
    if (isPausedAt(st.run, 'done')) ui.apply();
  }

  // Auswahl-Schritte zeigen wie die Herkunft im Erstell-Wizard eine Liste neben der Detailkarte.
  const choiceDetail = $derived(
    isPausedAt(st.run, 'choose-class') ? classDetail : isPausedAt(st.run, 'subclass-choice') ? subclassDetail : undefined,
  );

  // Nach einem Rücksprung zur Klassenwahl steht das alte Delta noch — es gilt erst nach „Weiter".
  const previewDelta = $derived(stepOf(st.run) === 'choose-class' ? null : st.delta);
  const baseline = $derived($state.snapshot(character) as Character);
  const previewCharacter = $derived(
    previewDelta ? characterWithChanges(baseline, run.doc.changes, applyContext, previewDelta) : baseline,
  );
</script>

{#snippet progression()}
  <CharacterPreview character={previewCharacter} baseline={previewDelta ? baseline : null} emptyText="">
    <ChangeList {ui} />
  </CharacterPreview>
{/snippet}

{#snippet subclassDetail()}
  <SubclassDetail {ui} />
{/snippet}

{#snippet classDetail()}
  <ChooseClassDetail {ui} />
{/snippet}

{#snippet footer()}
  <button class="secondary" onclick={onclose}>Abbrechen</button>
  <div class="spacer"></div>
  {#if current > 0 && idle}<button class="secondary" onclick={() => goBack(current - 1)}>Zurück</button>{/if}
  {#if forward}
    {@const go = forward.go}
    {#if isLast}
      <button class="primary" onclick={() => finish(go)} disabled={forward.disabled}>In den Entwurf übernehmen</button>
    {:else}
      <button class="primary" onclick={go} disabled={forward.disabled}>{forward.label}</button>
    {/if}
  {/if}
{/snippet}

<FullscreenWizard
  title="⬆ Stufenaufstieg — {character.name}"
  label="Stufenaufstieg"
  scope="wizard lvlup"
  {steps}
  {current}
  onstep={idle ? goBack : undefined}
  {onclose}
  mainWidth={choiceDetail ? CHOICE_LIST_WIDTH : undefined}
  detail={choiceDetail}
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

  <SpellCreatorPanel {ui} />

  {#if st.run.kind === 'error'}<p class="warn">{st.run.message}</p>{/if}

  </div>
</FullscreenWizard>

<style>
  .main { display: flex; flex-direction: column; gap: 0.7rem; max-width: 60rem; }
  .spacer { flex: 1; }
</style>
