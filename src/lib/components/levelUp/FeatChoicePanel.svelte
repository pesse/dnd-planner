<script lang="ts">
  import './levelUp.css';
  import { FEAT_CATEGORY_DE, featDisplayName, featPrereq } from '$lib/featsLibrary';
  import { featArtUrl } from '$lib/libraryArt';
  import FeatPicker from '../FeatPicker.svelte';
  import ChoiceGroup from '../wizard/ChoiceGroup.svelte';
  import ChoiceOption from '../wizard/ChoiceOption.svelte';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
  const openChosen = $derived(st.chosenFeats.filter((f) => !f.slot).length);
</script>

{#each st.featSlots as slot (slot.category)}
  <FeatPicker
    offer={ui.slotOffer(slot)}
    heading="{FEAT_CATEGORY_DE[slot.category]}-Talent — {slot.count} neu"
    missingHint="Talente brauchen die Kategorie „{FEAT_CATEGORY_DE[slot.category]}“ (vault/feats)."
    selected={ui.slotChosen(slot.category)}
    owned={st.ownedFeats}
    onToggle={(key) => ui.toggleSlotFeat(slot, key)}
  />
{/each}

{#if st.delta && ui.openFeats > 0}
  <span class="hint">{openChosen} von {ui.openFeats} Talent{ui.openFeats > 1 ? 'en' : ''} gewählt — rechts steht, was das angeklickte Talent bewirkt.</span>
  <input type="text" placeholder="Talent suchen…" value={ui.featQuery} oninput={(e) => (ui.featQuery = (e.target as HTMLInputElement).value)} />
  <div class="chips">
    <button type="button" class="chip" class:sel={!ui.featCategory} onclick={() => (ui.featCategory = '')}>Alle</button>
    {#each ui.featCategories as c}
      <button type="button" class="chip" class:sel={ui.featCategory === c} onclick={() => (ui.featCategory = c)}>{FEAT_CATEGORY_DE[c]}</button>
    {/each}
  </div>
  <ChoiceGroup heading="Talente ({ui.featList.length})">
    {#each ui.featList as entry (entry.sourceKey || entry.name)}
      {@const mark = ui.featMark(entry)}
      <ChoiceOption
        title={featDisplayName(entry)}
        subtitle={featPrereq(entry) ? `Voraussetzung: ${featPrereq(entry)}` : ''}
        tags={[
          ...(entry.category ? [{ label: FEAT_CATEGORY_DE[entry.category] }] : []),
          ...(entry.repeatable ? [{ label: 'mehrfach' }] : []),
          ...(mark.owned ? [{ label: mark.blocked ? 'schon vorhanden' : 'vorhanden, +1 möglich' }] : []),
        ]}
        art={[featArtUrl(entry)].filter((u) => u !== null)}
        icon
        selected={ui.isOpenFeatChosen(entry)}
        onselect={() => ui.pickOpenFeat(entry)}
      />
    {/each}
  </ChoiceGroup>
  {#if !ui.featList.length}<span class="hint">Keine Talente zu diesem Filter.</span>{/if}
{/if}
