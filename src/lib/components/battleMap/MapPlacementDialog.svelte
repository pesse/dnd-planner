<script lang="ts">
  import { untrack } from 'svelte';
  import { mapPlacementPrompt } from '../../services/battleMap/mapPlacement';
  import { fetchActSummaries } from '../../services/contextLoad';
  import type { ActSummaryEntry } from '../../services/contextTypes';
  import PromptDialog from '../ui/PromptDialog.svelte';

  let name = $state('');
  let campaign = $state('');
  let act = $state('');
  let acts = $state<ActSummaryEntry[] | null>(null);

  $effect(() => {
    const req = $mapPlacementPrompt;
    if (!req) return;
    untrack(() => {
      name = req.name;
      campaign = req.campaign;
    });
  });

  // Die Akte hängen an der gewählten Kampagne; ein Akt gleichen Namens bleibt beim Wechsel gewählt.
  $effect(() => {
    const req = $mapPlacementPrompt;
    const forCampaign = campaign;
    if (!req?.withAct || !forCampaign) return;
    acts = null;
    void fetchActSummaries(forCampaign).then((list) => {
      if (forCampaign !== campaign) return;
      acts = list;
      const keep = untrack(() => act) || req.act;
      act = list.some((a) => a.name === keep) ? keep! : (list[0]?.name ?? '');
    });
  });

  const ready = $derived(!!name.trim() && !!campaign && (!$mapPlacementPrompt?.withAct || !!act));

  function confirm() {
    if (!$mapPlacementPrompt || !ready) return;
    $mapPlacementPrompt.resolve({ name: name.trim(), campaign, act: $mapPlacementPrompt.withAct ? act : undefined });
  }

  const cancel = () => $mapPlacementPrompt?.resolve(null);

  function onKey(e: KeyboardEvent) {
    if (!$mapPlacementPrompt) return;
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter') confirm();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if $mapPlacementPrompt}
  <PromptDialog title={$mapPlacementPrompt.title} accent="var(--gold)" titleGap="1rem" onbackdrop={cancel}>
    <label class="field">
      <span>Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={name} autofocus spellcheck="false" />
    </label>
    <label class="field">
      <span>Kampagne</span>
      <select bind:value={campaign}>
        {#each $mapPlacementPrompt.campaigns as c (c.path)}<option value={c.path}>{c.name}</option>{/each}
      </select>
    </label>
    {#if $mapPlacementPrompt.withAct}
      <label class="field">
        <span>Akt</span>
        {#if acts === null}
          <select disabled><option>Laden…</option></select>
        {:else if acts.length}
          <select bind:value={act}>
            {#each acts as a (a.name)}<option value={a.name}>{a.title || a.name}</option>{/each}
          </select>
        {:else}
          <span class="none">Diese Kampagne hat noch keinen Akt — eine Karte gehört zu einem.</span>
        {/if}
      </label>
    {/if}

    {#snippet actions()}
      <button class="cancel-btn" onclick={cancel}>Abbrechen</button>
      <button class="ok-btn" onclick={confirm} disabled={!ready}>Speichern</button>
    {/snippet}
  </PromptDialog>
{/if}

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.85rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .field:last-of-type { margin-bottom: 1.1rem; }

  .field input,
  .field select {
    background: var(--bg);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.4rem 0.55rem;
    font-size: 0.85rem;
    font-family: inherit;
    outline: none;
  }
  .field input:focus,
  .field select:focus { border-color: var(--gold); }

  .none { color: var(--danger); }

  .ok-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .cancel-btn:hover { color: var(--ink); }
</style>
