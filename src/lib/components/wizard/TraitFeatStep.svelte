<script lang="ts">
  import { FEAT_CATEGORY_DE } from '$lib/featsLibrary';
  import { featArtUrl } from '$lib/libraryArt';
  import { traitFeatStatus, type TraitFeatOffer } from '../../services/traitFeat';
  import type { FightingStyleOption } from '../../services/fightingStyle';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import GlossaryTerm from '../GlossaryTerm.svelte';
  import ChoiceGroup from './ChoiceGroup.svelte';
  import ChoiceOption from './ChoiceOption.svelte';

  let { w, offers, focused = $bindable('') }: { w: CharacterWizard; offers: TraitFeatOffer[]; focused?: string } = $props();

  // Bei einem Platz tauscht ein Klick die Wahl; bei mehreren blockiert das volle Kontingent,
  // damit kein Talent unbemerkt herausfällt.
  function select(offer: TraitFeatOffer, o: FightingStyleOption) {
    focused = o.sourceKey;
    if (!traitFeatStatus(offer, o).pickable) return;
    const picked = w.traitFeats[offer.featureKey] ?? [];
    if (picked.includes(o.sourceKey)) w.setTraitFeats(offer.featureKey, picked.filter((k) => k !== o.sourceKey));
    else if (offer.allowance === 1) w.setTraitFeats(offer.featureKey, [o.sourceKey]);
    else if (picked.length < offer.allowance) w.setTraitFeats(offer.featureKey, [...picked, o.sourceKey]);
  }

  function tags(offer: TraitFeatOffer, o: FightingStyleOption) {
    return [
      ...(offer.recommended.includes(o.sourceKey) ? [{ label: '★ empfohlen', easy: true }] : []),
      ...(o.repeatable ? [{ label: 'mehrfach wählbar' }] : []),
    ];
  }
</script>

<p class="hint">
  Ein Volksmerkmal gewährt dir ein <GlossaryTerm term="Talent" />. Klick ein Talent an, um rechts zu lesen, was es bewirkt.
</p>
{#each offers as offer (offer.featureKey)}
  {@const picked = w.traitFeats[offer.featureKey] ?? []}
  <ChoiceGroup heading="{offer.label} — {FEAT_CATEGORY_DE[offer.featCategory]}-Talent">
    {#each offer.options as o (o.sourceKey)}
      {@const status = traitFeatStatus(offer, o)}
      <ChoiceOption
        title={o.name}
        subtitle={status.note}
        tags={tags(offer, o)}
        art={[featArtUrl({ sourceKey: o.sourceKey })].filter((u) => u !== null)}
        icon
        muted={!status.pickable}
        selected={picked.includes(o.sourceKey)}
        onselect={() => select(offer, o)}
      />
    {/each}
  </ChoiceGroup>
  {#if !offer.options.length}
    <p class="warn">Keine Talente der Kategorie „{FEAT_CATEGORY_DE[offer.featCategory]}“ in der Bibliothek (vault/feats).</p>
  {/if}
{/each}

<style>
  .warn { font-size: 0.78rem; color: var(--danger); }
</style>
