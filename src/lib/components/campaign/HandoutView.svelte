<script lang="ts">
  /** Ein Handout ansehen, bearbeiten und den Spielern im Spielerfenster zeigen. */
  import { invoke } from '@tauri-apps/api/core';
  import { invalidateVault } from '../../stores/campaign';
  import { handoutSchema, type Handout } from '../../schemas/handout';
  import { pickMapImage, vaultFileUrl } from '../../services/battleMap/mapFiles';
  import { hideHandout, playerHandout, setHandoutText, showHandout } from '../../services/handouts/playerHandout.svelte';

  let { path }: { path: string } = $props();

  let handout = $state<Handout | null>(null);
  let imageUrl = $state('');
  let error = $state('');

  const dir = $derived(path.slice(0, path.lastIndexOf('/')));
  const shown = $derived(!!handout && playerHandout.current?.name === handout.name && playerHandout.current?.imageUrl === imageUrl);

  $effect(() => {
    const p = path;
    handout = null;
    imageUrl = '';
    error = '';
    void (async () => {
      try {
        const h = handoutSchema.parse(JSON.parse(await invoke<string>('read_file_content', { path: p })));
        const url = h.image ? await vaultFileUrl(`${p.slice(0, p.lastIndexOf('/'))}/${h.image}`) : '';
        if (p !== path) return;
        handout = h;
        imageUrl = url;
      } catch {
        if (p === path) error = 'Das Handout konnte nicht gelesen werden.';
      }
    })();
  });

  async function save(refreshTree = false) {
    if (!handout) return;
    try {
      await invoke('write_file_content', { path, content: JSON.stringify(handout, null, 2) + '\n' });
      if (refreshTree) invalidateVault();
    } catch {
      error = 'Das Handout konnte nicht gespeichert werden.';
    }
  }

  async function pickImage() {
    if (!handout) return;
    const file = await pickMapImage(path).catch(() => null);
    if (!file) return;
    handout.image = file;
    imageUrl = await vaultFileUrl(`${dir}/${file}`);
    await save();
  }

  function toggleShown() {
    if (!handout) return;
    if (shown) hideHandout();
    else void showHandout({ name: handout.name, imageUrl });
  }
</script>

<div class="handout">
  {#if handout}
    <header>
      <input class="name" bind:value={handout.name} onchange={() => save(true)} aria-label="Name" />
      <button class="primary-btn" disabled={!imageUrl} onclick={toggleShown}>
        {shown ? 'Bei den Spielern ausblenden' : 'Den Spielern zeigen'}
      </button>
      {#if shown && handout.text.trim()}
        {@const textShown = !!playerHandout.current?.text}
        <button class:active={textShown} onclick={() => setHandoutText(textShown ? '' : handout!.text)}>
          {textShown ? 'Text ausblenden' : 'Text einblenden'}
        </button>
      {/if}
      <button onclick={pickImage}>{handout.image ? 'Bild ersetzen…' : 'Bild wählen…'}</button>
    </header>
    <div class="body">
      {#if imageUrl}
        <img src={imageUrl} alt={handout.name} />
      {:else}
        <p class="empty">Noch kein Bild.</p>
      {/if}
      <label class="text">
        <span>Abschrift</span>
        <textarea bind:value={handout.text} onchange={() => save()} rows="12" placeholder="Was auf dem Handout steht"></textarea>
      </label>
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .handout {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    height: 100%;
    padding: 1rem;
    overflow: auto;
    box-sizing: border-box;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .name {
    flex: 1;
    font-family: var(--font-display);
    font-size: 1.2rem;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(16rem, 2fr);
    gap: 1rem;
    align-items: start;
  }
  img {
    width: 100%;
    max-height: 80vh;
    object-fit: contain;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-deep);
  }
  .empty {
    padding: 3rem 1rem;
    text-align: center;
    color: var(--ink-muted);
    border: 1px dashed var(--border);
    border-radius: 4px;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
  }
  textarea {
    font: inherit;
    resize: vertical;
  }
  button.active {
    border-color: var(--red);
    color: var(--red);
  }
  .error {
    color: var(--danger);
  }
</style>
