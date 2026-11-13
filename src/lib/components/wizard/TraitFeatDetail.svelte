<script lang="ts">
  import { getFeats, type FeatEntry } from '$lib/featsLibrary';
  import { traitFeatStatus, type TraitFeatOffer } from '../../services/traitFeat';
  import FeatCardView from '../libraryView/FeatCardView.svelte';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import OwnChoices from './OwnChoices.svelte';

  let { w, offers, focused }: { w: CharacterWizard; offers: TraitFeatOffer[]; focused: string } = $props();

  let feats = $state<FeatEntry[]>([]);
  $effect(() => {
    let cancelled = false;
    void getFeats().then((f) => { if (!cancelled) feats = f; });
    return () => { cancelled = true; };
  });

  const feat = $derived(feats.find((f) => f.sourceKey === focused) ?? null);
  const note = $derived.by(() => {
    for (const offer of offers) {
      const option = offer.options.find((o) => o.sourceKey === focused);
      if (option) return traitFeatStatus(offer, option);
    }
    return null;
  });
</script>

<OwnChoices {w} owners={offers.map((o) => o.featureKey)} />
{#if feat}
  {#if note?.note}<p class="status" class:blocked={!note.pickable}>{note.note}</p>{/if}
  <FeatCardView {feat} />
{:else}
  <p class="empty">Wähle links ein Talent — hier erscheint, was es bewirkt.</p>
{/if}

<style>
  .status {
    margin: 0 0 0.6rem; padding: 0.45rem 0.7rem; border-radius: 5px; font-size: 0.82rem;
    border: 1px solid color-mix(in srgb, var(--gold) 50%, var(--border));
    background: color-mix(in srgb, var(--gold) 10%, var(--bg-panel));
  }
  .status.blocked {
    border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
    background: color-mix(in srgb, var(--danger) 8%, var(--bg-panel));
  }
  .empty { font-size: 0.82rem; color: var(--ink-muted); margin: 0; }
</style>
