<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import { COMMON_LANGUAGE, STANDARD_LANGUAGES, STANDARD_LANGUAGE_PICKS } from '../../services/wizard/personal';

  let { w }: { w: CharacterWizard } = $props();

  function toggle(lang: string) {
    if (w.languages.includes(lang)) w.languages = w.languages.filter((l) => l !== lang);
    else if (w.languages.length < STANDARD_LANGUAGE_PICKS) w.languages = [...w.languages, lang];
  }
</script>

<p class="hint">
  Jeder Charakter spricht die <strong>{COMMON_LANGUAGE}</strong>. Dazu wählst du {STANDARD_LANGUAGE_PICKS} weitere
  Standardsprachen — zum Beispiel die deines Volkes. Merkmale wie die Diebessprache des Schurken kommen automatisch hinzu.
</p>
<div class="chips">
  <span class="chip sel" aria-disabled="true">{COMMON_LANGUAGE}</span>
  {#each STANDARD_LANGUAGES as lang}
    <button class="chip" class:sel={w.languages.includes(lang)} onclick={() => toggle(lang)}
            disabled={!w.languages.includes(lang) && w.languages.length >= STANDARD_LANGUAGE_PICKS}>{lang}</button>
  {/each}
</div>
<p class="hint">Gewählt: {w.languages.length} / {STANDARD_LANGUAGE_PICKS}</p>
