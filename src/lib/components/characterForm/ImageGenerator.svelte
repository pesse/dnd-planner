<script lang="ts">
  /**
   * Portrait über einen der Bild-Anbieter. Die Aussehensfelder im Dialog sind die des Entwurfs — eine
   * Änderung hier landet im Charakter. Ein Bild bleibt Vorschau, bis „Übernehmen" es an `onimage` gibt.
   */
  import {
    IMAGE_PROVIDERS, activeImageProvider, imageProvider, promptLimitError, readyProvider, setActiveImageProvider,
    type ReadyProvider,
  } from '../../services/imageGen/providers';
  import type { GeneratedImage } from '../../services/imageGen/types';
  import {
    ART_STYLES, DEFAULT_ART_STYLE, PORTRAIT_FIELDS, buildPortraitSubject, currentEnglish, portraitTexts, withArtStyle,
    type PortraitSource, type TranslatedTexts,
  } from '../../services/imageGen/portraitPrompt';
  import { buildPortraitTranslateAction, buildPortraitTranslateInput } from '../../services/aiActions/portraitTranslateAction';
  import { runAiAction } from '../../services/aiActions/runner';
  import { llmConfig } from '../../stores/llm';
  import type { PortraitTextKey } from '../../schemas/portraitTranslation';
  import { PRESENTATION_LABEL } from '../../domain/presentation';
  import { PRESENTATIONS } from '../../schemas/characterSchema';

  let { portrait, disabled, onimage }: {
    portrait: PortraitSource;
    disabled: boolean;
    onimage: (image: GeneratedImage) => Promise<void>;
  } = $props();

  const STYLE_STORAGE_KEY = 'imagegen-style';

  let style = $state(localStorage.getItem(STYLE_STORAGE_KEY) ?? DEFAULT_ART_STYLE);
  let extra = $state('');
  /** `null` = der Prompt folgt Merkmalen, Stil und Freitext; sonst die Handfassung. */
  let editedPrompt = $state<string | null>(null);
  let result = $state<GeneratedImage | null>(null);
  let providerId = $state(activeImageProvider());
  /** `undefined` = wird noch geprüft, `null` = nicht eingerichtet. */
  let ready = $state<ReadyProvider | null | undefined>();
  let busy = $state(false);
  let translating = $state(false);
  /** Die Übersetzung gilt je Feld nur, solange dessen deutscher Text noch derselbe ist. */
  let translation = $state<TranslatedTexts | null>(null);
  let error = $state('');
  let dialog = $state<HTMLDialogElement>();

  $effect(() => { localStorage.setItem(STYLE_STORAGE_KEY, style); });

  const motif = $derived([
    portrait.species.name.trim(),
    portrait.classes
      .map((cl) => [cl.name.trim(), cl.subclassName?.trim()].filter(Boolean).join(' – '))
      .filter(Boolean)
      .join(' / '),
  ].filter(Boolean).join(' · '));
  const germanTexts = $derived(portraitTexts(portrait, extra));
  const english = $derived(currentEnglish(germanTexts, translation));
  const untranslated = $derived(
    (Object.keys(germanTexts) as PortraitTextKey[]).filter((k) => germanTexts[k] && !english[k]).length,
  );
  const generatedPrompt = $derived(withArtStyle(buildPortraitSubject(portrait, extra, english), style));
  const prompt = $derived(editedPrompt ?? generatedPrompt);
  const provider = $derived(imageProvider(providerId));
  const tooLong = $derived(promptLimitError(provider, prompt));

  async function selectProvider(id: string) {
    providerId = id;
    setActiveImageProvider(id);
    ready = undefined;
    const r = await readyProvider(imageProvider(id));
    if (providerId === id) ready = r;
  }

  function openDialog() {
    error = '';
    result = null;
    dialog?.showModal();
    // Erst beim Öffnen, damit ein gerade in den Einstellungen hinterlegter Zugang greift.
    void selectProvider(activeImageProvider());
  }

  async function run() {
    if (!ready) return;
    error = '';
    busy = true;
    try {
      result = await ready.generate(prompt);
    } catch (e) {
      error = `Bild konnte nicht erzeugt werden: ${e instanceof Error ? e.message : e}`;
    } finally {
      busy = false;
    }
  }

  async function translate() {
    error = '';
    translating = true;
    const source = { ...germanTexts };
    try {
      const en = await runAiAction($llmConfig, buildPortraitTranslateAction(), buildPortraitTranslateInput(source));
      translation = { source, en };
    } catch (e) {
      error = `Übersetzung fehlgeschlagen: ${e instanceof Error ? e.message : e}`;
    } finally {
      translating = false;
    }
  }

  async function accept() {
    if (!result) return;
    busy = true;
    try {
      await onimage(result);
      dialog?.close();
    } catch (e) {
      error = `Bild konnte nicht gespeichert werden: ${e}`;
    } finally {
      busy = false;
    }
  }
</script>

<button class="btn-add" onclick={openDialog} {disabled}>Generieren…</button>

<dialog bind:this={dialog} class="gen-dialog" onclose={() => { result = null; }}>
  <h4>Portrait generieren</h4>

  <div class="layout">
    <div class="inputs">
      <div class="motif"><span>Motiv</span> {motif || '—'}</div>
      <div class="traits">
        <label>Äußeres
          <select bind:value={portrait.presentation} disabled={busy}>
            <option value="">—</option>
            {#each PRESENTATIONS as p (p)}<option value={p}>{PRESENTATION_LABEL[p]}</option>{/each}
          </select>
        </label>
        {#each PORTRAIT_FIELDS as f (f.key)}
          {#if f.key === 'aussehen'}
            <label class="wide">{f.label}<textarea rows="2" bind:value={portrait.personal[f.key]} disabled={busy}></textarea></label>
          {:else}
            <label>{f.label}<input bind:value={portrait.personal[f.key]} disabled={busy} /></label>
          {/if}
        {/each}
      </div>
      <p class="hint">Änderungen hier gehen in den Charakter.</p>

      <label class="row">
        <span>Anbieter</span>
        <select value={providerId} disabled={busy} onchange={(e) => selectProvider(e.currentTarget.value)}>
          {#each IMAGE_PROVIDERS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
      </label>
      <label class="row">
        <span>Stil</span>
        <select bind:value={style} disabled={busy || editedPrompt !== null}>
          {#each ART_STYLES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
        </select>
      </label>
      <label class="free">
        <span>Zusätzlich</span>
        <textarea bind:value={extra} rows="2" disabled={busy || editedPrompt !== null}
          placeholder="z. B. Narbe über dem linken Auge, trägt eine Kapuze"></textarea>
      </label>
    </div>

    <div class="result">
      {#if result}
        <img src="data:image/{result.ext === 'png' ? 'png' : 'jpeg'};base64,{result.b64}" alt="Vorschau" class:stale={busy} />
      {:else}
        <div class="placeholder">{busy ? 'Male…' : 'Noch kein Bild'}</div>
      {/if}
    </div>
  </div>

  <div class="free prompt">
    <span class="prompt-head">
      Prompt
      {#if editedPrompt !== null}
        <em>von Hand geändert – Merkmale, Stil und Zusätzlich wirken nicht mehr</em>
        <button class="btn-add" onclick={() => { editedPrompt = null; }} disabled={busy}>Zurücksetzen</button>
      {/if}
      {#if !provider.understandsGerman && editedPrompt === null}
        {#if untranslated}
          <button class="btn-add" onclick={translate} disabled={busy || translating}
            title="Merkmale und Zusätzlich über das eingestellte Sprachmodell ins Englische übersetzen">
            {translating ? 'Übersetze…' : 'Ins Englische übersetzen'}
          </button>
        {:else if Object.keys(english).length}
          <em>englisch</em>
        {/if}
      {/if}
      <span class="count" class:over={tooLong}>
        {prompt.length}{provider.maxPromptChars ? ` / ${provider.maxPromptChars}` : ''} Zeichen
      </span>
    </span>
    <textarea rows="5" value={prompt} disabled={busy}
      aria-label="Prompt" oninput={(e) => { editedPrompt = e.currentTarget.value; }}></textarea>
  </div>

  {#if ready === null}
    <div class="error-sm">{provider.label} ist nicht eingerichtet – in den KI-Einstellungen hinterlegen.</div>
  {/if}
  {#if tooLong}<div class="error-sm">{tooLong} Kürzen oder einen anderen Anbieter wählen.</div>{/if}
  {#if error}<div class="error-sm">{error}</div>{/if}

  <div class="dialog-actions">
    <button class="btn-add" onclick={() => dialog?.close()} disabled={busy}>Abbrechen</button>
    <button class="btn-add" class:primary={!result} onclick={run} disabled={disabled || busy || !ready || !prompt.trim() || !!tooLong}>
      {busy ? 'Male…' : result ? 'Nochmal' : 'Generieren'}
    </button>
    {#if result}
      <button class="btn-add primary" onclick={accept} disabled={disabled || busy}>Übernehmen</button>
    {/if}
  </div>
</dialog>

<style>
  .gen-dialog {
    width: min(760px, 92vw);
    background: var(--bg);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
  }
  .gen-dialog::backdrop { background: rgb(0 0 0 / 0.4); }
  .gen-dialog h4 { margin: 0 0 0.6rem; }
  .layout { display: grid; grid-template-columns: 1fr 256px; gap: 1rem; }
  .motif { font-size: 0.85rem; margin-bottom: 0.4rem; }
  .motif span { color: var(--ink-muted); margin-right: 0.4rem; }
  .traits { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.3rem 0.6rem; }
  .traits .wide { grid-column: 1 / -1; }
  .traits textarea { resize: vertical; font-family: inherit; }
  .hint { margin: 0.4rem 0 0.7rem; font-size: 0.75rem; color: var(--ink-muted); }
  .row { display: flex; flex-direction: row; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.8rem; }
  .free { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; }
  .free textarea { width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
  .result img, .placeholder { width: 256px; height: 256px; border-radius: 6px; }
  .result img { object-fit: cover; display: block; }
  .result img.stale { opacity: 0.5; }
  .placeholder {
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--border); color: var(--ink-muted); font-size: 0.8rem;
  }
  .prompt { margin-top: 0.7rem; }
  .prompt-head { display: flex; align-items: center; gap: 0.5rem; }
  .count { margin-left: auto; font-size: 0.7rem; color: var(--ink-muted); }
  .count.over { color: var(--danger); font-weight: 700; }
  .prompt-head em { font-size: 0.7rem; color: var(--ink-muted); }
  .prompt textarea { font-size: 0.75rem; }
  .error-sm { margin-top: 0.5rem; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 0.4rem; margin-top: 0.8rem; }
  .dialog-actions .primary { background: var(--green); color: var(--bg); font-weight: 700; }
  .dialog-actions button:disabled { opacity: 0.5; cursor: default; }
</style>
