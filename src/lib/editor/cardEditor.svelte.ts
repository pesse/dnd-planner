/**
 * Gemeinsames Fundament für alle Karten-Editoren (Monster, Zauber, Encounter,
 * Gegenstand, später Charakter-JSON).
 *
 * Der Controller besitzt den kompletten Lebenszyklus — Laden bei `activeFile`-Wechsel,
 * Dirty-Tracking (abgeleitet aus `snapshot(draft) !== baseline`, kein manuelles `mark()`),
 * Speichern (inkl. Ordner-Umzug bei Bucket-Wechsel), Verwerfen, JSON-Speichern,
 * Neuanlage als ungespeicherter Draft + „Speichern unter" und die Registrierung beim
 * Navigations-Guard.
 *
 * Eager Draft: die Karte rendert direkt den Draft. Darstellung und Erweiterungen
 * (KI-Aktionen, Druck, …) bleiben Sache der Komponente. Gleiches Fundament,
 * unterschiedlich ausgebaut.
 */
import { onMount } from 'svelte';
import { get, writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { activeFile, setFileContent } from '$lib/stores/campaign';
import { preferredCardTab } from '$lib/stores/uiPrefs';
import { registerEditorGuard } from '$lib/stores/navigationGuard';
import { openSaveAs, slugify, type SaveAsBucket } from '$lib/editor/saveAs';
import { pushError } from '$lib/stores/errors';
import type { FileEntry } from '$lib/types';

// Standard-Tabs + beliebige Extra-Tab-Ids (z.B. Charakter: 'details', 'notes').
export type CardTab = 'karte' | 'bearbeiten' | 'json' | (string & {});

/**
 * Ablage-Abstraktion: wo lebt die Datei? Der „Bucket" ist typ-spezifisch
 * (Monster: flach, Zauber: Schule, Gegenstand: Kategorie, Encounter: Akt).
 */
export interface LocationConfig<T> {
  /** Beschriftung des Bucket-Selektors im Save-as-Dialog. Fehlt → flach (kein Selektor). */
  bucketLabel?: string;
  /** Aktueller Bucket eines Drafts (aus Draft-Daten oder Kontext). */
  bucketOf?: (draft: T) => string | undefined;
  /** Auswählbare Buckets für den Save-as-Dialog. */
  buckets?: () => SaveAsBucket[] | Promise<SaveAsBucket[]>;
  /** Voller Dateipfad für Draft + (geslugteten) Namen + Bucket. */
  resolvePath: (draft: T, name: string, bucket?: string) => string;
}

/** Pending-Draft für Neuanlagen — die passende Karte übernimmt ihn via startNew. */
export const newCardDraft = writable<{ type: FileEntry['type']; data: unknown } | null>(null);

export interface CardEditorConfig<T> {
  /** FileEntry.type, den dieser Editor lädt (z.B. 'monster'). */
  type: FileEntry['type'];
  /** Dateiinhalt → getyptes Objekt (null bei ungültig/Schema-Fehler). */
  parse: (content: string) => T | null;
  /** Draft → Dateiinhalt. Default: JSON.stringify(snapshot, null, 2). */
  serialize?: (draft: T) => string;
  /** Erzwingt einen festen Start-Tab (überschreibt den übergreifend gemerkten Modus). */
  defaultTab?: CardTab;
  /**
   * Serialisierter Vergleichsstand für den Dirty-Check. Default = serialize(draft).
   * Überschreiben, wenn zusätzlicher Komponenten-State zum Inhalt beiträgt
   * (z.B. ItemCard mit Text-Spiegeln).
   */
  snapshot?: (draft: T) => string;
  /** Default `() => draft != null`. ItemCard: nur im Bearbeiten-Modus dirty. */
  isEditing?: () => boolean;
  /** Zusätzliche Dirty-Bedingung (ODER-verknüpft). */
  extraDirty?: () => boolean;
  /** Fehlertext-Präfix für Lade-Fehler. */
  label?: string;
  /** Vorbelegter Name im Save-as-Dialog. */
  defaultName?: (draft: T) => string;
  /** Ablage-/Pfad-Logik (für Ordner-Umzug & Save-as). */
  location?: LocationConfig<T>;
  /** Nach erfolgreichem Speichern (Cache invalidieren etc.). */
  onSaved?: (path: string, info: { moved: boolean; oldPath?: string }) => void;
  /** Nach erfolgreichem Laden (Seitendaten nachladen). */
  onLoad?: (content: string, path: string) => void;
}

export class CardEditor<T> {
  tab = $state<CardTab>('bearbeiten');
  draft = $state<T | null>(null);
  saveError = $state('');
  lastSavedContent = $state('');
  /** true = ungespeicherter Neuanlage-Draft ohne Backing-Datei. */
  isNew = $state(false);
  #baseline = $state('');

  #cfg: CardEditorConfig<T>;

  constructor(cfg: CardEditorConfig<T>) {
    this.#cfg = cfg;
    // Start im übergreifend zuletzt gewählten Modus (Karte/Bearbeiten), sofern der
    // Editor keinen festen defaultTab erzwingt.
    this.tab = cfg.defaultTab ?? get(preferredCardTab);

    // Tab-Wechsel des Nutzers übergreifend merken (json bewusst ausgenommen).
    $effect(() => {
      if (this.tab === 'karte' || this.tab === 'bearbeiten') preferredCardTab.set(this.tab as 'karte' | 'bearbeiten');
    });

    onMount(() => {
      const initial = get(activeFile);
      if (initial?.type === cfg.type && initial.path) this.#load(initial.path);

      const unsub = activeFile.subscribe((file) => {
        if (file?.type === cfg.type && file.path) this.#load(file.path);
      });

      // Neuanlage: passenden Pending-Draft übernehmen.
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

  /** Erfasst den aktuellen Stand als Vergleichsbasis für „wirklich geändert?". */
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
      // Bestehenden Datensatz im übergreifend zuletzt gewählten Modus öffnen
      // (fester defaultTab hat Vorrang).
      this.tab = this.#cfg.defaultTab ?? get(preferredCardTab);
      this.#cfg.onLoad?.(content, path);
    } catch (e) {
      pushError(`${this.#cfg.label ?? 'Datensatz'} konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`);
      this.draft = null;
      this.lastSavedContent = '';
    }
  }

  /** Setzt den Editor auf den gegebenen Dateiinhalt. */
  applyContent(content: string) {
    this.lastSavedContent = content;
    const parsed = this.#cfg.parse(content);
    this.draft = parsed != null ? (structuredClone(parsed) as T) : null;
    this.saveError = '';
    setFileContent(content);
    this.captureBaseline();
  }

  /**
   * Lädt einen extern erzeugten Draft (z.B. KI-Ergebnis) zur Review in den Editor.
   * Baseline bleibt der zuletzt gespeicherte Stand → der Draft ist sofort „dirty",
   * der Nutzer prüft im Bearbeiten-Tab und speichert selbst. (Kein Schreibzugriff.)
   */
  applyDraft(draft: T) {
    this.draft = structuredClone(draft) as T;
    this.saveError = '';
    this.tab = 'bearbeiten';
  }

  /** Startet eine Neuanlage als ungespeicherten Draft (Anlage-Flow ruft das auf). */
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

      // Bucket-Wechsel (z.B. Kategorie/Schule) → Datei umziehen. Nur bei bekanntem
      // Bucket, sonst bleibt die Datei am Ort (keine versehentlichen Umzüge).
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

  /** „Speichern unter": Name + Bucket abfragen und neue Datei anlegen. */
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

    const path = loc.resolvePath(this.draft, slugify(result.name), result.bucket);
    const content = this.#serialize(this.draft);
    try {
      await invoke('write_file_content', { path, content });
    } catch (e) {
      this.saveError = `${e}`;
      return;
    }
    // Dirty sofort (synchron) auflösen, damit der Navigations-Guard nicht noch
    // „ungespeichert" sieht, bevor der asynchrone Reload greift.
    this.isNew = false;
    this.lastSavedContent = content;
    this.captureBaseline();
    this.saveError = '';
    this.#cfg.onSaved?.(path, { moved: false });
    // activeFile umsetzen → Subscription lädt frisch von der neuen Datei.
    activeFile.set({ name: path.split('/').pop()!.replace(/\.json$/, ''), path, type: this.#cfg.type });
  }

  discard() {
    if (this.isNew) {
      // Ungespeicherte Neuanlage verwerfen → Karte schließen.
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

  /** Übernimmt rohes (bereits als JSON valides) JSON als neuen Stand und schreibt es. */
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
