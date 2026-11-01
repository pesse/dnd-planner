<script lang="ts">
  import { campaignTree } from '../sidebar/campaign/campaignTreeState.svelte';
  import './startCard.css';

  let naming = $state(false);
  let campaignName = $state('');
  let creating = $state(false);

  async function createCampaign() {
    creating = true;
    if (await campaignTree.createNamedCampaign(campaignName)) {
      naming = false;
      campaignName = '';
    }
    creating = false;
  }

  function onNameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') void createCampaign();
    if (e.key === 'Escape') naming = false;
  }
</script>

{#if naming}
  <div class="start-card naming">
    <span class="start-card-title">Neue Kampagne</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={campaignName} placeholder="Name der Kampagne…" onkeydown={onNameKey} autofocus />
    <div class="naming-actions">
      <button class="ghost" onclick={() => (naming = false)}>Abbrechen</button>
      <button class="confirm" disabled={!campaignName.trim() || creating} onclick={createCampaign}>Anlegen</button>
    </div>
  </div>
{:else}
  <button class="start-card" onclick={() => (naming = true)}>
    <span class="start-card-title">Kampagne erstellen</span>
    <span class="start-card-sub">Akte, Sessions, NPCs und Welt</span>
  </button>
{/if}

<style>
  .naming {
    cursor: default;
    gap: 0.5rem;
  }
  .naming input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
  }
  .naming-actions {
    align-self: flex-end;
    display: flex;
    gap: 0.4rem;
  }
  .naming-actions button {
    padding: 0.2rem 0.6rem;
    border-radius: 4px;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .ghost {
    background: transparent;
    color: var(--on-accent);
    border: 1px solid color-mix(in srgb, var(--on-accent) 50%, transparent);
  }
  .confirm {
    background: var(--on-accent);
    color: var(--red);
    border: 1px solid var(--on-accent);
  }
  .confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
