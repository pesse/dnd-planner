/**
 * Editor-Zustand einer NPC-Karte: Draft aus `createCardEditor` plus Autosave und die
 * rohe-JSON-Ansicht, die eine Karte ohne Speichern-Leiste ersetzt.
 */
import { createCardEditor, type CardEditor } from '$lib/editor/cardEditor.svelte';
import { normalizeNpc } from '$lib/utils/schemaValidation';
import type { Npc } from '$lib/schemas/npc';

function parseNpc(json: string): Npc | null {
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object') return null;
    return normalizeNpc(raw);
  } catch { return null; }
}

export class NpcCardEditor {
  ed: CardEditor<Npc>;

  showJson = $state(false);
  rawJson = $state('');
  jsonError = $state('');

  constructor() {
    this.ed = createCardEditor<Npc>({ type: 'npc', label: 'NPC', parse: parseNpc });

    // Der Bogen hat keine Speichern-Leiste — er schreibt 600 ms nach der letzten
    // Änderung selbst. Der Guard deckt genau dieses Fenster ab.
    $effect(() => {
      const draftJson = this.draftJson;
      if (!draftJson || !this.ed.dirty) return;
      const timer = setTimeout(() => this.ed.save(), 600);
      return () => clearTimeout(timer);
    });
  }

  get draftJson(): string {
    return this.ed.draft ? JSON.stringify(this.ed.draft) : '';
  }

  openJson(): void {
    if (!this.ed.draft) return;
    this.rawJson = JSON.stringify(this.ed.draft, null, 2);
    this.jsonError = '';
    this.showJson = true;
  }

  applyJson(): void {
    const parsed = parseNpc(this.rawJson);
    if (!parsed) { this.jsonError = 'Ungültiges JSON'; return; }
    this.ed.draft = parsed;
    this.showJson = false;
  }
}

export function createNpcCardEditor(): NpcCardEditor {
  return new NpcCardEditor();
}
