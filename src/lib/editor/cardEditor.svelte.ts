/**
 * Der Lebenszyklus JEDES Karten-Editors — Laden, Speichern, Verwerfen, Neuanlage und die
 * Registrierung beim Navigations-Guard. Dirty ist abgeleitet (`snapshot(draft) !== baseline`),
 * es gibt bewusst kein manuelles `mark()`; Darstellung bleibt Sache der Komponente.
 */
import { onMount } from 'svelte';
import { get, writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { activeFile, setFileContent } from '$lib/stores/campaign';
import { preferredCardTab } from '$lib/stores/uiPrefs';
import { registerEditorGuard } from '$lib/stores/navigationGuard';
import { openSaveAs, type SaveAsBucket } from '$lib/editor/saveAs';
import { slugKeepUmlauts } from '$lib/utils/text';
import { pushError } from '$lib/stores/errors';
import type { FileEntry } from '$lib/types';

export type CardTab = 'karte' | 'bearbeiten' | 'json' | (string & {});

/** Der „Bucket" ist typ-spezifisch: Monster flach, Zauber Schule, Gegenstand Kategorie. */
export interface LocationConfig<T> {
  /** Fehlt → flache Ablage, kein Selektor im Save-as-Dialog. */
  bucketLabel?: string;
  bucketOf?: (draft: T) => string | undefined;
  buckets?: () => SaveAsBucket[] | Promise<SaveAsBucket[]>;
  resolvePath: (draft: T, name: string, bucket?: string) => string;
}

/** Die passende Karte übernimmt ihn via `startNew`. */
export const newCardDraft = writable<{ type: FileEntry['type']; data: unknown } | null>(null);

export interface CardEditorConfig<T> {
  type: FileEntry['type'];
  /** null bei ungültigem Inhalt oder Schema-Fehler. */
  parse: (content: string) => T | null;
  /** Default: `JSON.stringify(snapshot, null, 2)`. */
  serialize?: (draft: T) => string;
  /** Überschreibt den übergreifend gemerkten Modus. */
  defaultTab?: CardTab;
  /** Überschreiben, wenn zusätzlicher Komponenten-State zum Inhalt beiträgt. */
  snapshot?: (draft: T) => string;
  /** Default `() => draft != null`. */
  isEditing?: () => boolean;
  extraDirty?: () => boolean;
  label?: string;
  defaultName?: (draft: T) => string;
  location?: LocationConfig<T>;
  onSaved?: (path: string, info: { moved: boolean; oldPath?: string }) => void;
  onLoad?: (content: string, path: string) => void;
}

export class CardEditor<T> {
  tab = $state<CardTab>('bearbeiten');
  draft = $state<T | null>(null);
  saveError = $state('');
  lastSavedContent = $state('');
  /** Neuanlage-Draft ohne Backing-Datei. */
  isNew = $state(false);
  #baseline = $state('');

  #cfg: CardEditorConfig<T>;

  constructor(cfg: CardEditorConfig<T>) {
    this.#cfg = cfg;
    this.tab = cfg.defaultTab ?? get(preferredCardTab);

    // Übergreifend merken; `json` bewusst ausgenommen.
    $effect(() => {
      if (this.tab === 'karte' || this.tab === 'bearbeiten') preferredCardTab.set(this.tab as 'karte' | 'bearbeiten');
    });

    onMount(() => {
      const initial = get(activeFile);
      if (initial?.type === cfg.type && initial.path) this.#load(initial.path);

      const unsub = activeFile.subscribe((file) => {
        if (file?.type === cfg.type && file.path) this.#load(file.path);
      });

      const unsubNew = newCardDraft.subscribe((pending) => {
        if (pending && pending.type === cfg.type) {
          this.startNew(pending.data as T);
          newCardDraft.set(null);
        }
      });

      const unguard = registerEditorGuard({
        isDirty: () => this.dirty,
        save: async () => {
          await this.save();
          if (this.dirty) throw new Error('Speichern unvollständig'); // Navigation abbrechen
        },
        discard: () => this.discard(),
      });

      return () => { unsub(); unsubNew(); unguard(); };
    });
  }

  #serialize(draft: T): string {
    return this.#cfg.serialize
      ? this.#cfg.serialize(draft)
      : JSON.stringify($state.snapshot(draft), null, 2);
  }

  #snapshot(draft: T): string {
    return this.#cfg.snapshot ? this.#cfg.snapshot(draft) : this.#serialize(draft);
  }

  captureBaseline() {
    this.#baseline = this.draft != null ? this.#snapshot(this.draft) : '';
  }

  dirty = $derived.by(() => {
    if (this.isNew) return true;
    if (this.#cfg.extraDirty?.()) return true;
    const editing = this.#cfg.isEditing ? this.#cfg.isEditing() : this.draft != null;
    if (!editing || this.draft == null) return false;
    return this.#snapshot(this.draft) !== this.#baseline;
  });

  async #load(path: string) {
    try {
      const content = await invoke<string>('read_file_content', { path });
      this.applyContent(content);
      this.isNew = false;
      this.tab = this.#cfg.defaultTab ?? get(preferredCardTab);
      this.#cfg.onLoad?.(content, path);
    } catch (e) {
      pushError(`${this.#cfg.label ?? 'Datensatz'} konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`);
      this.draft = null;
      this.lastSavedContent = '';
    }
  }

  applyContent(content: string) {
    this.lastSavedContent = content;
    const parsed = this.#cfg.parse(content);
    this.draft = parsed != null ? (structuredClone(parsed) as T) : null;
    this.saveError = '';
    setFileContent(content);
    this.captureBaseline();
  }

  startNew(draft: T) {
    this.draft = structuredClone(draft) as T;
    this.lastSavedContent = '';
    this.isNew = true;
    this.saveError = '';
    this.tab = 'bearbeiten';
    this.captureBaseline();
  }

  async save() {
    if (this.draft == null) return;
    if (this.isNew) { await this.saveAs(); return; }

    const file = get(activeFile);
    if (!file?.path) return;
    const content = this.#serialize(this.draft);

    try {
      let targetPath = file.path;
      let moved = false;

      // Nur bei bekanntem Bucket umziehen — sonst bleibt die Datei am Ort.
      if (this.#cfg.location?.bucketOf) {
        const bucket = this.#cfg.location.bucketOf(this.draft);
        if (bucket) {
          const name = file.path.split('/').pop()!.replace(/\.json$/, '');
          const resolved = this.#cfg.location.resolvePath(this.draft, name, bucket);
          if (resolved !== file.path) {
            await invoke('rename_file', { oldPath: file.path, newPath: resolved });
            targetPath = resolved;
            moved = true;
          }
        }
      }

      await invoke('write_file_content', { path: targetPath, content });
      this.lastSavedContent = content;
      if (moved) activeFile.set({ ...file, path: targetPath });
      setFileContent(content);
      this.saveError = '';
      this.captureBaseline();
      this.#cfg.onSaved?.(targetPath, { moved, oldPath: moved ? file.path : undefined });
    } catch (e) {
      this.saveError = `${e}`;
    }
  }

  async saveAs() {
    if (this.draft == null || !this.#cfg.location) return;
    const loc = this.#cfg.location;
    const buckets = loc.bucketLabel ? await Promise.resolve(loc.buckets?.() ?? []) : [];
    const result = await openSaveAs({
      name: this.#cfg.defaultName?.(this.draft) ?? 'neu',
      bucketLabel: loc.bucketLabel,
      buckets,
      bucket: loc.bucketOf?.(this.draft),
    });
    if (!result) return; // abgebrochen → bleibt dirty/neu

    const path = loc.resolvePath(this.draft, slugKeepUmlauts(result.name), result.bucket);
    const content = this.#serialize(this.draft);
    try {
      await invoke('write_file_content', { path, content });
    } catch (e) {
      this.saveError = `${e}`;
      return;
    }
    // Synchron auflösen: sonst sieht der Navigations-Guard vor dem Reload „ungespeichert".
    this.isNew = false;
    this.lastSavedContent = content;
    this.captureBaseline();
    this.saveError = '';
    this.#cfg.onSaved?.(path, { moved: false });
    activeFile.set({ name: path.split('/').pop()!.replace(/\.json$/, ''), path, type: this.#cfg.type });
  }

  discard() {
    if (this.isNew) {
      this.isNew = false;
      this.draft = null;
      this.saveError = '';
      activeFile.set(null);
      return;
    }
    const parsed = this.#cfg.parse(this.lastSavedContent);
    this.draft = parsed != null ? (structuredClone(parsed) as T) : null;
    this.saveError = '';
    this.captureBaseline();
  }

  async saveJson(rawJson: string) {
    const file = get(activeFile);
    if (!file?.path) return;
    await invoke('write_file_content', { path: file.path, content: rawJson });
    this.lastSavedContent = rawJson;
    setFileContent(rawJson);
    const parsed = this.#cfg.parse(rawJson);
    this.draft = parsed != null ? (structuredClone(parsed) as T) : null;
    this.saveError = '';
    this.captureBaseline();
  }
}

export function createCardEditor<T>(cfg: CardEditorConfig<T>): CardEditor<T> {
  return new CardEditor<T>(cfg);
}
