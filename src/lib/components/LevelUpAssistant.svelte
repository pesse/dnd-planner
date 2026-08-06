<script lang="ts">
  /**
   * Oberfläche des Stufenaufstieg-Assistenten. Die Zustandsmaschine liegt in
   * `levelUp/steps.ts`, Lauf und Zustand in `levelUp/run.svelte.ts`, die abgeleiteten
   * Wahlen in `levelUp/choices.svelte.ts`, der UI-Zustand dieser Oberfläche in
   * `levelUp/assistantState.svelte.ts`.
   */
  import { onDestroy } from 'svelte';
  import { createLevelUpRun } from '../services/levelUp/run.svelte';
  import { isPausedAt } from '../services/levelUp/runState';
  import { type LevelUpDelta } from '../services/levelUp';
  import { type LevelUpChangeSet } from '../schemas/levelUp';
  import { type Character } from '../schemas/characterSchema';
  import Modal from './ui/Modal.svelte';
  import AiStatusBanner from './ui/AiStatusBanner.svelte';
  import LlmProviderSelect from './ui/LlmProviderSelect.svelte';
  import { createLevelUpAssistantUi } from './levelUp/assistantState.svelte';
  import ChooseClassStep from './levelUp/ChooseClassStep.svelte';
  import SubclassChoiceStep from './levelUp/SubclassChoiceStep.svelte';
  import QuestionsPanel from './levelUp/QuestionsPanel.svelte';
  import PlayerDecisionsPanel from './levelUp/PlayerDecisionsPanel.svelte';
  import FeatChoicePanel from './levelUp/FeatChoicePanel.svelte';
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
  const clock = run.clock;
  onDestroy(() => run.destroy());

  const ui = createLevelUpAssistantUi(run, () => character, (changeSet, delta) => onApply(changeSet, delta), () => onclose());

  const currentActivity = $derived(st.steps.length ? st.steps[st.steps.length - 1] : '');
</script>

<Modal
  title="⬆ Stufenaufstieg — {character.name}"
  label="Stufenaufstieg"
  top={70}
  width="min(940px, 96vw)"
  maxHeight="88vh"
  pad="1.3rem"
  padBottom="1.3rem"
  {onclose}
>
  <LlmProviderSelect accent="arcane" />

  <div class="body lvlup">
  <aside class="protocol">
    <span class="field-label">Progression</span>
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
  </aside>

  <div class="main">
  {#if isPausedAt(st.run, 'choose-class')}
    <ChooseClassStep {ui} />
  {/if}

  {#if st.run.kind === 'running'}
    <AiStatusBanner accent="arcane" text="{currentActivity || 'KI arbeitet…'} ({clock.elapsedSec}s)" />
  {/if}
  {#if clock.stalled}
    <p class="hint warn">Seit {clock.stalledSec}s keine Antwort — du kannst abbrechen und neu starten.</p>
  {/if}

  {#if isPausedAt(st.run, 'subclass-choice')}
    <SubclassChoiceStep {ui} />
  {/if}

  {#if isPausedAt(st.run, 'feature-choices')}
    <p class="hint">Diese Wahl(en) bestimmen die konkreten Effekte — nach dem Bestätigen leitet die KI sie ab (z.B. gewährte Zauber, Kampfstil, Expertise).</p>
    <QuestionsPanel {ui} list={ui.choices.baseChoiceQs} />
  {/if}

  {#if isPausedAt(st.run, 'feat-choices')}
    {#if st.featChoices.length}
      <p class="hint">Wahl(en) durch die gewählten Talente — nach dem Bestätigen leitet die KI die Effekte ab.</p>
    {:else}
      <p class="hint">Wahl(en) der gewählten Talente — Liste, Attribut und Anzahl stehen in der Bibliothek, hier wird nur ausgewählt.</p>
    {/if}
    <QuestionsPanel {ui} list={ui.choices.featChoiceQs} />
  {/if}

  {#if isPausedAt(st.run, 'player-decisions')}
    <PlayerDecisionsPanel {ui} />
  {/if}

  {#if isPausedAt(st.run, 'feat-choice')}
    <FeatChoicePanel {ui} />
  {/if}

  {#if isPausedAt(st.run, 'class-features')}
    <ClassFeaturesPanel {ui} />
  {/if}

  <SpellCreatorPanel {ui} />

  {#if isPausedAt(st.run, 'review')}
    <ReviewPanel {ui} />
  {/if}

  {#if st.run.kind === 'error'}<p class="hint err">{st.run.message}</p>{/if}

  <div class="actions">
    {#if st.run.kind === 'running'}
      <button class="secondary-btn" onclick={run.stop}>Abbrechen</button>
    {:else if isPausedAt(st.run, 'choose-class')}
      <button class="secondary-btn" onclick={onclose}>Schließen</button>
      <button class="primary-btn" onclick={() => ui.startFlow()}
              disabled={(ui.isNewClass && !ui.newClassKey) || (!ui.isNewClass && ui.effectiveFrom >= 20)}>Weiter</button>
    {:else if isPausedAt(st.run, 'subclass-choice')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => st.chosenSubclass && run.chooseSubclass(st.chosenSubclass.key, st.chosenSubclass.name)} disabled={!st.chosenSubclass}>Weiter</button>
    {:else if isPausedAt(st.run, 'feature-choices')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('feature-choices')} disabled={!run.choices.allBaseAnswered}>Weiter</button>
    {:else if isPausedAt(st.run, 'player-decisions')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('player-decisions')} disabled={!ui.allAnswered}>Weiter</button>
    {:else if isPausedAt(st.run, 'feat-choice')}
      <button class="secondary-btn" onclick={onclose}>Abbrechen</button>
      <button class="primary-btn" onclick={() => run.resume('feat-choice')} disabled={st.chosenFeats.length !== st.featsToPick}>Weiter</button>
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
  </div><!-- .main -->
  </div><!-- .body -->

  {#if st.delta}
    <details class="json-view">
      <summary>
        <span>JSON-Dokument</span>
        <button type="button" class="link-btn json-copy" onclick={(e) => { e.preventDefault(); ui.copyDoc(); }}>{ui.jsonCopied ? 'Kopiert ✓' : 'Kopieren'}</button>
      </summary>
      <pre class="json">{ui.docJson}</pre>
    </details>
  {/if}
</Modal>

<style>
  .body { display: flex; gap: 1rem; align-items: flex-start; }
  .protocol {
    flex: 0 0 220px; display: flex; flex-direction: column; gap: 0.45rem;
    border-right: 1px solid var(--surface); padding-right: 0.9rem;
    max-height: 66vh; overflow-y: auto;
  }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.7rem; }
  .proto-group { display: flex; flex-direction: column; gap: 0.15rem; }
  .proto-heading { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }

  .json-view { border-top: 1px solid var(--surface); padding-top: 0.5rem; }
  .json-view summary {
    display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--ink-muted); cursor: pointer; user-select: none;
  }
  .json-view summary::-webkit-details-marker { display: none; }
  .json-copy { font-size: 0.7rem; }
  .json {
    margin: 0.5rem 0 0; max-height: 30vh; overflow: auto; white-space: pre;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.72rem; line-height: 1.4; color: var(--ink-soft);
    background: var(--surface); border-radius: 4px; padding: 0.7rem; tab-size: 2;
  }
</style>
