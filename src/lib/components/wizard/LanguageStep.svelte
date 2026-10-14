<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import {
    COMMON_LANGUAGE, RARE_LANGUAGES, STANDARD_LANGUAGES, STANDARD_LANGUAGE_PICKS,
  } from '../../services/wizard/personal';

  let { w }: { w: CharacterWizard } = $props();

  const rarePicked = $derived(w.languages.some((l) => (RARE_LANGUAGES as readonly string[]).includes(l)));

  function toggle(lang: string) {
    if (w.languages.includes(lang)) w.languages = w.languages.filter((l) => l !== lang);
    else if (w.languages.length < STANDARD_LANGUAGE_PICKS) w.languages = [...w.languages, lang];
  }
</script>

{#snippet chip(lang: string)}
  <button class="chip" class:sel={w.languages.includes(lang)} onclick={() => toggle(lang)}
          disabled={!w.languages.includes(lang) && w.languages.length >= STANDARD_LANGUAGE_PICKS}>{lang}</button>
{/snippet}

<p class="hint">
  Jeder Charakter spricht die <strong>{COMMON_LANGUAGE}</strong>. Dazu wählst du {STANDARD_LANGUAGE_PICKS} weitere
  Standardsprachen — zum Beispiel die deines Volkes. Merkmale wie die Diebessprache des Schurken kommen automatisch hinzu.
</p>
<div class="chips">
  <span class="chip sel" aria-disabled="true">{COMMON_LANGUAGE}</span>
  {#each STANDARD_LANGUAGES as lang}{@render chip(lang)}{/each}
</div>
<details class="rare" open={rarePicked}>
  <summary>Seltene Sprachen (mit SL-Absprache)</summary>
  <p class="hint">
    Seltene Sprachen lernt man normalerweise nur über Merkmale. Wähle eine davon nur, wenn deine
    Spielleitung zustimmt — sie zählt dann als eine deiner {STANDARD_LANGUAGE_PICKS} Sprachen.
  </p>
  <div class="chips">
    {#each RARE_LANGUAGES as lang}{@render chip(lang)}{/each}
  </div>
</details>
<p class="hint">Gewählt: {w.languages.length} / {STANDARD_LANGUAGE_PICKS}</p>

<style>
  .rare { margin-top: 0.75rem; }
  .rare summary { cursor: pointer; color: var(--ink-muted); }
</style>
