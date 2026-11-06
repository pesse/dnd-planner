<script lang="ts">
  /** Kartenbild der aktuellen Ebene über einen der Bild-Anbieter; die Vorschau ersetzt das Bild erst mit „Übernehmen". */
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import {
    IMAGE_PROVIDERS, activeImageProvider, imageProvider, promptLimitError, readyProvider, setActiveImageProvider,
    type ReadyProvider,
  } from '../../services/imageGen/providers';
  import type { GeneratedImage } from '../../services/imageGen/types';
  import { imageDataUrl } from '../../services/imageGen/figureFromPortrait';
  import {
    MAP_FORMATS, MAP_SETTINGS, MAP_STYLES, buildMapPrompt, type MapFormat, type MapSetting, type MapStyle,
  } from '../../services/battleMap/mapImagePrompt';
  import { buildMapSceneTranslateAction, buildMapSceneTranslateInput } from '../../services/aiActions/mapSceneTranslateAction';
  import { runAiAction } from '../../services/aiActions/runner';
  import { llmConfig } from '../../stores/llm';
  import HelpButton from '../help/HelpButton.svelte';
  import PromptEditor from '../characterForm/PromptEditor.svelte';

  let { editor }: { editor: MapEditor } = $props();

  const STYLE_KEY = 'mapgen-style';
  const FORMAT_KEY = 'mapgen-format';
  const stored = <T extends string>(key: string, allowed: readonly string[], fallback: T): T => {
    const v = localStorage.getItem(key) ?? '';
    return (allowed.includes(v) ? v : fallback) as T;
  };

  let dialog = $state<HTMLDialogElement>();
  let scene = $state('');
  let setting = $state<MapSetting>('indoor');
  let style = $state<MapStyle>(stored(STYLE_KEY, MAP_STYLES.map((s) => s.id), 'painted'));
  let format = $state<MapFormat>(stored(FORMAT_KEY, Object.keys(MAP_FORMATS), 'landscape'));
  let editedPrompt = $state<string | null>(null);
  /** Gilt nur, solange die deutsche Szene noch dieselbe ist. */
  let translation = $state<{ source: string; en: string } | null>(null);
  let providerId = $state(activeImageProvider());
  /** `undefined` = wird noch geprüft, `null` = nicht eingerichtet. */
  let ready = $state<ReadyProvider | null | undefined>();
  let result = $state<GeneratedImage | null>(null);
  let error = $state('');
  let painting = $state(false);
  let translating = $state(false);
  let saving = $state(false);
  let abort: AbortController | null = null;
  const busy = $derived(painting || translating || saving);

  $effect(() => { localStorage.setItem(STYLE_KEY, style); });
  $effect(() => { localStorage.setItem(FORMAT_KEY, format); });

  const provider = $derived(imageProvider(providerId));
  const english = $derived(translation?.source === scene.trim() ? translation.en : null);
  const prompt = $derived(editedPrompt ?? (scene.trim() ? buildMapPrompt(english ?? scene, setting, style) : ''));
  const tooLong = $derived(promptLimitError(provider, prompt));
  const size = $derived(MAP_FORMATS[format]);

  async function selectProvider(id: string) {
    providerId = id;
    setActiveImageProvider(id);
    ready = undefined;
    const r = await readyProvider(imageProvider(id));
    if (providerId === id) ready = r;
  }

  function openDialog() {
    result = null;
    error = '';
    dialog?.showModal();
    // Erst beim Öffnen, damit ein gerade in den Einstellungen hinterlegter Zugang greift.
    void selectProvider(activeImageProvider());
  }

  async function translate() {
    error = '';
    translating = true;
    const source = scene.trim();
    try {
      const out = await runAiAction($llmConfig, buildMapSceneTranslateAction(), buildMapSceneTranslateInput(source));
      translation = { source, en: out.scene };
    } catch (e) {
      error = `Übersetzung fehlgeschlagen: ${e instanceof Error ? e.message : e}`;
    } finally {
      translating = false;
    }
  }

  async function paint() {
    if (!ready) return;
    error = '';
    painting = true;
    abort = new AbortController();
    try {
      result = await ready.generate(prompt, { width: size.width, height: size.height, signal: abort.signal }, 'Kartenbild');
    } catch (e) {
      if (!abort.signal.aborted) error = `Bild fehlgeschlagen: ${e instanceof Error ? e.message : e}`;
    } finally {
      painting = false;
      abort = null;
    }
  }

  async function accept() {
    if (!result) return;
    saving = true;
    try {
      await editor.useGeneratedImage(result);
      result = null;
      dialog?.close();
    } catch (e) {
      error = `Bild konnte nicht gespeichert werden: ${e}`;
    } finally {
      saving = false;
    }
  }
</script>

<button onclick={openDialog}>Bild generieren…</button>

<dialog bind:this={dialog} class="gen-dialog" onclose={() => abort?.abort()}>
  <h4>Kartenbild generieren</h4>

  <div class="layout">
    <div class="inputs">
      <label class="col">
        <span>Was liegt auf der Karte?</span>
        <textarea rows="4" bind:value={scene} disabled={busy || editedPrompt !== null}
          placeholder="z. B. Verfallene Gruft mit drei Sarkophagen, eingestürzte Säule, Gang nach Norden, Treppe nach unten in einer Ecke"></textarea>
      </label>
      <div class="row">
        <label>Ort
          <select bind:value={setting} disabled={busy || editedPrompt !== null}>
            {#each Object.entries(MAP_SETTINGS) as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
        </label>
        <label>Stil
          <select bind:value={style} disabled={busy || editedPrompt !== null}>
            {#each MAP_STYLES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
          </select>
        </label>
        <label>Format
          <select bind:value={format} disabled={busy}>
            {#each Object.entries(MAP_FORMATS) as [id, f] (id)}<option value={id}>{f.label}</option>{/each}
          </select>
        </label>
      </div>
      <label class="row">
        <span>Anbieter</span>
        <select value={providerId} disabled={busy} onchange={(e) => selectProvider(e.currentTarget.value)}>
          {#each IMAGE_PROVIDERS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
        {#if provider.help}<HelpButton topic={provider.help} />{/if}
      </label>
      <p class="hint">Das Raster liegt nicht im Bild — Feldgröße danach mit dem Werkzeug „Raster“ einmessen.</p>
    </div>

    <div class="result">
      {#if result}
        <img src={imageDataUrl(result)} alt="Vorschau" class:stale={busy} />
      {:else}
        <div class="placeholder" style:aspect-ratio="{size.width} / {size.height}">{painting ? 'Male…' : 'Noch kein Bild'}</div>
      {/if}
    </div>
  </div>

  <PromptEditor generated={prompt} bind:edited={editedPrompt} {busy} maxChars={provider.maxPromptChars}>
    {#snippet head()}
      {#if !provider.understandsGerman && editedPrompt === null && scene.trim()}
        {#if english}
          <em>englisch</em>
        {:else}
          <button class="btn-add" onclick={translate} disabled={busy}
            title="Die Szene über das eingestellte Sprachmodell ins Englische übersetzen">
            {translating ? 'Übersetze…' : 'Ins Englische übersetzen'}
          </button>
        {/if}
      {/if}
    {/snippet}
  </PromptEditor>

  {#if ready === null}
    <div class="error-sm">
      {provider.label} ist nicht eingerichtet – in den KI-Einstellungen hinterlegen.
      {#if provider.help}<HelpButton topic={provider.help} label="Anleitung" />{/if}
    </div>
  {/if}
  {#if tooLong}<div class="error-sm">{tooLong} Kürzen oder einen anderen Anbieter wählen.</div>{/if}
  {#if error}<div class="error-sm">{error}</div>{/if}

  <div class="dialog-actions">
    {#if painting}
      <button class="btn-add" onclick={() => abort?.abort()}>Malen abbrechen</button>
    {:else}
      <button class="btn-add" onclick={() => dialog?.close()} disabled={busy}>Abbrechen</button>
    {/if}
    <button class="btn-add" class:primary={!result} onclick={paint} disabled={busy || !ready || !prompt.trim() || !!tooLong}>
      {painting ? 'Male…' : result ? 'Nochmal' : 'Generieren'}
    </button>
    {#if result}
      <button class="btn-add primary" onclick={accept} disabled={busy}>Übernehmen</button>
    {/if}
  </div>
</dialog>

<style>
  .gen-dialog {
    width: min(900px, 92vw);
    background: var(--bg);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
  }
  .gen-dialog::backdrop { background: rgb(0 0 0 / 0.4); }
  h4 { margin: 0 0 0.6rem; }
  .layout { display: grid; grid-template-columns: 1fr 360px; gap: 1rem; }
  .inputs { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8rem; }
  .col { display: flex; flex-direction: column; gap: 0.2rem; }
  .col textarea { width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
  .row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .row label { display: flex; align-items: center; gap: 0.3rem; }
  .hint { margin: 0; font-size: 0.75rem; color: var(--ink-muted); }
  .result img, .placeholder { width: 100%; border-radius: 6px; }
  .result img { height: auto; display: block; }
  .result img.stale { opacity: 0.5; }
  .placeholder {
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--border); color: var(--ink-muted); font-size: 0.8rem;
  }
  .error-sm { margin-top: 0.5rem; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 0.4rem; margin-top: 0.8rem; }
  .dialog-actions .primary { background: var(--green); color: var(--bg); font-weight: 700; }
  .dialog-actions button:disabled { opacity: 0.5; cursor: default; }
</style>
