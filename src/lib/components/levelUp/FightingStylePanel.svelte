<script lang="ts">
  import './levelUp.css';
  import FeatPicker from '../FeatPicker.svelte';
  import { pickableFeats } from '$lib/services/fightingStyle';
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
      <select class="select" value={swap.from} onchange={(e) => setSwap(i, 'from', (e.target as HTMLSelectElement).value)}>
        <option value="">— behalten —</option>
        {#each offer.owned.filter((o) => o.sourceKey === swap.from || !st.styleSwaps.some((s) => s.from === o.sourceKey)) as o (o.sourceKey)}
          <option value={o.sourceKey}>{o.name}</option>
        {/each}
      </select>
      {#if swap.from}
        <select class="select" value={swap.to} onchange={(e) => setSwap(i, 'to', (e.target as HTMLSelectElement).value)}>
          <option value="">— ersetzen durch —</option>
          {#each freeTargets(i) as o (o.sourceKey)}
            <option value={o.sourceKey} title={o.desc}>{o.name}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/each}
{/if}
