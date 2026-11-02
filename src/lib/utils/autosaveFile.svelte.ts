/**
 * Schreibt eine Datei verzögert. Der Pfad wird beim Planen festgehalten, damit ein
 * laufender Timer nach einem Wechsel nicht die falsche Datei überschreibt.
 */
import { invoke } from '@tauri-apps/api/core';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export class AutosaveFile {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #delayMs: number;
  #pending: { path: string; content: string } | null = null;
  status = $state<SaveStatus>('saved');

  constructor(delayMs = 800) {
    this.#delayMs = delayMs;
  }

  schedule(path: string, content: string) {
    this.status = 'unsaved';
    if (this.#timer) clearTimeout(this.#timer);
    this.#pending = { path, content };
    this.#timer = setTimeout(() => void this.flush(), this.#delayMs);
  }

  /** Schreibt einen geplanten Stand sofort, etwa beim Verlassen der Ansicht. */
  async flush() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const pending = this.#pending;
    this.#pending = null;
    if (pending) await this.#write(pending.path, pending.content);
  }

  /** Verwirft einen geplanten Schreibvorgang, ohne den Status anzufassen. */
  cancel() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#pending = null;
  }

  /** Setzt den Status ohne zu schreiben (nach dem Laden vom Datenträger). */
  markSaved() {
    this.status = 'saved';
  }

  async #write(path: string, content: string) {
    try {
      this.status = 'saving';
      await invoke('write_file_content', { path, content });
      this.status = 'saved';
    } catch {
      this.status = 'unsaved';
    }
  }
}
