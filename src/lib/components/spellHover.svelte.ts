import { loadSpellByPath, type SpellInfo } from '../spellLibrary';
import type { Spell } from '../types';

/**
 * Vollständige Zauberdaten für den Hover-Tooltip, MODUL-weit geteilt: Auswahl-Zeile und
 * Auswahl-Dialog sind gleichzeitig montiert (Zaubertricks, Grad 1+, je Merkmals-Wahl eine)
 * und greifen auf dieselben Zauber zu. Anders als im Charakterbogen wird NICHT vorab
 * geladen — der Dialog zeigt die ganze Klassenliste, das wären Dutzende Dateizugriffe für
 * einen Hover.
 */
const spellCache = new Map<string, Spell | null>();

async function loadSpell(name: string, path: string): Promise<Spell | null> {
  const hit = spellCache.get(name);
  if (hit !== undefined) return hit;
  const data = await loadSpellByPath(path);
  spellCache.set(name, data);
  return data;
}

export interface SpellHover {
  readonly spell: Spell | null;
  readonly x: number;
  readonly y: number;
  show(e: MouseEvent, name: string): Promise<void>;
  move(e: MouseEvent): void;
  hide(): void;
}

/**
 * Hover-Tooltip-Zustand für eine Zauberliste. `byName` wird als Getter übergeben, damit die
 * Bibliothek des Aufrufers (nachladend) reaktiv bleibt.
 */
export function createSpellHover(byName: () => Map<string, SpellInfo>): SpellHover {
  let spell = $state<Spell | null>(null);
  let x = $state(0);
  let y = $state(0);
  /** Name, über dem die Maus JETZT steht — verhindert, dass ein langsamer Ladevorgang
   *  den Tooltip aufpoppt, nachdem die Maus längst weiter ist. */
  let hovering = '';

  return {
    get spell() {
      return spell;
    },
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    async show(e: MouseEvent, name: string) {
      x = e.clientX + 14;
      y = e.clientY + 14;
      hovering = name;
      const info = byName().get(name);
      if (!info?.path) return;
      const data = await loadSpell(name, info.path);
      if (data && hovering === name) spell = data;
    },
    move(e: MouseEvent) {
      if (!spell) return;
      x = e.clientX + 14;
      y = e.clientY + 14;
    },
    hide() {
      hovering = '';
      spell = null;
    },
  };
}
