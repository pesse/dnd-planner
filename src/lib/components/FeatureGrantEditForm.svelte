<script lang="ts">
  /**
   * Editor für einen `featureGrant` — die unbedingte Mechanik einer Deklaration
   * (Übungen, zusätzliche Zaubertricks/Vorbereitungen, Zunahme je Stufe).
   *
   * Bewusst OHNE eigene Übungs-Oberfläche: `proficiencies` ist dieselbe Form wie an
   * Klasse/Hintergrund/Spezies/Talent, also übernimmt sie `ProficiencyGrantEditForm`.
   *
   * Die Entscheidung „gewährt überhaupt etwas?" gehört NICHT hierher: sie ist die
   * Unterscheidung zwischen fehlendem Feld („nie angesehen") und `{}` („geprüft, gewährt
   * nichts"), und die kann nur der Aufrufer treffen, der das Merkmal bzw. die Option hält.
   * Diese Komponente bekommt immer ein vorhandenes Objekt.
   */
  import type { FeatureGrant } from '$lib/schemas/shared';
  import ProficiencyGrantEditForm from './ProficiencyGrantEditForm.svelte';

  let {
    grant = $bindable<FeatureGrant>(),
    scope = 'full',
    onchange = () => void 0,
  }: {
    grant: FeatureGrant;
    /** 'skills' reicht bis in die Übungen durch (Spezies-Merkmal/Talent gewähren nur diese). */
    scope?: 'full' | 'skills';
    onchange?: () => void;
  } = $props();

  function mark() {
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

  <div class="sub-title">Übungen</div>
  <ProficiencyGrantEditForm bind:grant={grant.proficiencies} {scope} {onchange} />
</div>

<style>
  .ef {
    background: var(--bg-panel); border: 1px solid transparent; border-radius: 3px;
    color: var(--ink); font-family: inherit; font-size: 0.88rem; padding: 0.15rem 0.3rem; outline: none;
  }
  .ef:hover { border-color: var(--border); }
  .ef:focus { border-color: var(--mef-accent, var(--arcane)); }
  .num { width: 56px; text-align: center; }

  .grant-block { display: flex; flex-direction: column; gap: 0.3rem; }
  .num-row { display: flex; flex-wrap: wrap; gap: 0.7rem; }
  .lbl-inline {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.8rem; color: var(--ink-soft);
  }
  .sub-title {
    font-size: 0.78rem; font-weight: 700; color: var(--ink-soft);
    text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.45rem;
  }
</style>
