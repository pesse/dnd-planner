<script lang="ts">
  /** Bild wählen — eigenes Bild des Charakters oder ein passendes Stimmungsbild — und aufs Rahmenformat zuschneiden. */
  import { invoke, convertFileSrc } from '@tauri-apps/api/core';
  import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
  import Modal from '../ui/Modal.svelte';
  import CropPicker from './CropPicker.svelte';
  import { aspectCrop, loadImage, toReference, type Crop } from '../../services/imageGen/figureFromPortrait';
  import { resolvePortraitArt, type PortraitArtSource } from '../../services/portraitArt';
  import { GALLERY_EXTENSIONS, importGalleryImage } from '../../services/characterGallery.svelte';
  import type { GalleryImage } from '../../schemas/characterSchema';

  let { label, dirPath, gallery = $bindable(), source, onpick, onclose }: {
    label: string;
    dirPath: string;
    /** Die eigenen Bilder des Bilder-Reiters; ein Hochgeladenes landet dort mit. */
    gallery: GalleryImage[] | undefined;
    /** Ohne Charakterdaten gibt es keine Stimmungsbilder. */
    source?: PortraitArtSource;
    onpick: (b64: string) => Promise<void>;
    onclose: () => void;
  } = $props();

  /** Wie die Vorschau im Editor und das Bild im Bogenkopf: 4:5. */
  const ASPECT = 4 / 5;
  /** Längste Seite des gespeicherten Bildes. */
  const MAX_SIDE = 1000;

  let art = $state<string[] | null>(null);
  let image = $state<{ src: string; width: number; height: number } | null>(null);
  let crop = $state<Crop>({ x: 0, y: 0, width: 0, height: 0 });
  let busy = $state(false);
  let error = $state('');

  let own = $state<{ file: string; caption: string; url: string }[]>([]);
  $effect(() => {
    const images = gallery ?? [];
    void Promise.all(images.map(async (g) => {
      const abs = await invoke<string>('get_absolute_path', { path: `${dirPath}/${g.file}` }).catch(() => '');
      return { ...g, url: abs ? convertFileSrc(abs) : '' };
    })).then((list) => { own = list.filter((g) => g.url); });
  });

  $effect(() => {
    if (!source) { art = []; return; }
    void resolvePortraitArt(source).then((urls) => { art = urls; });
  });

  async function select(src: string) {
    error = '';
    try {
      const img = await loadImage(src);
      image = { src, width: img.naturalWidth, height: img.naturalHeight };
      crop = aspectCrop(image.width, image.height, ASPECT);
    } catch (e) {
      error = `Bild ließ sich nicht laden: ${e}`;
    }
  }

  async function upload() {
    const selected = await openFileDialog({ multiple: false, filters: [{ name: 'Bilder', extensions: GALLERY_EXTENSIONS }] });
    if (!selected || Array.isArray(selected)) return;
    const added = await importGalleryImage(dirPath, selected, new Set((gallery ?? []).map((g) => g.file)));
    gallery = [...(gallery ?? []), added];
    const abs = await invoke<string>('get_absolute_path', { path: `${dirPath}/${added.file}` });
    await select(convertFileSrc(abs));
  }

  const blobBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  async function apply() {
    if (!image) return;
    busy = true;
    error = '';
    try {
      const { blob } = await toReference(image.src, crop, MAX_SIDE);
      await onpick(await blobBase64(blob));
      onclose();
    } catch (e) {
      error = `${label} konnte nicht gespeichert werden: ${e}`;
    } finally {
      busy = false;
    }
  }
</script>

<Modal title="{label} wählen" draggable={false} width="min(720px, 94vw)" {onclose}>
  {#if image}
    <div class="crop-wrap">
      <CropPicker src={image.src} width={image.width} height={image.height} bind:crop aspect={ASPECT} disabled={busy} />
    </div>
    <p class="hint">Rahmen verschieben durch Ziehen, Größe an den Ecken.</p>
    <div class="actions">
      <button class="btn-add" onclick={() => { image = null; }} disabled={busy}>Anderes Bild</button>
      <button class="primary-btn" onclick={apply} disabled={busy}>{busy ? '…' : 'Übernehmen'}</button>
    </div>
  {:else}
    <h4>Eigene Bilder</h4>
    <div class="gallery">
      {#each own as g (g.file)}
        <button class="thumb" title={g.caption || g.file} onclick={() => select(g.url)}><img src={g.url} alt={g.caption} loading="lazy" /></button>
      {/each}
      <button class="thumb add" onclick={() => upload().catch((e) => { error = `Bild konnte nicht übernommen werden: ${e}`; })}>
        + Hochladen
      </button>
    </div>
    {#if source}
      <h4>Passende Bilder</h4>
      {#if art === null}
        <p class="hint">Suche Bilder …</p>
      {:else if !art.length}
        <p class="hint">Keine passenden Bilder — dafür braucht es Volk und Klasse und das Bild-Pack.</p>
      {:else}
        <div class="gallery">
          {#each art as url (url)}
            <button class="thumb" onclick={() => select(url)}><img src={url} alt="" loading="lazy" /></button>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
  {#if error}<div class="error-sm">{error}</div>{/if}
</Modal>

<style>
  h4 { margin: 0.9rem 0 0.4rem; font-size: 0.85rem; color: var(--ink-muted); }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 0.5rem; }
  .thumb {
    padding: 0; border: 1px solid var(--border); border-radius: 6px; overflow: hidden;
    background: var(--bg); cursor: pointer; aspect-ratio: 2 / 3;
  }
  .thumb:hover { border-color: var(--border-strong); }
  .thumb.add { border-style: dashed; color: var(--ink-soft); font: inherit; font-size: 0.82rem; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .crop-wrap { max-width: 420px; margin: 0 auto; }
  .hint { font-size: 0.8rem; color: var(--ink-soft); margin: 0.4rem 0; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
