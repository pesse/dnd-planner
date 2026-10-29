/**
 * Zustand des Bilder-Reiters. Die Bilddateien landen beim Hinzufügen sofort im Ordner, die
 * Verknüpfung und die Druckmarkierung gehen über den Draft und damit über die Save-Bar.
 */
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import type { Character, GalleryImage } from '../schemas/characterSchema';
import { artImageId, conceptArtSlots, resolveConceptArt, type ConceptArt } from './characterImages';

export interface ShownImage {
  /** Kennung in `printImages`. */
  id: string;
  label: string;
  url: string;
}

export interface CharacterGallery {
  readonly concept: ConceptArt[];
  readonly own: (GalleryImage & { url: string })[];
  /** Die zum Druck markierten Bilder, in Reiter-Reihenfolge. */
  readonly printed: ShownImage[];
  readonly error: string;
  isPrinted(id: string): boolean;
  togglePrint(id: string): void;
  add(): Promise<void>;
  remove(file: string): void;
  setCaption(file: string, caption: string): void;
}

const IMAGE_DIR = 'images';
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

/** `C:\Bilder\Mein Drache.PNG` → `mein-drache` */
function baseSlug(path: string): string {
  const base = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? '';
  return base.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bild';
}

function freeName(slug: string, ext: string, taken: Set<string>): string {
  for (let i = 1; ; i++) {
    const file = `${IMAGE_DIR}/${i === 1 ? slug : `${slug}-${i}`}.${ext}`;
    if (!taken.has(file)) return file;
  }
}

export function createCharacterGallery(deps: {
  dirPath: () => string;
  /** Der Draft — gelesen für die Anzeige, beschrieben von den Aktionen. */
  character: () => Character | null | undefined;
}): CharacterGallery {
  let concept = $state<ConceptArt[]>([]);
  let urls = $state<Record<string, string>>({});
  let error = $state('');

  const slots = $derived.by(() => {
    const c = deps.character();
    return c ? conceptArtSlots(c) : [];
  });
  // Als String, damit nicht jede Bearbeitung am Charakter die Bilder neu auflöst und flackert.
  const slotKey = $derived(JSON.stringify(slots));

  $effect(() => {
    const list = JSON.parse(slotKey) as typeof slots;
    let live = true;
    void resolveConceptArt(list).then((found) => { if (live) concept = found; });
    return () => { live = false; };
  });

  const gallery = $derived(deps.character()?.gallery ?? []);
  const fileKey = $derived(gallery.map((g) => g.file).join('|'));

  $effect(() => {
    const dir = deps.dirPath();
    const files = fileKey ? fileKey.split('|') : [];
    let live = true;
    void Promise.all(files.map(async (file) => {
      const abs = await invoke<string>('get_absolute_path', { path: `${dir}/${file}` }).catch(() => '');
      // `?v=`: ein entfernter und neu gewählter Name bekäme sonst die gecachten alten Bytes.
      return [file, abs ? `${convertFileSrc(abs)}?v=${Date.now()}` : ''] as const;
    })).then((pairs) => { if (live) urls = Object.fromEntries(pairs); });
    return () => { live = false; };
  });

  const own = $derived(gallery.map((g) => ({ ...g, url: urls[g.file] ?? '' })));
  const printIds = $derived(new Set(deps.character()?.printImages ?? []));

  const printed = $derived([
    ...concept.map((a) => ({ id: artImageId(a.name), label: a.label, url: a.url })),
    ...own.map((g) => ({ id: g.file, label: g.caption, url: g.url })),
  ].filter((img) => img.url && printIds.has(img.id)));

  function setPrinted(c: Character, id: string, on: boolean) {
    const next = [...(c.printImages ?? []).filter((x) => x !== id), ...(on ? [id] : [])];
    // Leer fällt das Feld weg — sonst wäre der Draft nach An-und-wieder-Aus ungespeichert.
    if (next.length) c.printImages = next;
    else delete c.printImages;
  }

  return {
    get concept() { return concept; },
    get own() { return own; },
    get printed() { return printed; },
    get error() { return error; },

    isPrinted: (id) => printIds.has(id),

    togglePrint(id) {
      const c = deps.character();
      if (c) setPrinted(c, id, !printIds.has(id));
    },

    async add() {
      error = '';
      const selected = await openFileDialog({ multiple: true, filters: [{ name: 'Bilder', extensions: EXTENSIONS }] });
      const paths = !selected ? [] : Array.isArray(selected) ? selected : [selected];
      const taken = new Set(gallery.map((g) => g.file));
      const added: GalleryImage[] = [];
      for (const src of paths) {
        try {
          const ext = src.split('.').pop()!.toLowerCase().replace('jpeg', 'jpg');
          const file = freeName(baseSlug(src), ext, taken);
          const data = await invoke<string>('read_file_base64', { path: src });
          await invoke('write_file_base64', { path: `${deps.dirPath()}/${file}`, data });
          taken.add(file);
          added.push({ file, caption: '' });
        } catch (e) {
          error = `Bild konnte nicht übernommen werden: ${e}`;
        }
      }
      const c = deps.character();
      if (c && added.length) c.gallery = [...(c.gallery ?? []), ...added];
    },

    // Nur die Verknüpfung: wer verwirft, behielte sonst einen Eintrag ohne Datei.
    remove(file) {
      const c = deps.character();
      if (!c) return;
      const next = (c.gallery ?? []).filter((g) => g.file !== file);
      if (next.length) c.gallery = next;
      else delete c.gallery;
      setPrinted(c, file, false);
    },

    setCaption(file, caption) {
      const c = deps.character();
      const entry = c?.gallery?.find((g) => g.file === file);
      if (entry) entry.caption = caption;
    },
  };
}
