<script lang="ts">
  /** Ein Bild pro Klick über Cloudflare FLUX; das Motiv kommt vom Charakter oder frei aus dem Dialog. */
  import { generateImage, loadCloudflareConfig } from '../../services/imageGen/cloudflare';
  import { ART_STYLES, DEFAULT_ART_STYLE, withArtStyle } from '../../services/imageGen/portraitPrompt';

  let { prompt, disabled, onimage }: {
    prompt: () => string;
    disabled: boolean;
    onimage: (b64: string) => Promise<void>;
  } = $props();

  const STYLE_STORAGE_KEY = 'imagegen-style';

  let style = $state(localStorage.getItem(STYLE_STORAGE_KEY) ?? DEFAULT_ART_STYLE);
  let subject = $state('');
  let busy = $state(false);
  let error = $state('');
  let dialog = $state<HTMLDialogElement>();

  $effect(() => { localStorage.setItem(STYLE_STORAGE_KEY, style); });

  function openEditor() {
    if (!subject.trim()) subject = prompt();
    dialog?.showModal();
  }

  async function run(text: string) {
    error = '';
    const config = await loadCloudflareConfig();
    if (!config) {
      error = 'Cloudflare-Zugang fehlt – in den KI-Einstellungen hinterlegen.';
      return;
    }
    busy = true;
    try {
      await onimage(await generateImage(config, withArtStyle(text, style)));
      dialog?.close();
    } catch (e) {
      error = `Bild konnte nicht erzeugt werden: ${e instanceof Error ? e.message : e}`;
    } finally {
      busy = false;
    }
  }
</script>

<div class="gen">
  <select bind:value={style} title="Stil" disabled={busy}>
    {#each ART_STYLES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
  </select>
  <div class="gen-actions">
    <button class="btn-add" onclick={() => run(prompt())} disabled={disabled || busy}>
      {busy ? 'Male…' : 'Generieren'}
    </button>
    <button class="btn-add" onclick={openEditor} disabled={busy} title="Motiv frei beschreiben">Prompt…</button>
  </div>
  {#if error}<div class="error-sm">{error}</div>{/if}
</div>

<dialog bind:this={dialog} class="gen-dialog">
  <h4>Bild frei beschreiben</h4>
  <p class="hint">Englisch trifft das Modell am zuverlässigsten. Der Stil wird hinten angehängt.</p>
  <textarea bind:value={subject} rows="8"></textarea>
  <div class="style-row">
    <span>Stil</span>
    <select bind:value={style} disabled={busy}>
      {#each ART_STYLES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
    </select>
  </div>
  {#if error}<div class="error-sm">{error}</div>{/if}
  <div class="dialog-actions">
    <button class="btn-add" onclick={() => { subject = prompt(); }} disabled={busy}>Aus Charakter</button>
    <span class="spacer"></span>
    <button class="btn-add" onclick={() => dialog?.close()} disabled={busy}>Abbrechen</button>
    <button class="btn-add primary" onclick={() => run(subject)} disabled={disabled || busy || !subject.trim()}>
      {busy ? 'Male…' : 'Generieren'}
    </button>
  </div>
</dialog>

<style>
  .gen { display: flex; flex-direction: column; gap: 0.3rem; }
  .gen-actions { display: flex; gap: 0.3rem; }
  .gen select { width: 100%; font-size: 0.75rem; }
  .gen-dialog {
    width: min(560px, 90vw);
    background: var(--bg);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
  }
  .gen-dialog::backdrop { background: rgb(0 0 0 / 0.4); }
  .gen-dialog h4 { margin: 0 0 0.3rem; }
  .hint { margin: 0 0 0.5rem; font-size: 0.75rem; color: var(--ink-muted); }
  .gen-dialog textarea { width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
  .style-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; font-size: 0.8rem; }
  .dialog-actions { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
  .spacer { flex: 1; }
  .dialog-actions .primary { background: var(--green); color: var(--bg); font-weight: 700; }
</style>
