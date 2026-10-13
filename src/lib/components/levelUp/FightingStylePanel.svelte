<script lang="ts">
  import './levelUp.css';
  import FeatPicker from '../FeatPicker.svelte';
  import TooltipSelect, { type TooltipOption } from '../TooltipSelect.svelte';
  import { pickableFeats, type FightingStyleOption } from '$lib/services/fightingStyle';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
  const offer = $derived(st.styleOffer);

  function toggleStyle(key: string) {
    st.chosenStyles = st.chosenStyles.includes(key)
      ? st.chosenStyles.filter((k) => k !== key)
      : [...st.chosenStyles, key];
  }

  const swapAt = (i: number) => st.styleSwaps[i] ?? { from: '', to: '' };

  function setSwap(i: number, part: 'from' | 'to', value: string) {
    const next = [...st.styleSwaps];
    while (next.length <= i) next.push({ from: '', to: '' });
    next[i] = { ...next[i], [part]: value };
    st.styleSwaps = next;
  }

  /** Was wählbar und weder neu gewählt noch Ziel eines anderen Tauschs ist. */
  const freeTargets = (i: number) =>
    pickableFeats(offer?.options ?? [], st.ownedFeats).filter(
      (o) => !st.chosenStyles.includes(o.sourceKey) && !st.styleSwaps.some((s, j) => j !== i && s.to === o.sourceKey),
    );

  const asOptions = (empty: string, opts: FightingStyleOption[]): TooltipOption[] => [
    { value: '', label: empty },
    ...opts.map((o) => ({ value: o.sourceKey, label: o.name, tooltip: o.desc })),
  ];
</script>

{#if offer}
  {#if offer.allowance > 0}
    <FeatPicker
      offer={offer}
      heading="Kampfstil — {offer.allowance} neu"
      missingHint="Talente brauchen die Kategorie „Kampfstil“ (vault/feats)."
      selected={st.chosenStyles}
      owned={st.ownedFeats}
      onToggle={toggleStyle}
    />
  {/if}
  {#each Array.from({ length: offer.swaps }) as _, i}
    {@const swap = swapAt(i)}
    <div class="row">
      <span class="field-label">Kampfstil tauschen<span class="field-hint"> (optional)</span></span>
      <TooltipSelect
        options={asOptions('— behalten —', offer.owned.filter((o) => o.sourceKey === swap.from || !st.styleSwaps.some((s) => s.from === o.sourceKey)))}
        selected={swap.from ? [swap.from] : []}
        placeholder="— behalten —"
        onchange={(next) => setSwap(i, 'from', next[0] ?? '')}
      />
      {#if swap.from}
        <TooltipSelect
          options={asOptions('— ersetzen durch —', freeTargets(i))}
          selected={swap.to ? [swap.to] : []}
          placeholder="— ersetzen durch —"
          onchange={(next) => setSwap(i, 'to', next[0] ?? '')}
        />
      {/if}
    </div>
  {/each}
{/if}
