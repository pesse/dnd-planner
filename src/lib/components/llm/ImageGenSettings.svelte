<script lang="ts">
  /** Zugang zur Bildgenerierung (Cloudflare Workers AI), unabhängig vom gewählten LLM-Provider. */
  import { onMount } from 'svelte';
  import { deleteCloudflareToken, hasCloudflareToken, saveCloudflareConfig, storedCloudflareAccountId } from '../../services/imageGen/cloudflare';

  let accountId = $state(storedCloudflareAccountId());
  let token = $state('');
  let hasToken = $state(false);
  let status = $state('');

  onMount(async () => {
    hasToken = await hasCloudflareToken();
  });

  async function save() {
    await saveCloudflareConfig(accountId, token);
    if (token.trim()) hasToken = true;
    token = '';
    status = 'Gespeichert';
  }

  async function removeToken() {
    await deleteCloudflareToken();
    hasToken = false;
    status = 'Token gelöscht';
  }
</script>

<div class="imagegen">
  <div class="title">Bildgenerierung · Cloudflare FLUX</div>
  <div class="settings-row">
    <label for="cf-account">Account</label>
    <input id="cf-account" type="text" bind:value={accountId} placeholder="Account-ID" />
  </div>
  <div class="settings-row">
    <label for="cf-token">Token</label>
    <input id="cf-token" type="password" bind:value={token}
      placeholder={hasToken ? '•••••• gespeichert' : 'API-Token (Workers AI: Read)'} />
  </div>
  <div class="footer">
    {#if status}<span class="status">{status}</span>{/if}
    {#if hasToken}<button class="delete-btn" onclick={removeToken}>Token löschen</button>{/if}
    <button class="save-btn" onclick={save}>Speichern</button>
  </div>
</div>

<style>
  .imagegen { display: flex; flex-direction: column; gap: 0.45rem; padding-top: 0.5rem; border-top: 1px solid var(--surface); }
  .title { font-size: 0.7rem; font-weight: 700; color: var(--ink-muted); }
  .settings-row { display: flex; align-items: center; gap: 0.5rem; }
  .settings-row label { font-size: 0.7rem; color: var(--ink-muted); width: 52px; flex-shrink: 0; }
  .settings-row input {
    flex: 1;
    min-width: 0;
    background: var(--bg);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.25rem 0.4rem;
    font-size: 0.75rem;
    font-family: inherit;
  }
  .footer { display: flex; justify-content: flex-end; align-items: center; gap: 0.4rem; }
  .status { font-size: 0.65rem; color: var(--ink-muted); margin-right: auto; }
  .save-btn {
    background: var(--green);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.8rem;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .delete-btn {
    background: transparent;
    color: var(--danger);
    border: 1px solid var(--danger);
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.72rem;
    cursor: pointer;
  }
</style>
