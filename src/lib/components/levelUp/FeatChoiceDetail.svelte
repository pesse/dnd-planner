<script lang="ts">
  import FeatCardView from '../libraryView/FeatCardView.svelte';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
</script>

{#if ui.focusedFeat}
  <FeatCardView feat={ui.focusedFeat} />
{:else}
  <p class="note">Klicke links ein Talent an — hier erscheint, was es bewirkt.</p>
{/if}

<style>
  .note { font-size: 0.82rem; color: var(--ink-muted); margin: 0; }
</style>
