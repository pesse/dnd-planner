/**
 * Die beiden PDF-Aktionen des Charakterbogens als Zustand: laufend, fehlgeschlagen.
 */
import { emptySpells } from './characterFields';
import { choosePdfFile, exportCharacterPdfFile, importPdfIntoCharacter } from './characterPdfIo';
import type { Character } from '../schemas/characterSchema';
import type { SpellAccessValues } from '../services/spellAccess';

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
        const content = await importPdfIntoCharacter(selected, deps.dirPath(), character.spells ?? emptySpells());
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
        });
      } catch (e) {
        error = `PDF-Export fehlgeschlagen: ${e}`;
      } finally {
        exporting = false;
      }
    },
  };
}
