<script lang="ts">
  /**
   * Editor der unbedingten Mechanik einer Deklaration; die Übungen übernimmt
   * `ProficiencyGrantEditForm`, es ist dieselbe Form wie an Klasse und Hintergrund.
   *
   * „Gewährt überhaupt etwas?" gehört NICHT hierher — das ist die Unterscheidung zwischen
   * fehlendem Feld („nie angesehen") und `{}` („geprüft"), die nur der Aufrufer treffen
   * kann. Diese Komponente bekommt immer ein vorhandenes Objekt.
   */
  import { MONSTER_SIZES, MONSTER_SIZE_KEYS, type MonsterSize } from '$lib/schemas/vocabulary';
  import { type FeatureGrant } from '$lib/schemas/grants';
  import { characterPropertyLabelDe } from '$lib/services/characterProperties';
  import ProficiencyGrantEditForm from './ProficiencyGrantEditForm.svelte';

  let {
    grant = $bindable<FeatureGrant>(),
    scope = 'full',
    onchange = () => void 0,
  }: {
    grant: FeatureGrant;
    scope?: 'full' | 'skills';
    onchange?: () => void;
  } = $props();

  function mark() {
    onchange();
  }

  // Leere Auswahl heißt „legt die Eigenschaft nicht fest" — das Feld verschwindet dann, statt
  // einen Wert vorzutäuschen (dieselbe Unterscheidung wie fehlendes `grants` gegen `{}`).
  function setSize(value: string) {
    grant.properties.size = value ? (value as MonsterSize) : undefined;
    onchange();
  }

  function setSpeed(value: string) {
    const feet = parseInt(value, 10);
    grant.properties.speedFeet = Number.isFinite(feet) && feet > 0 ? feet : undefined;
    onchange();
  }
</script>

<div class="grant-block">
  <div class="num-row">
    <label class="lbl-inline" title="Zusätzlich FREI wählbare Zaubertricks">Zaubertricks +
      <input class="ef num" type="number" min="0" bind:value={grant.extraCantrips} oninput={mark} />
    </label>
    <label class="lbl-inline" title="Zusätzlich vorbereitbare Zauber über die Stufentabelle hinaus">Vorbereitet +
      <input class="ef num" type="number" min="0" bind:value={grant.extraPreparedCount} oninput={mark} />
    </label>
    <label class="lbl-inline" title="Zunahme des TP-Maximums JE Charakterstufe (Zwergische Zähigkeit +1, Zäh +2)">TP je Stufe +
      <input class="ef num" type="number" min="0" bind:value={grant.perLevel.hpMax} oninput={mark} />
    </label>
  </div>

  <div class="sub-title">Grundeigenschaften</div>
  <div class="num-row">
    <label class="lbl-inline" title="Größenkategorie, die dieses Merkmal FESTLEGT. Zur Wahl gestellt wird sie über „Gewährt Wahl“ → Grundeigenschaft.">
      {characterPropertyLabelDe('size')}
      <select class="ef sel" value={grant.properties.size ?? ''} onchange={(e) => setSize((e.target as HTMLSelectElement).value)}>
        <option value="">—</option>
        {#each MONSTER_SIZE_KEYS as size}
          <option value={size}>{MONSTER_SIZES[size]}</option>
        {/each}
      </select>
    </label>
    <label class="lbl-inline" title="Grundbewegungsrate in Fuß (Regeltext-Einheit); der Bogen zeigt Meter.">
      {characterPropertyLabelDe('speedFeet')} (ft)
      <input
        class="ef num" type="number" min="0" step="5"
        value={grant.properties.speedFeet ?? ''}
        oninput={(e) => setSpeed((e.target as HTMLInputElement).value)}
      />
    </label>
  </div>

  <div class="sub-title">Übungen</div>
  <ProficiencyGrantEditForm bind:grant={grant.proficiencies} {scope} {onchange} />
</div>

<style>
  .num { width: 56px; text-align: center; }

  .grant-block { display: flex; flex-direction: column; gap: 0.3rem; }
  .num-row { display: flex; flex-wrap: wrap; gap: 0.7rem; }
  .sub-title {
    font-size: 0.78rem; font-weight: 700; color: var(--ink-soft);
    text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.45rem;
  }
</style>
