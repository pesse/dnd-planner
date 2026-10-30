<script lang="ts">
  /** Was an einer Inventarzeile entschieden wird: Resistenz, Ausprägung, beim Fund ausgewürfelte Vorräte. */
  import type { Character } from '../../schemas/characterSchema';
  import type { DamageType } from '../../schemas/vocabulary';
  import type { ItemInfo } from '../../itemLibrary';
  import { DAMAGE_TYPE_LABELS } from '../../itemLabels';
  import { diceDe, parseDice, throwDice, type DiceFormula, type DiceThrow } from '../../utils/dice';
  import Die from '../ui/die/Die.svelte';

  let { lib, line }: { lib: ItemInfo; line: Character['inventory'][number] } = $props();

  const rolledPools = $derived((lib.grantsResource?.pools ?? []).flatMap((p) => {
    const formula = p.rolled ? parseDice(p.rolled) : null;
    return formula ? [{ id: p.id, labelDe: p.labelDe || 'Ladungen', formula }] : [];
  }));

  /** Nur der Wurf dieser Sitzung wird als Würfel gezeigt; gespeichert ist allein die Summe. */
  let throws: Record<string, DiceThrow & { n: number }> = $state({});

  function roll(id: string, formula: DiceFormula): void {
    throws[id] = { ...throwDice(formula), n: (throws[id]?.n ?? 0) + 1 };
    line.rolled = { ...line.rolled, [id]: throws[id].total };
  }
</script>

{#if lib.resistanceChoice}
  <select class="inv-choice" class:inv-unchosen={!line.resistance} value={line.resistance ?? ''}
    title="Resistenz, die der Gegenstand angelegt gewährt"
    onchange={(e) => { line.resistance = (e.currentTarget.value || undefined) as DamageType | undefined; }}>
    <option value="">Resistenz wählen …</option>
    {#each lib.resistanceChoice.types as t (t)}<option value={t}>{DAMAGE_TYPE_LABELS[t]}</option>{/each}
  </select>
{/if}
{#if lib.optionChoice}
  <select class="inv-choice" class:inv-unchosen={!line.option} value={line.option ?? ''}
    title={lib.optionChoice.labelDe}
    onchange={(e) => { line.option = e.currentTarget.value || undefined; }}>
    <option value="">{lib.optionChoice.labelDe} wählen …</option>
    {#each lib.optionChoice.options as o (o.value)}<option value={o.value}>{o.labelDe}</option>{/each}
  </select>
{/if}
{#each rolledPools as p (p.id)}
  {@const value = line.rolled?.[p.id]}
  {#if value === undefined}
    <button type="button" class="inv-roll inv-unchosen" title="{p.labelDe}: beim Fund auswürfeln"
      onclick={() => roll(p.id, p.formula)}>🎲 {p.labelDe} {diceDe(p.formula)}</button>
  {:else}
    <span class="inv-rolled" title="{p.labelDe}: {diceDe(p.formula)} ausgewürfelt">
      {#if throws[p.id]}
        <span class="inv-dice">
          {#each throws[p.id].faces as d, i (i)}<Die sides={d.sides} value={d.value} roll={throws[p.id].n} delay={i * 90} />{/each}
        </span>
      {/if}
      {p.labelDe}: <strong>{value}</strong>
      <button type="button" class="inv-reroll" title="Neu würfeln" onclick={() => roll(p.id, p.formula)}>↻</button>
    </span>
  {/if}
{/each}

<style>
  .inv-choice { width: auto; font-size: 0.8rem; padding: 0 0.2rem; }
  .inv-unchosen { color: var(--danger); }
  .inv-roll { font-size: 0.8rem; padding: 0 0.35rem; }
  .inv-rolled { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.8rem; }
  .inv-dice { display: inline-flex; flex-wrap: wrap; gap: 0.1rem; max-width: 12rem; }
  .inv-dice :global(.die) { width: 2.2rem; height: 2.2rem; }
  .inv-reroll { padding: 0 0.25rem; font-size: 0.75rem; background: none; border: none; color: var(--ink-muted); cursor: pointer; }
</style>
