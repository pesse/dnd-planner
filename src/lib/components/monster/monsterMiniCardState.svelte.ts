/**
 * Lade-/Speicher-/Copy-on-write-Zustand einer Monster-Mini-Karte. Bewusst neben
 * `createCardEditor`: dessen `CardEditorConfig` kennt keine Datei, die an zwei Pfaden
 * liegen kann und beim ersten Bearbeiten global → akt-lokal kopiert wird.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Monster } from '../../types';
import { normalizeMonster } from '../../utils/schemaValidation';
import { toActLocalJson, toLibraryJson } from '../../utils/vaultJson';
import { OWN_SOURCE } from '../../schemas/source';
import { MONSTERS_PATH, globalMonsterCandidates, findGlobalMonsterPath } from '../../monsterLibrary';

function validateMonster(m: unknown): string[] {
  const obj = m as Record<string, unknown>;
  const warns: string[] = [];
  if (!obj || typeof obj !== 'object') return ['Kein Objekt'];

  // ac
  if (typeof obj['ac'] !== 'object' || obj['ac'] === null || !('value' in (obj['ac'] as object)))
    warns.push('ac: erwartet { value, note }, gefunden: ' + JSON.stringify(obj['ac']));

  // hp
  if (typeof obj['hp'] !== 'object' || obj['hp'] === null || !('average' in (obj['hp'] as object)))
    warns.push('hp: erwartet { average, formula }, gefunden: ' + JSON.stringify(obj['hp']));

  // cr
  if (typeof obj['cr'] !== 'string')
    warns.push('cr: erwartet string, gefunden: ' + typeof obj['cr'] + ' (' + obj['cr'] + ')');

  // saving_throws vs saves
  if (!('saving_throws' in obj) && 'saves' in obj)
    warns.push('saving_throws fehlt — heißt das Feld "saves"?');

  // skills values should be strings
  if (obj['skills'] && typeof obj['skills'] === 'object') {
    const badSkills = Object.entries(obj['skills'] as Record<string, unknown>)
      .filter(([, v]) => typeof v !== 'string').map(([k]) => k);
    if (badSkills.length) warns.push('skills: Werte sollten Strings sein, nicht Zahlen (' + badSkills.join(', ') + ')');
  }

  return warns;
}

// structuredClone cannot handle Svelte $state Proxies — use JSON round-trip instead
function snap<T>(val: T): T { return JSON.parse(JSON.stringify(val)); }

export class MonsterMiniCardState {
  status = $state<'loading' | 'ok' | 'missing'>('loading');
  saved = $state<Monster | null>(null);
  draft = $state<Monster | null>(null);
  editMode = $state(false);
  dirty = $state(false);
  saveError = $state('');
  source = $state<'global' | 'act'>('global');
  savePath = $state('');
  promoteError = $state('');
  loadError = $state('');
  schemaWarnings = $state<string[]>([]);

  #slug: () => string;
  #basePath: () => string | undefined;
  #loadSeq = 0;

  constructor(slug: () => string, basePath: () => string | undefined) {
    this.#slug = slug;
    this.#basePath = basePath;

    $effect(() => {
      const s = slug();
      const basePathValue = basePath(); // explicit dep: re-run when path changes
      if (s) this.#load(s, basePathValue);
    });
  }

  async #load(s: string, basePath: string | undefined) {
    const seq = ++this.#loadSeq;
    this.status = 'loading';
    this.loadError = '';
    this.schemaWarnings = [];
    this.promoteError = '';

    // Akt-lokal zuerst
    if (basePath) {
      const actPath = `${basePath}/${s}.json`;
      try {
        const content = await invoke<string>('read_file_content', { path: actPath });
        if (seq !== this.#loadSeq) return;
        const raw = JSON.parse(content);
        this.schemaWarnings = validateMonster(raw);
        const parsed = normalizeMonster(raw as Monster);
        this.saved = parsed;
        this.draft = structuredClone(parsed);
        this.savePath = actPath;
        this.source = 'act';
        this.status = 'ok';
        return;
      } catch { /* nicht akt-lokal vorhanden */ }
    }

    if (seq !== this.#loadSeq) return;

    const tryPaths = await globalMonsterCandidates(s);
    if (seq !== this.#loadSeq) return;

    for (const globalPath of tryPaths) {
      try {
        const content = await invoke<string>('read_file_content', { path: globalPath });
        if (seq !== this.#loadSeq) return;
        const raw = JSON.parse(content);
        this.schemaWarnings = validateMonster(raw);
        const parsed = normalizeMonster(raw as Monster);
        this.saved = parsed;
        this.draft = structuredClone(parsed);
        this.savePath = globalPath;
        this.source = 'global';
        this.status = 'ok';
        return;
      } catch { /* nächsten Pfad versuchen */ }
    }

    if (seq !== this.#loadSeq) return;
    this.loadError = 'nicht in Bibliothek gefunden';
    console.error(`MonsterMiniCard [${s}]: in vault/monsters (inkl. Untergruppen) nicht gefunden`);
    this.status = 'missing';
  }

  async startEdit() {
    const s = this.#slug();
    const basePath = this.#basePath();
    // Copy-on-write: vom globalen Monster erst eine akt-lokale Kopie anlegen.
    if (this.source === 'global' && basePath && this.saved) {
      const actPath = `${basePath}/${s}.json`;
      // Die Kopie ist akt-lokal — die Herkunft des Originals gilt für sie nicht mehr.
      const json = toActLocalJson(this.saved);
      try {
        await invoke('write_file_content', { path: actPath, content: json });
        this.savePath = actPath;
        this.source = 'act';
      } catch (e) {
        this.saveError = `Lokale Kopie konnte nicht angelegt werden: ${e}`;
        return;
      }
    }
    this.draft = snap(this.saved);
    this.dirty = false;
    this.editMode = true;
    this.saveError = '';
  }

  cancelEdit() {
    this.draft = snap(this.saved);
    this.dirty = false;
    this.editMode = false;
    this.saveError = '';
  }

  async save() {
    if (!this.draft) return;
    try {
      const json = this.source === 'act' ? toActLocalJson(this.draft) : toLibraryJson(this.draft);
      await invoke('write_file_content', { path: this.savePath, content: json });
      this.saved = JSON.parse(json);
      this.dirty = false;
      this.saveError = '';
    } catch (e) {
      this.saveError = `${e}`;
    }
  }

  async promoteToLibrary() {
    if (this.source !== 'act') return;
    const s = this.#slug();
    this.promoteError = '';
    // Existiert der Slug global schon, legte `rename_file` ein Duplikat an.
    const existing = await findGlobalMonsterPath(s);
    if (existing) {
      this.promoteError = `„${s}" existiert bereits in der Bibliothek (${existing}). Verschieben abgebrochen.`;
      return;
    }
    const globalPath = `${MONSTERS_PATH}/${s}.json`;
    try {
      await invoke('rename_file', { oldPath: this.savePath, newPath: globalPath });
      // In der Bibliothek gilt die Herkunftspflicht: ein übernommenes Monster ist
      // immer eigenes Material — auch wenn es als Kopie eines SRD-Monsters begann.
      const promoted = { ...this.saved, source: OWN_SOURCE } as Monster;
      await invoke('write_file_content', { path: globalPath, content: toLibraryJson(promoted) });
      this.saved = promoted;
      this.draft = snap(promoted);
      this.savePath = globalPath;
      this.source = 'global';
    } catch (e) {
      this.promoteError = `${e}`;
    }
  }

  mark() { this.dirty = true; }
}

export function createMonsterMiniCardState(
  slug: () => string,
  basePath: () => string | undefined,
): MonsterMiniCardState {
  return new MonsterMiniCardState(slug, basePath);
}
