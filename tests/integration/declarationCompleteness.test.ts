/**
 * Jedes Merkmal des ECHTEN Vaults ist redigiert, und keines kündigt eine Mechanik ohne
 * Deklaration an — bis auf die Rückstandslisten unten, die nur schrumpfen dürfen.
 *
 *   npm run test -- declarationCompleteness
 */
import { describe, expect, it } from 'vitest';
import { isRedacted } from '../../src/lib/services/declarationCoverage';
import { declarationGapKinds, type DeclarationGapKind } from '../../src/lib/services/declarationGap';
import { getClasses } from '../../src/lib/classLibrary';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { libraryKey } from '../support/libraryKey';
import { vaultFeatures } from '../support/vaultFeatures';

/** Undeklariert, mit Grund. Wer einen Eintrag deklariert, streicht ihn hier. */
const UNDECLARED_BACKLOG: Record<string, string> = {};

/** ALLE offenen Arten je Merkmal — die Anzeige zeigt nur die erste, die zweite bliebe sonst verdeckt. */
const GAP_BACKLOG: Record<string, DeclarationGapKind[]> = {};

describe('Deklarationen im Vault', () => {
  it('liest alle Merkmale', async () => {
    // Ein still verlorener Ladepfad ließe die Proben unten grün, ohne etwas gesehen zu haben.
    expect((await vaultFeatures()).length).toBeGreaterThan(300);
  });

  it('redigiert jedes Merkmal außerhalb des Rückstands', async () => {
    const undeclared = (await vaultFeatures()).filter((v) => !isRedacted(v.feature)).map((v) => v.id);
    expect(undeclared.filter((id) => !(id in UNDECLARED_BACKLOG)), 'neu undeklariert').toEqual([]);
    expect(Object.keys(UNDECLARED_BACKLOG).filter((id) => !undeclared.includes(id)), 'erledigt — aus dem Rückstand streichen').toEqual([]);
  });

  it('meldet keine Lücke außerhalb des Rückstands', async () => {
    const gaps = Object.fromEntries(
      (await vaultFeatures()).map((v) => [v.id, declarationGapKinds(v.feature)] as const).filter(([, kinds]) => kinds.length),
    );
    const fresh = Object.entries(gaps).filter(([id, kinds]) => kinds.join() !== GAP_BACKLOG[id]?.join());
    expect(fresh, 'neue Lücke').toEqual([]);
    expect(Object.keys(GAP_BACKLOG).filter((id) => !(id in gaps)), 'erledigt — aus dem Rückstand streichen').toEqual([]);
  });

  // Ohne `grantsSubclass` stellt der Stufenaufstieg die Wahl bei einem Sprung ab Stufe 1 nicht.
  it('markiert bei jeder Klasse mit Unterklassen genau ein Merkmal als Unterklassenwahl', async () => {
    const classes = await getClasses();
    const withSubclasses = classes.filter((c) => !c.subclassOf && classes.some((s) => s.subclassOf === libraryKey(c)));
    const marked = await Promise.all(withSubclasses.map(async (c) => {
      const prog = await getProgressionByKey(libraryKey(c));
      return [libraryKey(c), prog?.features.filter((f) => f.grantsSubclass).length ?? 0] as const;
    }));
    expect(marked.length, 'Klassen mit Unterklassen gelesen').toBeGreaterThan(10);
    expect(marked.filter(([, n]) => n !== 1)).toEqual([]);
  });
});
