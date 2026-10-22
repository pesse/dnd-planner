<script lang="ts">
  import '../wizard/wizard.css';
  import './levelUp.css';
  import { classTileFacts } from '../libraryView/classView';
  import { originArtCandidates, slugOf } from '../../services/wizard/originArt';
  import ChoiceGroup from '../wizard/ChoiceGroup.svelte';
  import ChoiceOption from '../wizard/ChoiceOption.svelte';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();

  /** Nur das Bild dieser Klasse — der Rückfall aufs Volksbild sähe in jeder Zeile gleich aus. */
  const classArt = (classKey: string): string[] =>
    classKey
      ? originArtCandidates('class', {
          classKey, speciesKey: ui.character.species.sourceKey, backgroundKey: '', presentation: ui.character.presentation,
        }).filter((u) => u.includes(slugOf(classKey)))
      : [];

  const owned = $derived(new Set(ui.classList.map((c) => c.sourceKey)));
  const newClasses = $derived(ui.baseClasses.filter((c) => !owned.has(c.key)));
</script>

<p class="hint">Wähle die Klasse, die eine Stufe aufsteigt — oder nimm eine neue hinzu (Multiclassing).</p>

<ChoiceGroup heading="Klasse">
  {#each ui.classList as c, i}
    <ChoiceOption title={c.name} subtitle="Stufe {c.level}{c.subclassName ? ` · ${c.subclassName}` : ''}"
      selected={ui.classChoice === String(i)} art={classArt(c.sourceKey ?? '')}
      onselect={() => (ui.classChoice = String(i))} />
  {/each}
  <ChoiceOption title="Neue Klasse" subtitle="Multiclassing" selected={ui.isNewClass} onselect={() => (ui.classChoice = 'new')} />
</ChoiceGroup>

{#if ui.isNewClass}
  <ChoiceGroup heading="Neue Klasse">
    {#if !ui.baseClasses.length}<p class="hint">Lade Bibliothek …</p>{/if}
    {#each newClasses as c (c.key)}
      {@const facts = classTileFacts(c)}
      <ChoiceOption title={c.nameDe || c.name} subtitle={facts.subtitle} tags={facts.tags}
        selected={ui.newClassKey === c.key} art={classArt(c.key)} onselect={() => ui.selectNewClass(c.key)} />
    {/each}
  </ChoiceGroup>
{/if}

<div class="field">
  <span>Zielstufe</span>
  {#if !ui.isNewClass && ui.effectiveFrom >= 20}
    <p class="warn">{ui.classList[ui.classIndex]?.name} ist bereits auf Stufe 20.</p>
  {:else}
    <input type="number" min={ui.effectiveFrom + 1} max="20" value={ui.targetLevel}
           oninput={(e) => (ui.targetLevel = Number((e.target as HTMLInputElement).value))} />
    <p class="hint">
      {ui.isNewClass
        ? `Neue Klasse startet auf Stufe ${ui.targetLevel}`
        : `von Stufe ${ui.effectiveFrom} → ${ui.targetLevel} (${ui.targetLevel - ui.effectiveFrom === 1 ? 'eine Stufe' : `${Math.max(0, ui.targetLevel - ui.effectiveFrom)} Stufen`})`}
    </p>
  {/if}
</div>
