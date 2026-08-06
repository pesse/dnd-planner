<script lang="ts">
  /**
   * Der Anlage-Dialog hinter `SpellPickModal`s `allowCreate` — für Aufrufer, die den
   * Zauber nicht (wie `LevelUpAssistant`) selbst in ein Panel einbetten, weil er dort an
   * zwei verschiedene Ziele schreibt (Frage vs. gewährter Zauber). Hier gibt es nur EIN
   * Ziel: den kanonischen Namen an den Aufrufer zurückreichen.
   */
  import { blankSpell, createSpellInline } from '../spellLibrary';
  import { SPELL_SCHOOLS } from '../types';
  import Modal from './ui/Modal.svelte';

  let { name, levels, onclose, oncreated }: {
    /** Die Sucheingabe, mit der „als neuen Zauber anlegen" ausgelöst wurde. */
    name: string;
    /** Die Grade, die der auslösende Picker zulässt. */
    levels: number[];
    onclose: () => void;
    oncreated: (canonicalName: string, level: number) => void;
  } = $props();

  const SCHOOL_KEYS = Object.keys(SPELL_SCHOOLS);
  const pickLevels = levels.length ? levels : [1];

  let nameDe = $state(name.trim());
  // Der auslösende Name ist oft der englische Bibliotheks- oder KI-Vorschlag — als
  // `name_en` vormerken, damit künftige EN↔DE-Treffer greifen.
  let nameEn = $state(name.trim());
  let level = $state(pickLevels[0]);
  let school = $state<keyof typeof SPELL_SCHOOLS>('evocation');
  let creating = $state(false);
  let error = $state('');

  async function save() {
    if (creating || !nameDe.trim()) return;
    creating = true;
    error = '';
    try {
      const canonical = await createSpellInline(blankSpell(nameDe, level, school, nameEn));
      oncreated(canonical, level);
      onclose();
    } catch (e) {
      error = `Zauber konnte nicht angelegt werden: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      creating = false;
    }
  }
</script>

<Modal title="Neuen Zauber anlegen" draggable={false} width="min(420px, 92vw)" {onclose}>
  <label class="field">Deutscher Name
    <input class="input" bind:value={nameDe} />
  </label>
  <label class="field">Englischer Name (für Matching, optional)
    <input class="input" bind:value={nameEn} />
  </label>
  <div class="row">
    <label class="field">Grad
      <select class="select" bind:value={level}>
        {#each pickLevels as lv}<option value={lv}>{lv === 0 ? 'Zaubertrick' : `Grad ${lv}`}</option>{/each}
      </select>
    </label>
    <label class="field">Schule
      <select class="select" bind:value={school}>
        {#each SCHOOL_KEYS as sk}<option value={sk}>{SPELL_SCHOOLS[sk as keyof typeof SPELL_SCHOOLS]}</option>{/each}
      </select>
    </label>
  </div>
  {#if error}<p class="field-hint err">{error}</p>{/if}
  <p class="field-hint">Wird in der Zauber-Bibliothek gespeichert.</p>
  <div class="actions">
    <button type="button" class="secondary-btn" onclick={onclose}>Abbrechen</button>
    <button type="button" class="primary-btn" onclick={save} disabled={creating || !nameDe.trim()}>
      {creating ? 'Speichert…' : 'Zauber anlegen'}
    </button>
  </div>
</Modal>

<style>
  .field { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.78rem; color: var(--ink-soft); margin-bottom: 0.5rem; }
  .row { display: flex; gap: 0.6rem; }
  .row .field { flex: 1; }
  .field-hint { font-size: 0.75rem; color: var(--ink-muted); margin: 0 0 0.5rem; }
  .field-hint.err { color: var(--danger); }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
