/**
 * Schreibt eine Datei verzögert. Der Pfad wird beim Planen festgehalten, damit ein
 * laufender Timer nach einem Wechsel nicht die falsche Datei überschreibt.
 */
import { invoke } from '@tauri-apps/api/core';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export class AutosaveFile {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #delayMs: number;
  status = $state<SaveStatus>('saved');

  constructor(delayMs = 800) {
    this.#delayMs = delayMs;
  }

  schedule(path: string, content: string) {
    this.status = 'unsaved';
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.#write(path, content), this.#delayMs);
  }

  /** Verwirft einen geplanten Schreibvorgang, ohne den Status anzufassen. */
  cancel() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
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
