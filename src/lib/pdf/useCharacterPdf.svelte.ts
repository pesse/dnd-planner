/**
 * Die beiden PDF-Aktionen des Charakterbogens als Zustand: laufend, fehlgeschlagen.
 */
import { legacyFlatView } from '../services/spellcasting/legacy';
import { loadSpellcasting } from '../services/spellcasting/project';
import { choosePdfFile, exportCharacterPdfFile, importPdfIntoCharacter } from './characterPdfIo';
import type { Character } from '../schemas/characterSchema';
import type { SpellAccessValues } from '../services/spellAccess';
import type { CharacterSpells } from '../schemas/characterSchema';

export interface CharacterPdf {
  readonly importing: boolean;
  readonly exporting: boolean;
  /** Deutsche Meldung der letzten fehlgeschlagenen Aktion. */
  readonly error: string;
  importIntoExisting(): Promise<void>;
  exportToFile(): Promise<void>;
}

export function createCharacterPdf(deps: {
  dirPath: () => string;
  character: () => Character | null;
  /** Ursprungsdatei eines früheren Imports. */
  pdfName: () => string;
  /** Wird als zusätzliche Seite(n) angehängt. */
  details: () => string;
  // Resolver und Werte der Karte, damit PDF und Bogen nicht auseinanderlaufen können.
  masteryOf: (attackName: string) => string | undefined;
  spellAccess: () => SpellAccessValues[];
  applyContent: (content: string) => void;
}): CharacterPdf {
  /** Das Template kennt nur einen flachen Zauberblock; die Wahrheit ist `spellcasting`. */
  const flatSpells = async (c: Character): Promise<CharacterSpells> => {
    const { state, lookup, legacy } = await loadSpellcasting(c);
    return legacyFlatView(state, lookup, legacy);
  };

  let importing = $state(false);
  let exporting = $state(false);
  let error = $state('');

  $effect(() => {
    void deps.dirPath();
    error = '';
  });

  return {
    get importing() { return importing; },
    get exporting() { return exporting; },
    get error() { return error; },

    async importIntoExisting() {
      const character = deps.character();
      if (!character) return;
      const selected = await choosePdfFile(deps.dirPath());
      if (!selected) return;

      importing = true;
      error = '';
      try {
        // Zauber aus dem aktuellen Charakter behalten — das PDF trägt sie nicht.
        const content = await importPdfIntoCharacter(selected, deps.dirPath(), await flatSpells(character));
        deps.applyContent(content);
      } catch (e) {
        error = `PDF-Import fehlgeschlagen: ${e}`;
      } finally {
        importing = false;
      }
    },

    async exportToFile() {
      const character = deps.character();
      if (!character) return;
      exporting = true;
      error = '';
      try {
        await exportCharacterPdfFile(character, {
          importedFrom: deps.pdfName(),
          dirPath: deps.dirPath(),
          freitext: deps.details(),
          masteryOf: deps.masteryOf,
          spellAccess: deps.spellAccess(),
          spells: await flatSpells(character),
        });
      } catch (e) {
        error = `PDF-Export fehlgeschlagen: ${e}`;
      } finally {
        exporting = false;
      }
    },
  };
}
