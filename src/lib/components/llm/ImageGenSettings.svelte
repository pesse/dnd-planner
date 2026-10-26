<script lang="ts">
  /** Zugang zur Bildgenerierung, unabhängig vom gewählten LLM-Provider. */
  import {
    IMAGE_PROVIDERS, activeImageProvider, deleteSecret, hasSecret, imageProvider, saveProviderSettings,
    setActiveImageProvider, storedSettings,
  } from '../../services/imageGen/providers';
  import HelpButton from '../help/HelpButton.svelte';

  let providerId = $state(activeImageProvider());
  const provider = $derived(imageProvider(providerId));
  let settings = $state<Record<string, string>>({});
  let secret = $state('');
  let secretStored = $state(false);
  let status = $state('');

  $effect(() => {
    const p = provider;
    settings = storedSettings(p);
    secret = '';
    status = '';
    secretStored = false;
    hasSecret(p).then((has) => { if (p === provider) secretStored = has; });
  });

  function select(id: string) {
    providerId = id;
    setActiveImageProvider(id);
  }

  async function save() {
    await saveProviderSettings(provider, settings, secret);
    if (secret.trim()) secretStored = true;
    secret = '';
    status = 'Gespeichert';
  }

  async function removeSecret() {
    await deleteSecret(provider);
    secretStored = false;
    status = 'Token gelöscht';
  }
</script>

<div class="imagegen">
  <div class="title">Bildgenerierung</div>
  <div class="settings-row">
    <label for="img-provider">Anbieter</label>
    <select id="img-provider" value={providerId} onchange={(e) => select(e.currentTarget.value)}>
      {#each IMAGE_PROVIDERS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
    </select>
    {#if provider.help}<HelpButton topic={provider.help} />{/if}
  </div>
  {#each provider.fields as f (provider.id + f.key)}
    <div class="settings-row">
      <label for="img-{f.key}">{f.label}</label>
      <input id="img-{f.key}" type="text" bind:value={settings[f.key]} placeholder={f.placeholder} />
    </div>
  {/each}
  {#if provider.secret}
    <div class="settings-row">
      <label for="img-secret">Token</label>
      <input id="img-secret" type="password" bind:value={secret}
        placeholder={secretStored ? '•••••• gespeichert' : provider.secret.placeholder} />
    </div>
  {/if}
  <div class="footer">
    {#if status}<span class="status">{status}</span>{/if}
    {#if secretStored}<button class="delete-btn" onclick={removeSecret}>Token löschen</button>{/if}
    <button class="save-btn" onclick={save}>Speichern</button>
  </div>
</div>

<style>
  .imagegen { display: flex; flex-direction: column; gap: 0.45rem; padding-top: 0.5rem; border-top: 1px solid var(--surface); }
  .title { font-size: 0.7rem; font-weight: 700; color: var(--ink-muted); }
  .settings-row { display: flex; align-items: center; gap: 0.5rem; }
  .settings-row label { font-size: 0.7rem; color: var(--ink-muted); width: 52px; flex-shrink: 0; }
  .settings-row input, .settings-row select {
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
