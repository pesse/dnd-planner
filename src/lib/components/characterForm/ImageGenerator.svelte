<script lang="ts">
  /**
   * Portrait und Figur über einen der Bild-Anbieter. Die Aussehensfelder im Dialog sind die des Entwurfs —
   * eine Änderung hier landet im Charakter. Beide Bilder bleiben Vorschau, bis „Übernehmen" sie an
   * `onimage` bzw. `onfigure` gibt.
   */
  import {
    IMAGE_PROVIDERS, activeImageProvider, imageProvider, promptLimitError, readyProvider, setActiveImageProvider,
    type ReadyProvider,
  } from '../../services/imageGen/providers';
  import type { GeneratedImage } from '../../services/imageGen/types';
  import {
    ART_STYLES, DEFAULT_ART_STYLE, PORTRAIT_FIELDS, buildPortraitSubject, currentEnglish, portraitTexts, restyle,
    figureTraits, withArtStyle, type PortraitSource, type TranslatedTexts,
  } from '../../services/imageGen/portraitPrompt';
  import {
    cancelJob, discardPortrait, generateFigure, generatePortrait, portraitJob,
  } from '../../services/imageGen/portraitJobs.svelte';
  import {
    figureFacePrompt, figureFromPortrait, defaultCrop, imageDataUrl, loadImage, toReference, type Crop,
  } from '../../services/imageGen/figureFromPortrait';
  import CropPicker from './CropPicker.svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { buildPortraitTranslateAction, buildPortraitTranslateInput } from '../../services/aiActions/portraitTranslateAction';
  import { runAiAction } from '../../services/aiActions/runner';
  import { llmConfig } from '../../stores/llm';
  import type { PortraitTextKey } from '../../schemas/portraitTranslation';
  import { PRESENTATION_LABEL } from '../../domain/presentation';
  import { PRESENTATIONS } from '../../schemas/characterSchema';
  import PromptEditor from './PromptEditor.svelte';

  let { portrait, dirPath, portraitFile, disabled, onimage, onfigure }: {
    portrait: PortraitSource;
    /** Schlüssel des Auftrags — er gehört zum Charakter, nicht zu dieser Komponente. */
    dirPath: string;
    /** Das gespeicherte Portrait — Gesicht für die Figur, solange keine neue Vorschau da ist. */
    portraitFile: string;
    disabled: boolean;
    onimage: (image: GeneratedImage) => Promise<void>;
    onfigure: (image: GeneratedImage) => Promise<void>;
  } = $props();

  const STYLE_STORAGE_KEY = 'imagegen-style';

  const job = $derived(portraitJob(dirPath));
  let tab = $state<'portrait' | 'figure'>('portrait');
  let style = $state(localStorage.getItem(STYLE_STORAGE_KEY) ?? DEFAULT_ART_STYLE);
  let extra = $state('');
  let editedPrompt = $state<string | null>(null);
  let editedFigurePrompt = $state<string | null>(null);
  let providerId = $state(activeImageProvider());
  /** `undefined` = wird noch geprüft, `null` = nicht eingerichtet. */
  let ready = $state<ReadyProvider | null | undefined>();
  let saving = $state(false);
  const busy = $derived(job.busy || saving);
  let translating = $state(false);
  /** Die Übersetzung gilt je Feld nur, solange dessen deutscher Text noch derselbe ist. */
  let translation = $state<TranslatedTexts | null>(null);
  let dialog = $state<HTMLDialogElement>();

  $effect(() => { localStorage.setItem(STYLE_STORAGE_KEY, style); });

  // Ein offener Dialog verschwindet mit dem Formular; der Auftrag wartet dann minimiert.
  $effect(() => {
    const j = job;
    return () => { if (j.busy || j.result || j.figure || j.error) j.minimized = true; };
  });

  function selectStyle(id: string) {
    if (editedPrompt !== null) editedPrompt = restyle(editedPrompt, style, id);
    style = id;
  }

  const motif = $derived([
    portrait.species.name.trim(),
    portrait.classes.map((cl) => cl.name.trim()).filter(Boolean).join(' / '),
  ].filter(Boolean).join(' · '));
  const germanTexts = $derived(portraitTexts(portrait, extra));
  const english = $derived(currentEnglish(germanTexts, translation));
  const untranslated = $derived(
    (Object.keys(germanTexts) as PortraitTextKey[]).filter((k) => germanTexts[k] && !english[k]).length,
  );
  const provider = $derived(imageProvider(providerId));
  const prompt = $derived(editedPrompt ?? withArtStyle(buildPortraitSubject(portrait, extra, english), style));
  const figurePrompt = $derived(editedFigurePrompt ?? figureFacePrompt(figureTraits(portrait, english)));
  const tooLong = $derived(promptLimitError(provider, tab === 'portrait' ? prompt : figurePrompt));

  async function selectProvider(id: string) {
    providerId = id;
    setActiveImageProvider(id);
    ready = undefined;
    const r = await readyProvider(imageProvider(id));
    if (providerId === id) ready = r;
  }

  function openDialog() {
    if (job.busy || job.minimized) return restore();
    discardPortrait(job);
    dialog?.showModal();
    void selectProvider(activeImageProvider());
  }

  function minimize() {
    job.minimized = true;
    dialog?.close();
  }

  function restore() {
    job.minimized = false;
    dialog?.showModal();
    // Erst beim Öffnen, damit ein gerade in den Einstellungen hinterlegter Zugang greift.
    void selectProvider(activeImageProvider());
  }

  /** Escape während des Malens minimiert, statt den Auftrag ohne Leiste weiterlaufen zu lassen. */
  function onClose() {
    if (job.busy) job.minimized = true;
    else if (!job.minimized) discardPortrait(job);
  }

  function run() {
    if (ready) void generatePortrait(job, ready, prompt);
  }

  const figureProvider = $derived(!!provider.maxReferences);

  async function faceSource(preview: GeneratedImage | null, file: string): Promise<GeneratedImage> {
    if (preview) return preview;
    const b64 = await invoke<string>('read_file_base64', { path: `${dirPath}/${file}` });
    return { b64, ext: file.toLowerCase().endsWith('.png') ? 'png' : 'jpg' };
  }

  // Erst geladen, wenn der Tab Figur einmal offen war — ein gespeichertes Portrait sind schnell 3 MB.
  let figureTabSeen = $state(false);
  $effect(() => { if (tab === 'figure') figureTabSeen = true; });

  /** Das ganze Portrait; als Bild 1 geht nur `crop` daraus raus. */
  let face = $state<{ src: string; width: number; height: number } | null>(null);
  let crop = $state<Crop>({ x: 0, y: 0, width: 0, height: 0 });
  $effect(() => {
    const preview = job.result;
    const file = portraitFile;
    if (!figureTabSeen || (!preview && !file)) return;
    let live = true;
    faceSource(preview, file).then(async (img) => {
      const src = imageDataUrl(img);
      const { naturalWidth: width, naturalHeight: height } = await loadImage(src);
      if (!live) return;
      face = { src, width, height };
      crop = defaultCrop(width, height);
    }).catch((e) => { if (live) job.error = `Portrait ließ sich nicht laden: ${e}`; });
    return () => {
      live = false;
      face = null;
    };
  });

  function runFigure() {
    const r = ready;
    const f = face;
    const area = { ...crop };
    const text = figurePrompt;
    if (!r || !f) return;
    void generateFigure(job, async (signal) => figureFromPortrait(
      r, await toReference(f.src, area), portrait.species.sourceKey, portrait.presentation || undefined, text, signal));
  }

  async function translate() {
    job.error = '';
    translating = true;
    const source = { ...germanTexts };
    try {
      const en = await runAiAction($llmConfig, buildPortraitTranslateAction(), buildPortraitTranslateInput(source));
      translation = { source, en };
    } catch (e) {
      job.error = `Übersetzung fehlgeschlagen: ${e instanceof Error ? e.message : e}`;
    } finally {
      translating = false;
    }
  }

  async function accept(kind: 'result' | 'figure', save: (image: GeneratedImage) => Promise<void>) {
    const image = job[kind];
    if (!image) return;
    saving = true;
    try {
      await save(image);
      job[kind] = null;
      if (!job.result && !job.figure) dialog?.close();
    } catch (e) {
      job.error = `Bild konnte nicht gespeichert werden: ${e}`;
    } finally {
      saving = false;
    }
  }
</script>

{#snippet translateButton(edited: string | null)}
  {#if !provider.understandsGerman && edited === null}
    {#if untranslated}
      <button class="btn-add" onclick={translate} disabled={busy || translating}
        title="Merkmale und Zusätzlich über das eingestellte Sprachmodell ins Englische übersetzen">
        {translating ? 'Übersetze…' : 'Ins Englische übersetzen'}
      </button>
    {:else if Object.keys(english).length}
      <em>englisch</em>
    {/if}
  {/if}
{/snippet}

{#snippet preview(image: GeneratedImage | null, alt: string, figure = false)}
  {#if image}
    <img src={imageDataUrl(image)} {alt} class:stale={busy} />
  {:else}
    <div class="placeholder" class:figure>{busy ? 'Male…' : 'Noch kein Bild'}</div>
  {/if}
{/snippet}

<button class="btn-add" onclick={openDialog} {disabled}>Generieren…</button>

<dialog bind:this={dialog} class="gen-dialog" onclose={onClose}>
  <div class="head">
    <h4>Bild generieren</h4>
    <button class="btn-add" onclick={minimize} title="Minimieren und am Charakter weiterarbeiten">Minimieren</button>
  </div>

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
    </div>

    <div class="result">
      {#if tab === 'portrait'}
        {@render preview(job.result, 'Vorschau')}
      {:else}
        {@render preview(job.figure, 'Figur', true)}
      {/if}
    </div>
  </div>

  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'portrait'} class:active={tab === 'portrait'}
      onclick={() => { tab = 'portrait'; }}>Portrait</button>
    <button role="tab" aria-selected={tab === 'figure'} class:active={tab === 'figure'}
      onclick={() => { tab = 'figure'; }}>Figur</button>
  </div>

  {#if tab === 'portrait'}
    <label class="row">
      <span>Stil</span>
      <select value={style} disabled={busy} onchange={(e) => selectStyle(e.currentTarget.value)}>
        {#each ART_STYLES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
      </select>
    </label>
    <label class="free">
      <span>Zusätzlich</span>
      <textarea bind:value={extra} rows="2" disabled={busy || editedPrompt !== null}
        placeholder="z. B. Narbe über dem linken Auge, trägt eine Kapuze"></textarea>
    </label>
    <PromptEditor generated={prompt} bind:edited={editedPrompt} {busy} maxChars={provider.maxPromptChars}>
      {#snippet head()}{@render translateButton(editedPrompt)}{/snippet}
    </PromptEditor>
  {:else}
    <div class="face">
      {#if face}
        <div class="face-crop">
          <CropPicker src={face.src} width={face.width} height={face.height} bind:crop disabled={busy} />
        </div>
      {/if}
      <div class="hint">
        <p>
          Die Gliederpuppe zu Volk und Äußerem mit dem Gesicht
          {job.result ? 'der Portrait-Vorschau' : portraitFile ? 'des gespeicherten Portraits' : '— noch kein Portrait da'}.
        </p>
        {#if face}
          <p>
            Nur der Rahmen geht als Bild 1 mit — bei Bedarf enger auf Kopf und Haare ziehen. Verschieben durch Ziehen,
            Größe an den Ecken. Bild 2 ist die Puppe.
          </p>
          <button class="btn-add" onclick={() => { if (face) crop = defaultCrop(face.width, face.height); }} disabled={busy}>
            Ausschnitt zurücksetzen
          </button>
        {/if}
      </div>
    </div>
    <PromptEditor generated={figurePrompt} bind:edited={editedFigurePrompt} {busy} maxChars={provider.maxPromptChars}>
      {#snippet head()}{@render translateButton(editedFigurePrompt)}{/snippet}
    </PromptEditor>
  {/if}

  {#if ready === null}
    <div class="error-sm">{provider.label} ist nicht eingerichtet – in den KI-Einstellungen hinterlegen.</div>
  {/if}
  {#if tab === 'figure' && !figureProvider}
    <div class="error-sm">{provider.label} kann keine Vorlagenbilder verarbeiten – für die Figur Cloudflare wählen.</div>
  {/if}
  {#if tooLong}<div class="error-sm">{tooLong} Kürzen oder einen anderen Anbieter wählen.</div>{/if}
  {#if job.error}<div class="error-sm">{job.error}</div>{/if}

  <div class="dialog-actions">
    {#if job.busy}
      <button class="btn-add" onclick={() => cancelJob(job)} title="Nicht mehr auf das Bild warten">Malen abbrechen</button>
    {:else}
      <button class="btn-add" onclick={() => dialog?.close()} disabled={busy}>Abbrechen</button>
    {/if}
    {#if tab === 'portrait'}
      <button class="btn-add" class:primary={!job.result} onclick={run}
        disabled={disabled || busy || !ready || !prompt.trim() || !!tooLong}>
        {busy ? 'Male…' : job.result ? 'Nochmal' : 'Generieren'}
      </button>
      {#if job.result}
        <button class="btn-add primary" onclick={() => accept('result', onimage)} disabled={disabled || busy}>Übernehmen</button>
      {/if}
    {:else}
      <button class="btn-add" class:primary={!job.figure} onclick={runFigure}
        disabled={disabled || busy || !ready || !figureProvider || !face || !figurePrompt.trim() || !!tooLong}>
        {busy ? 'Male…' : job.figure ? 'Nochmal' : 'Figur generieren'}
      </button>
      {#if job.figure}
        <button class="btn-add primary" onclick={() => accept('figure', onfigure)} disabled={disabled || busy}>Übernehmen</button>
      {/if}
    {/if}
  </div>
</dialog>

{#if job.minimized}
  {@const shown = job.figure ?? job.result}
  <div class="gen-mini" role="status">
    {#if shown && !busy}
      <img src={imageDataUrl(shown)} alt="Vorschau" />
    {/if}
    <span>{busy ? 'Bild wird gemalt…' : job.error ? 'Bild fehlgeschlagen' : shown ? 'Bild fertig' : 'Bild'}</span>
    <button class="btn-add primary" onclick={restore}>{shown && !busy ? 'Ansehen' : 'Öffnen'}</button>
    {#if job.busy}
      <button class="btn-add" onclick={() => cancelJob(job)} title="Malen abbrechen">✕</button>
    {:else if !saving}
      <button class="btn-add" onclick={() => discardPortrait(job)} title="Verwerfen">✕</button>
    {/if}
  </div>
{/if}

<style>
  .gen-dialog {
    width: min(860px, 92vw);
    background: var(--bg);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
  }
  .gen-dialog::backdrop { background: rgb(0 0 0 / 0.4); }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
  .head h4 { margin: 0; }
  .gen-mini {
    position: fixed; right: 1rem; bottom: 1rem; z-index: 50;
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.25);
    font-size: 0.8rem;
  }
  .gen-mini img { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; }
  .gen-mini .primary { background: var(--green); color: var(--bg); font-weight: 700; }
  .layout { display: grid; grid-template-columns: 1fr auto; gap: 1rem; }
  .motif { font-size: 0.85rem; margin-bottom: 0.4rem; }
  .motif span { color: var(--ink-muted); margin-right: 0.4rem; }
  .traits { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.3rem 0.6rem; }
  .traits .wide { grid-column: 1 / -1; }
  .traits textarea { resize: vertical; font-family: inherit; }
  .hint { margin: 0.4rem 0 0.7rem; font-size: 0.75rem; color: var(--ink-muted); }
  .row { display: flex; flex-direction: row; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.8rem; }
  .free { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; }
  .free textarea { width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
  .result img, .placeholder { width: 240px; border-radius: 6px; }
  .result img { height: auto; display: block; }
  .result img.stale { opacity: 0.5; }
  .placeholder {
    aspect-ratio: 3 / 4;
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--border); color: var(--ink-muted); font-size: 0.8rem;
  }
  .placeholder.figure { aspect-ratio: 2 / 3; }
  .face { display: flex; gap: 0.8rem; align-items: flex-start; }
  .face-crop { width: 200px; flex: none; }
  .face .hint p { margin: 0 0 0.4rem; }
  .tabs { display: flex; gap: 0.2rem; margin: 0.8rem 0 0.6rem; border-bottom: 1px solid var(--border); }
  .tabs button {
    background: none; border: none; border-bottom: 2px solid transparent;
    padding: 0.3rem 0.8rem; margin-bottom: -1px; color: var(--ink-muted); cursor: pointer; font: inherit;
  }
  .tabs button.active { color: var(--ink); border-bottom-color: var(--green); font-weight: 700; }
  .error-sm { margin-top: 0.5rem; }
  .dialog-actions { display: flex; justify-content: flex-end; gap: 0.4rem; margin-top: 0.8rem; }
  .dialog-actions .primary { background: var(--green); color: var(--bg); font-weight: 700; }
  .dialog-actions button:disabled { opacity: 0.5; cursor: default; }
</style>
