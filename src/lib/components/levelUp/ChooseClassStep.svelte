<script lang="ts">
  import './levelUp.css';
  import { classDisplayName } from '$lib/classLibrary';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
</script>

<div class="row">
  <span class="field-label">Welche Klasse steigt auf?</span>
  <select class="select" value={ui.classChoice} onchange={(e) => (ui.classChoice = (e.target as HTMLSelectElement).value)}>
    {#each ui.classList as c, i}
      <option value={String(i)}>{c.name} {c.level}{c.subclassName ? ` (${c.subclassName})` : ''}</option>
    {/each}
    <option value="new">➕ Neue Klasse (Multiclassing)</option>
  </select>
</div>

{#if ui.isNewClass}
  <div class="row">
    <span class="field-label">Neue Klasse</span>
    <select class="select" value={ui.newClassKey} onchange={(e) => ui.selectNewClass((e.target as HTMLSelectElement).value)}>
      <option value="">— Klasse wählen —</option>
      {#each ui.libClasses as lc}
        <option value={lc.key}>{classDisplayName(lc)}</option>
      {/each}
    </select>
    {#if !ui.libClasses.length}<span class="field-hint">Klassen-Bibliothek wird geladen…</span>{/if}
  </div>
{/if}

<div class="row">
  <span class="field-label">Zielstufe</span>
  {#if !ui.isNewClass && ui.effectiveFrom >= 20}
    <p class="hint warn">{ui.classList[ui.classIndex]?.name} ist bereits auf Stufe 20.</p>
  {:else}
    <input class="input" type="number" min={ui.effectiveFrom + 1} max="20" value={ui.targetLevel}
           oninput={(e) => (ui.targetLevel = Number((e.target as HTMLInputElement).value))} />
    <span class="field-hint">
      {ui.isNewClass
        ? `Neue Klasse startet auf Stufe ${ui.targetLevel}`
        : `von Stufe ${ui.effectiveFrom} → ${ui.targetLevel} (${ui.targetLevel - ui.effectiveFrom === 1 ? 'eine Stufe' : `${Math.max(0, ui.targetLevel - ui.effectiveFrom)} Stufen`})`}
    </span>
  {/if}
</div>
