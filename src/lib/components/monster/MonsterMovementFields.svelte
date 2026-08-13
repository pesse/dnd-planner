<script lang="ts">
  import type { Monster } from '../../types';
  import { ftToM } from '../../itemFormat';
  import './monsterEditForm.css';

  let { monster, onchange }: { monster: Monster; onchange: () => void } = $props();

  const SPEEDS = [
    { key: 'walk', label: 'Gehen' },
    { key: 'fly', label: 'Fliegen' },
    { key: 'swim', label: 'Schwimmen' },
    { key: 'climb', label: 'Klettern' },
    { key: 'burrow', label: 'Graben' },
  ] as const;

  const SENSES = [
    { key: 'darkvision', label: 'Dunkelsicht' },
    { key: 'blindsight', label: 'Blindsicht' },
    { key: 'tremorsense', label: 'Erschütterung' },
    { key: 'truesight', label: 'Wahre Sicht' },
  ] as const;

  const languageText = $derived(monster.languages.join(', '));
</script>

<div class="section">
  <div class="prop">
    <span class="lbl">Bewegung</span>
    <div class="ft-grid">
      {#each SPEEDS as { key, label }}
        <label class="ft-cell">
          <span class="ft-lbl">{label}</span>
          <input class="ef ft-in" type="number" step="5" bind:value={monster.speed[key]} oninput={onchange} />
          <span class="ft-m">{monster.speed[key] ? ftToM(monster.speed[key]) : ''}</span>
        </label>
      {/each}
      <label class="ft-cell hover">
        <input type="checkbox" bind:checked={monster.speed.hover} onchange={onchange} />
        <span class="ft-lbl">schwebt</span>
      </label>
    </div>
  </div>

  <div class="prop">
    <span class="lbl">Sinne</span>
    <div class="ft-grid">
      {#each SENSES as { key, label }}
        <label class="ft-cell">
          <span class="ft-lbl">{label}</span>
          <input class="ef ft-in" type="number" step="5" bind:value={monster.senses[key]} oninput={onchange} />
          <span class="ft-m">{monster.senses[key] ? ftToM(monster.senses[key]) : ''}</span>
        </label>
      {/each}
    </div>
  </div>

  <div class="prop">
    <span class="lbl">Sprachen</span>
    <input class="ef wide" value={languageText}
      oninput={(e) => { monster.languages = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean); onchange(); }}
      placeholder="Gemeinsprache, Goblin" />
  </div>
  <div class="prop">
    <span class="lbl">Zusatz</span>
    <input class="ef wide" bind:value={monster.languages_desc} oninput={onchange}
      placeholder="z.B. Telepathie 36 m; versteht alles, spricht nicht" />
  </div>
</div>

<style>
  /* Gespeichert wird in Fuß, die Meterangabe daneben ist nur Anzeige. */
  .ft-grid { display: flex; flex-wrap: wrap; gap: 0.4rem; }

  .ft-cell { display: flex; align-items: center; gap: 0.15rem; }

  .ft-lbl {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--mef-accent, var(--danger));
    opacity: 0.75;
    white-space: nowrap;
  }

  .ft-in { width: 48px; text-align: center; font-size: 0.82rem; }

  .ft-m { font-size: 0.72rem; color: var(--ink-soft); min-width: 2.8rem; }

  .hover { gap: 0.25rem; }
</style>
