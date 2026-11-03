<script lang="ts">
  import type { CharacterSheetModel } from '../../services/characterSheetModel.svelte';
  import CharacterSheetView from './CharacterSheetView.svelte';

  let { model: m, companionImageUrl, figureUrl }: { model: CharacterSheetModel; companionImageUrl: string; figureUrl: string } = $props();
</script>

{#if m.saves && m.shown}
  <CharacterSheetView character={m.shown} itemIndex={m.libs.itemIndex} spellIndex={m.libs.spellIndex}
    spellcasting={m.spellcasting} masteryOf={m.masteryOf} masteryChips={m.masteryChips} {companionImageUrl} {figureUrl}
    abilities={m.abilities} combatTips={m.tips} hpTipHtml={m.hpTipHtml} acTipHtml={m.acTipHtml} attackCtx={m.attackCtx}
    saves={m.saves} deathSaveAdvantage={m.deathSaveAdvantage} auras={m.auras} defenses={m.defenses} movement={m.movement}
    attackNotes={m.attackNotes} checks={m.checks} />
{/if}
