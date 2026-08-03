<script lang="ts">
  /** Waffenwerte: Kategorie, Schaden, Reichweiten, Eigenschaften, Meisterschaft. */
  import type { Item } from '$lib/types';
  import { DAMAGE_TYPE_LABELS, MASTERY_INFO } from '$lib/itemLabels';
  import { ftToMVal, mToFt } from '$lib/itemFormat';
  import { WEAPON_MASTERIES } from '$lib/schemas/vocabulary';

  let { draft = $bindable(), propsText = $bindable() }: { draft: Item; propsText: string } = $props();
</script>

<div class="prop-row">
  <span class="prop-label">Kategorie</span>
  <div class="inline-row">
    <select class="edit-select" bind:value={draft.weapon_category}>
      <option value="">—</option>
      <option value="Simple">Einfache Waffe</option>
      <option value="Martial">Kriegswaffe</option>
    </select>
    <select class="edit-select" bind:value={draft.weapon_range}>
      <option value="">—</option>
      <option value="Melee">Nahkampf</option>
      <option value="Ranged">Fernkampf</option>
    </select>
  </div>
</div>
<div class="prop-row">
  <span class="prop-label">Schaden</span>
  <div class="damage-inputs">
    <input class="edit-input"
      value={draft.damage?.damage_dice ?? ''}
      oninput={(e) => {
        const v = (e.target as HTMLInputElement).value;
        draft.damage = v ? { damage_dice: v, damage_type: draft.damage?.damage_type ?? { index: '', name: '' } } : undefined;
      }}
      placeholder="z.B. 1d8" />
    <select class="edit-select damage-type-select"
      value={draft.damage?.damage_type.index ?? ''}
      onchange={(e) => {
        const idx = (e.target as HTMLSelectElement).value;
        if (draft.damage) draft.damage.damage_type = { index: idx, name: idx.charAt(0).toUpperCase() + idx.slice(1) };
      }}>
      <option value="">— Typ —</option>
      {#each Object.entries(DAMAGE_TYPE_LABELS) as [idx, label]}
        <option value={idx}>{label}</option>
      {/each}
    </select>
  </div>
</div>
<div class="prop-row">
  <span class="prop-label">Reichweite</span>
  <div class="inline-row">
    <div class="ft-input-wrap">
      <input class="edit-input ft-m-input" type="number" min="0" step="0.5"
        value={draft.range?.normal != null ? ftToMVal(draft.range.normal) : ''}
        oninput={(e) => {
          const m = parseFloat((e.target as HTMLInputElement).value);
          draft.range = m ? { normal: mToFt(m), long: draft.range?.long } : undefined;
        }}
        placeholder="m" />
      <span class="ft-unit">m</span>
    </div>
    <div class="ft-input-wrap">
      <input class="edit-input ft-m-input" type="number" min="0" step="0.5"
        value={draft.range?.long != null ? ftToMVal(draft.range.long) : ''}
        oninput={(e) => {
          const m = parseFloat((e.target as HTMLInputElement).value);
          if (m && draft.range) draft.range = { ...draft.range, long: mToFt(m) };
          else if (draft.range) draft.range = { normal: draft.range.normal };
        }}
        placeholder="m" />
      <span class="ft-unit">m</span>
      <span class="ft-sublabel" title="Maximale Reichweite mit Nachteil auf den Angriffswurf">Nachteil</span>
    </div>
  </div>
</div>
<div class="prop-row">
  <span class="prop-label">Wurfweite</span>
  <div class="inline-row">
    <div class="ft-input-wrap">
      <input class="edit-input ft-m-input" type="number" min="0" step="0.5"
        value={draft.throw_range?.normal != null ? ftToMVal(draft.throw_range.normal) : ''}
        oninput={(e) => {
          const m = parseFloat((e.target as HTMLInputElement).value);
          draft.throw_range = m ? { normal: mToFt(m), long: draft.throw_range?.long ?? 0 } : undefined;
        }}
        placeholder="m" />
      <span class="ft-unit">m</span>
    </div>
    <div class="ft-input-wrap">
      <input class="edit-input ft-m-input" type="number" min="0" step="0.5"
        value={draft.throw_range?.long != null ? ftToMVal(draft.throw_range.long) : ''}
        oninput={(e) => {
          const m = parseFloat((e.target as HTMLInputElement).value);
          if (draft.throw_range) draft.throw_range = { ...draft.throw_range, long: mToFt(m) || 0 };
        }}
        placeholder="m" />
      <span class="ft-unit">m</span>
      <span class="ft-sublabel" title="Maximale Wurfweite mit Nachteil auf den Angriffswurf">Nachteil</span>
    </div>
  </div>
</div>
<div class="prop-row">
  <span class="prop-label">Eigenschaften</span>
  <input class="edit-input" bind:value={propsText} placeholder="kommagetrennt, z.B. Finesse, Light" />
</div>
<div class="prop-row">
  <span class="prop-label" title="Meisterschaftseigenschaft der Waffenart (5e 2024)">Meisterschaft</span>
  <select class="edit-select"
    value={draft.mastery ?? ''}
    onchange={(e) => {
      const v = (e.currentTarget as HTMLSelectElement).value;
      draft.mastery = v ? (v as typeof WEAPON_MASTERIES[number]) : undefined;
    }}>
    <option value="">—</option>
    {#each WEAPON_MASTERIES as m}
      <option value={m}>{MASTERY_INFO[m].nameDe}</option>
    {/each}
  </select>
</div>
{#if draft.mastery}
  <p class="mastery-rule">{MASTERY_INFO[draft.mastery].descDe}</p>
{/if}
<div class="prop-row">
  <span class="prop-label" title="Magischer Bonus auf Angriffs- und Schadenswürfe">Magischer Bonus</span>
  <input class="edit-input" type="number" min="0" step="1"
    value={draft.magic_bonus ?? ''}
    oninput={(e) => {
      const v = (e.target as HTMLInputElement).value;
      draft.magic_bonus = v ? parseInt(v) : undefined;
    }}
    placeholder="z.B. 1 (leer = keiner)" />
</div>

<style>
  .inline-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }

  .ft-input-wrap { display: flex; align-items: center; gap: 0.3rem; }
  .ft-m-input { width: 4.5rem; }
  .ft-unit { font-size: 0.78rem; color: var(--ink-muted); }
  .ft-sublabel {
    font-size: 0.68rem;
    color: var(--border);
    cursor: help;
    border-bottom: 1px dotted var(--border);
  }

  .damage-inputs { display: flex; flex-direction: row; gap: 0.4rem; flex: 1; }
  .damage-inputs .edit-input { flex: 1; min-width: 0; }
  .damage-type-select { flex: 1; min-width: 0; }

  /* Regeltext der gewählten Meisterschaft — linksbündig zur Wertespalte der
     .prop-row (7.5rem Label + 0.5rem gap). */
  .mastery-rule {
    margin: -0.2rem 0 0.1rem 8rem;
    font-size: 0.78rem; line-height: 1.5; font-style: italic; color: var(--ink-muted);
  }
</style>
