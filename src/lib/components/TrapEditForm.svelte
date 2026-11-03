<script lang="ts">
  import { TRAP_SEVERITIES, type Trap, type TrapCheck } from '$lib/schemas/trap';
  import { ABILITY_KEYS, ABILITY_LABEL } from '$lib/schemas/abilities';
  import { DAMAGE_TYPES, SKILL_NAMES } from '$lib/schemas/vocabulary';
  import { skillLabelDe } from '$lib/domain/skills';
  import { DAMAGE_TYPE_LABELS } from '$lib/itemLabels';
  import FormSection from './ui/FormSection.svelte';
  import OriginalText from './ui/OriginalText.svelte';
  import LibraryFormHeader from './ui/LibraryFormHeader.svelte';

  let {
    trap = $bindable<Trap>(),
    onchange = () => void 0,
  }: {
    trap: Trap;
    onchange?: () => void;
  } = $props();

  function mark() { onchange(); }

  const SEVERITY_KEYS = Object.keys(TRAP_SEVERITIES) as (keyof typeof TRAP_SEVERITIES)[];

  function toggleSave() {
    trap.save = trap.save ? undefined : { ability: 'dex', dc: 12 };
    mark();
  }
</script>

{#snippet checks(list: TrapCheck[], title: string)}
  <FormSection {title}>
    {#each list as c, i (i)}
      <div class="row">
        <select class="ef" bind:value={c.skill} onchange={mark} aria-label="Fertigkeit">
          <option value={undefined}>—</option>
          {#each SKILL_NAMES as s (s)}<option value={s}>{skillLabelDe(s)}</option>{/each}
        </select>
        <label class="lbl-inline">SG <input class="ef num" type="number" bind:value={c.dc} oninput={mark} /></label>
        <input class="ef grow" bind:value={c.noteDe} oninput={mark} placeholder="woran (DE), z. B. Druckplatte" />
        <button class="del" title="Entfernen" onclick={() => { list.splice(i, 1); mark(); }}>✕</button>
      </div>
    {/each}
    <button class="add" onclick={() => { list.push({ skill: 'Perception', dc: 12 }); mark(); }}>+ Wurf</button>
  </FormSection>
{/snippet}

<LibraryFormHeader bind:nameDe={trap.nameDe} bind:name={trap.name} onchange={mark}>
  {#snippet meta()}
    <label class="lbl-inline">Gefahr
      <select class="ef" bind:value={trap.severity} onchange={mark}>
        {#each SEVERITY_KEYS as s (s)}<option value={s}>{TRAP_SEVERITIES[s]}</option>{/each}
      </select>
    </label>
    <label class="lbl-inline">Stufen
      <input class="ef num-wide" bind:value={trap.levels} oninput={mark} placeholder="1–4" />
    </label>
    <label class="lbl-inline">Schlüssel
      <input class="ef key-input" bind:value={trap.key} oninput={mark} placeholder="z.B. srd-2024_hidden-pit" />
    </label>
  {/snippet}
</LibraryFormHeader>

<FormSection title="Auslöser">
  <textarea class="ef text" rows={2} bind:value={trap.triggerDe} oninput={mark} placeholder="Auslöser (DE)"></textarea>
  {#if trap.trigger}<OriginalText text={trap.trigger} />{/if}
</FormSection>

<FormSection title="Rettungswurf und Schaden">
  <div class="row">
    <label class="lbl-inline"><input type="checkbox" checked={!!trap.save} onchange={toggleSave} /> Rettungswurf</label>
    {#if trap.save}
      <select class="ef" bind:value={trap.save.ability} onchange={mark} aria-label="Attribut">
        {#each ABILITY_KEYS as a (a)}<option value={a}>{ABILITY_LABEL[a]}</option>{/each}
      </select>
      <label class="lbl-inline">SG <input class="ef num" type="number" bind:value={trap.save.dc} oninput={mark} /></label>
    {/if}
  </div>
  {#each trap.damage as d, i (i)}
    <div class="row">
      <input class="ef num-wide" bind:value={d.dice} oninput={mark} placeholder="2d10" aria-label="Würfel" />
      <select class="ef" bind:value={d.type} onchange={mark} aria-label="Schadensart">
        {#each DAMAGE_TYPES as t (t)}<option value={t}>{DAMAGE_TYPE_LABELS[t]}</option>{/each}
      </select>
      <button class="del" title="Entfernen" onclick={() => { trap.damage.splice(i, 1); mark(); }}>✕</button>
    </div>
  {/each}
  <button class="add" onclick={() => { trap.damage.push({ dice: '1d10', type: 'bludgeoning' }); mark(); }}>+ Schaden</button>
</FormSection>

{@render checks(trap.detect, 'Entdecken')}
{@render checks(trap.disarm, 'Entschärfen')}

<FormSection title="Beschreibung (Deutsch)">
  <textarea class="ef text" rows={10} bind:value={trap.descDe} oninput={mark} placeholder="Wirkung, Dauer, Gegenmaßnahmen (DE)"></textarea>
  {#if trap.desc}<OriginalText text={trap.desc} />{/if}
  <p class="hint">Höhere Stufen stehen als <code>tiers</code> im JSON-Tab.</p>
</FormSection>

<style>
  .text { width: 100%; resize: vertical; line-height: 1.5; font-size: 0.85rem; min-height: 2.5rem; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem; }
  .num { width: 3.5rem; }
  .num-wide { width: 5rem; }
  .grow { flex: 1; min-width: 8rem; }
  .del, .add { font-size: 0.75rem; padding: 0.1rem 0.45rem; }
  .hint { margin: 0.3rem 0 0; font-size: 0.75rem; color: var(--ink-muted); }
</style>
