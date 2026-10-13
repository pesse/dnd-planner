<script lang="ts">
  import './levelUp.css';
  import { FEAT_CATEGORY_DE, featDisplayName } from '$lib/featsLibrary';
  import FeatPicker from '../FeatPicker.svelte';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);
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
  <div class="row">
    <span class="field-label">{ui.openFeats} Talent(e) wählen</span>
    <div class="chips">
      {#each st.chosenFeats.filter((f) => !f.slot) as f}
        <span class="pick">{f.nameDe}<button type="button" onclick={() => (st.chosenFeats = st.chosenFeats.filter((x) => x !== f))}>×</button></span>
      {/each}
    </div>
    <input class="input" placeholder="Talent suchen…" value={ui.featQuery} oninput={(e) => (ui.featQuery = (e.target as HTMLInputElement).value)} />
    {#if ui.featQuery.trim()}
      <div class="results">
        {#each ui.featResults() as entry}
          {@const mark = ui.featMark(entry)}
          <button type="button" class="result" title={mark.owned ? (mark.blocked ? 'Schon vorhanden' : 'Schon vorhanden — mehrfach wählbar') : undefined} onclick={() => ui.toggleFeat(entry)} disabled={mark.blocked || st.chosenFeats.filter((f) => !f.slot).length >= ui.openFeats && !st.chosenFeats.some((f) => !f.slot && f.nameDe === featDisplayName(entry))}>{featDisplayName(entry)}{#if mark.owned}{mark.blocked ? ' ✓' : ' ✓ +1'}{/if}</button>
        {/each}
        {#if !ui.featResults().length}<span class="field-hint">Keine Treffer im Talent-Wörterbuch.</span>{/if}
      </div>
    {/if}
    <span class="field-hint">{st.chosenFeats.filter((f) => !f.slot).length} / {ui.openFeats} gewählt</span>
  </div>
{/if}
