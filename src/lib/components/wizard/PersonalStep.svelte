<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import { ALIGNMENTS } from '../../services/wizard/personal';
  import GlossaryTerm from '../GlossaryTerm.svelte';

  let { w }: { w: CharacterWizard } = $props();

  const QUESTIONS: { field: 'traits' | 'ideals' | 'bonds' | 'flaws' | 'appearance'; label: string; placeholder: string }[] = [
    { field: 'appearance', label: 'Aussehen', placeholder: 'Wie sieht dein Charakter aus? Was fällt anderen zuerst auf?' },
    { field: 'traits', label: 'Persönlichkeitsmerkmale', placeholder: 'Wie verhält sich dein Charakter? Was macht ihn besonders?' },
    { field: 'ideals', label: 'Ideale', placeholder: 'Woran glaubt dein Charakter? Was treibt ihn an?' },
    { field: 'bonds', label: 'Bindungen', placeholder: 'Welche Menschen, Orte oder Dinge sind ihm wichtig?' },
    { field: 'flaws', label: 'Makel', placeholder: 'Welche Schwäche oder Angst hat er?' },
  ];
</script>

<p class="hint">Den Namen deines Charakters trägst du oben in der Titelzeile ein.</p>
<label class="field">
  <span>Spielername (optional)</span>
  <input type="text" bind:value={w.playerName} placeholder="Spielername" />
</label>

<div class="field">
  <span><GlossaryTerm term="Gesinnung" /> (optional)</span>
  <div class="align-grid">
    {#each ALIGNMENTS as a}
      <button type="button" class="align" class:sel={w.alignment === a.label}
              onclick={() => (w.alignment = w.alignment === a.label ? '' : a.label)}>
        <strong>{a.label}</strong>
        <span>{a.hint}</span>
      </button>
    {/each}
  </div>
</div>

<p class="hint">Alles Weitere ist optional und landet auf deinem Charakterbogen — du kannst es jederzeit im Bearbeiten-Modus ändern.</p>
{#each QUESTIONS as q}
  <label class="field">
    <span>{q.label}</span>
    <textarea rows="2" bind:value={w[q.field]} placeholder={q.placeholder}></textarea>
  </label>
{/each}

<style>
  .align-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }
  .align {
    display: flex; flex-direction: column; gap: 0.15rem; text-align: left; cursor: pointer;
    background: var(--surface); color: var(--ink); border: 1px solid var(--border); border-radius: 6px;
    padding: 0.4rem 0.55rem; font: inherit; font-size: 0.8rem;
  }
  .align span { color: var(--ink-soft); font-size: 0.74rem; }
  .align.sel { border-color: var(--arcane, var(--gold)); box-shadow: inset 0 0 0 1px var(--arcane, var(--gold)); }
</style>
