<script lang="ts">
  import './levelUp.css';
  import { SPELL_SCHOOLS } from '$lib/types';
  import { SCHOOL_KEYS, type LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
</script>

{#if ui.spellCreator}
  <div class="creator">
    <span class="field-label">Neuen Zauber anlegen</span>
    <input class="input" placeholder="Deutscher Name" value={ui.spellCreator.name} oninput={(e) => (ui.spellCreator!.name = (e.target as HTMLInputElement).value)} />
    <input class="input" placeholder="Englischer Name (für Matching, optional)" value={ui.spellCreator.nameEn} oninput={(e) => (ui.spellCreator!.nameEn = (e.target as HTMLInputElement).value)} />
    <div class="row two">
      <select class="select" value={String(ui.spellCreator.level)} onchange={(e) => (ui.spellCreator!.level = Number((e.target as HTMLSelectElement).value))}>
        {#each ui.spellCreator.levels as lv}<option value={String(lv)}>{lv === 0 ? 'Zaubertrick' : `Grad ${lv}`}</option>{/each}
      </select>
      <select class="select" value={ui.spellCreator.school} onchange={(e) => (ui.spellCreator!.school = (e.target as HTMLSelectElement).value)}>
        {#each SCHOOL_KEYS as sk}<option value={sk}>{SPELL_SCHOOLS[sk as keyof typeof SPELL_SCHOOLS]}</option>{/each}
      </select>
    </div>
    <div class="actions">
      <button class="secondary-btn" onclick={() => (ui.spellCreator = null)}>Abbrechen</button>
      <button class="primary-btn" onclick={() => ui.saveInlineSpell()} disabled={ui.creatingSpell || !ui.spellCreator.name.trim()}>{ui.creatingSpell ? 'Speichert…' : 'Zauber anlegen'}</button>
    </div>
    <span class="field-hint">Wird in der Zauber-Bibliothek gespeichert; der Dialog bleibt offen.</span>
  </div>
{/if}
