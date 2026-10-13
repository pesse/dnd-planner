<script lang="ts">
  import './wizard.css';
  import type { ClassProgression } from '$lib/types';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import { ABILITY_LABEL, ABILITY_LABEL_BY_NAME, abilityKeyOf } from '$lib/schemas/abilities';
  import { ABILITY_KEYS, STANDARD_ARRAY, isStandardArray, type AbilityKey, type AbilityScores } from '../../services/wizard/pointBuy';
  import { mod } from '$lib/domain/skills';
  import { sign } from '$lib/utils/num';
  import PointBuyBlock from './PointBuyBlock.svelte';
  import GlossaryTerm from '../GlossaryTerm.svelte';

  let { w, klass }: { w: CharacterWizard; klass: ClassProgression | null } = $props();

  const primary = $derived(
    (klass?.overview?.primaryAbilities ?? []).map((a) => abilityKeyOf(a)).filter((k): k is AbilityKey => !!k),
  );

  function recommended(): AbilityScores {
    if (klass?.standardArray) return { ...klass.standardArray };
    const s = {} as AbilityScores;
    ABILITY_KEYS.forEach((k, i) => (s[k] = STANDARD_ARRAY[i]));
    return s;
  }

  // Der Standardsatz bleibt immer eine Permutation — ein Wechsel tauscht zwei Werte.
  $effect(() => {
    if (w.abilityMethod === 'standard' && !isStandardArray(w.scores)) w.scores = recommended();
  });

  function assign(key: AbilityKey, value: number) {
    const other = ABILITY_KEYS.find((k) => k !== key && w.scores[k] === value);
    w.scores = { ...w.scores, [key]: value, ...(other ? { [other]: w.scores[key] } : {}) };
  }
</script>

<p class="hint">
  Sechs Attribute beschreiben deinen Charakter. Am wichtigsten ist das
  <GlossaryTerm term="Hauptattribut" /> deiner Klasse{#if klass?.overview}: <strong>{klass.overview.primaryAbilities.map((a) => ABILITY_LABEL_BY_NAME[a]).join(klass.overview.primaryJoin === 'and' ? ' und ' : ' oder ')}</strong>{/if}.
</p>

<div class="chips" role="radiogroup" aria-label="Methode">
  <button class="chip" class:sel={w.abilityMethod === 'standard'} onclick={() => (w.abilityMethod = 'standard')}>
    <GlossaryTerm term="Standardsatz" />
  </button>
  <button class="chip" class:sel={w.abilityMethod === 'pointBuy'} onclick={() => (w.abilityMethod = 'pointBuy')}>
    <GlossaryTerm term="Punktekauf" />
  </button>
</div>

{#if w.abilityMethod === 'standard'}
  <div class="std">
    {#each ABILITY_KEYS as key}
      <label class="std-row" class:primary={primary.includes(key)}>
        <span class="std-label">{ABILITY_LABEL[key]}{#if primary.includes(key)} <span class="star" title="Hauptattribut">★</span>{/if}</span>
        <select value={w.scores[key]} onchange={(e) => assign(key, Number(e.currentTarget.value))}>
          {#each STANDARD_ARRAY as v}<option value={v}>{v}</option>{/each}
        </select>
        <span class="std-mod">{sign(mod(w.scores[key]))}</span>
      </label>
    {/each}
  </div>
  <button class="secondary" onclick={() => (w.scores = recommended())}>
    Empfohlene Verteilung{klass ? ` für ${klass.nameDe || klass.name}` : ''}
  </button>
{:else}
  <PointBuyBlock bind:scores={w.scores} />
{/if}

<style>
  .std { display: flex; flex-direction: column; gap: 0.4rem; max-width: 22rem; }
  .std-row { display: grid; grid-template-columns: 1fr 5rem 2.5rem; align-items: center; gap: 0.5rem; }
  .std-row.primary .std-label { font-weight: 700; }
  .star { color: var(--arcane, var(--gold)); }
  .std-mod { text-align: right; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
</style>
