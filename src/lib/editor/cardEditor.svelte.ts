/**
 * Gemeinsames Fundament für alle Karten-Editoren (Monster, Zauber, Encounter,
 * Gegenstand, später Charakter-JSON).
 *
 * Der Controller besitzt den kompletten Lebenszyklus — Laden bei `activeFile`-Wechsel,
 * Dirty-Tracking (abgeleitet aus `snapshot(draft) !== baseline`, kein manuelles `mark()`),
 * Speichern/Verwerfen/JSON-Speichern und die Registrierung beim Navigations-Guard.
 *
 * Die Darstellung (Karte/Form/JSON, eigenes Layout) und Erweiterungen (KI-Aktionen,
 * spezielle Speicher-Pfad-Logik, Text-Spiegel) bleiben Sache der jeweiligen Komponente
 * und werden über die Config-Hooks eingebracht. Gleiches Fundament, unterschiedlich
 * ausgebaut.
 */
import { onMount } from 'svelte';
import { get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { activeFile, setFileContent } from '$lib/stores/campaign';
import { registerEditorGuard } from '$lib/stores/navigationGuard';
import { pushError } from '$lib/stores/errors';
import type { FileEntry } from '$lib/types';

export type CardTab = 'karte' | 'bearbeiten' | 'json';

export interface CardEditorConfig<T> {
  /** FileEntry.type, den dieser Editor lädt (z.B. 'monster'). */
  type: FileEntry['type'];
  /** Dateiinhalt → getyptes Objekt (null bei ungültig/Schema-Fehler). */
  parse: (content: string) => T | null;
  /** Draft → Dateiinhalt. Default: JSON.stringify(snapshot, null, 2). */
  serialize?: (draft: T) => string;
  /** Start-Tab nach dem Laden. Default 'bearbeiten'. */
  defaultTab?: CardTab;
  /**
   * Serialisierter Vergleichsstand für den Dirty-Check. Default = serialize(draft).
   * Überschreiben, wenn zusätzlicher Komponenten-State zum Inhalt beiträgt
   * (z.B. ItemCard mit Text-Spiegeln).
   */
  snapshot?: (draft: T) => string;
  /** Default `() => draft != null`. ItemCard: nur im Bearbeiten-Modus dirty. */
  isEditing?: () => boolean;
  /** Zusätzliche Dirty-Bedingung (ODER-verknüpft), z.B. ungespeicherter Neuanlage-Entwurf. */
  extraDirty?: () => boolean;
  /** Fehlertext für die Anzeige. */
  label?: string;
  /**
   * Persistiert den Draft. Default: schreibt `content` nach `file.path`.
   * Rückgabe `false` bricht ab, ohne den gespeicherten Stand zu aktualisieren
   * (z.B. ItemCard öffnet „Speichern unter" für Neuanlagen → dirty bleibt).
   */
  persist?: (args: { draft: T; content: string; file: FileEntry }) => Promise<boolean>;
  /** Nach erfolgreichem Laden (z.B. Seitendaten nachladen, Tab anpassen). */
  onLoad?: (content: string, path: string) => void;
}

export class CardEditor<T> {
  tab = $state<CardTab>('bearbeiten');
  draft = $state<T | null>(null);
  saveError = $state('');
  lastSavedContent = $state('');
  #baseline = $state('');

  #cfg: CardEditorConfig<T>;

  constructor(cfg: CardEditorConfig<T>) {
    this.#cfg = cfg;
    this.tab = cfg.defaultTab ?? 'bearbeiten';

    onMount(() => {
      const initial = get(activeFile);
      if (initial?.type === cfg.type && initial.path) this.#load(initial.path);

      const unsub = activeFile.subscribe((file) => {
        if (file?.type === cfg.type && file.path) this.#load(file.path);
      });

      const unguard = registerEditorGuard({
        isDirty: () => this.dirty,
        save: async () => {
          await this.save();
          if (this.dirty) throw new Error('Speichern unvollständig'); // Navigation abbrechen
        },
        discard: () => this.discard(),
      });

      return () => { unsub(); unguard(); };
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
    if (this.#cfg.extraDirty?.()) return true;
    const editing = this.#cfg.isEditing ? this.#cfg.isEditing() : this.draft != null;
    if (!editing || this.draft == null) return false;
    return this.#snapshot(this.draft) !== this.#baseline;
  });

  async #load(path: string) {
    try {
      const content = await invoke<string>('read_file_content', { path });
      this.applyContent(content);
      this.tab = this.#cfg.defaultTab ?? 'bearbeiten';
      this.#cfg.onLoad?.(content, path);
    } catch (e) {
      pushError(`${this.#cfg.label ?? 'Datensatz'} konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`);
      this.draft = null;
      this.lastSavedContent = '';
    }
  }

  /** Setzt den Editor auf den gegebenen Inhalt (geladene Datei oder externer Entwurf). */
  applyContent(content: string) {
    this.lastSavedContent = content;
    const parsed = this.#cfg.parse(content);
    this.draft = parsed != null ? (structuredClone(parsed) as T) : null;
    this.saveError = '';
    setFileContent(content);
    this.captureBaseline();
  }

  async save() {
    if (this.draft == null) return;
    const file = get(activeFile);
    if (!file?.path) return;
    const content = this.#serialize(this.draft);
    try {
      let ok = true;
      if (this.#cfg.persist) {
        ok = await this.#cfg.persist({ draft: this.draft, content, file });
      } else {
        await invoke('write_file_content', { path: file.path, content });
      }
      if (!ok) return; // abgebrochen (z.B. „Speichern unter") → dirty bleibt
      this.lastSavedContent = content;
      setFileContent(content);
      this.saveError = '';
      this.captureBaseline();
    } catch (e) {
      this.saveError = `${e}`;
    }
  }

  discard() {
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
