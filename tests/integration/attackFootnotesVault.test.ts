/**
 * Zeilen unter der Angriffstabelle aus dem ECHTEN Vault: Zusatzwürfel nach Klassenstufe, auch an der gewählten Option.
 *
 *   npm run test -- attackFootnotesVault
 */
import { describe, expect, it } from 'vitest';
import { attackFootnotes } from '../../src/lib/services/attackEffects';
import { ownedGrantFeatures } from '../../src/lib/services/hitPoints';
import { characterSchema } from '../../src/lib/schemas/characterSchema';

async function footnotes(c: Record<string, unknown>): Promise<string[]> {
  return attackFootnotes(await ownedGrantFeatures(characterSchema.parse({ name: 'Prüfling', ...c })));
}

describe('Zusatzwürfel aus dem Vault', () => {
  it('Schreckliche Schläge wachsen mit der Waldläuferstufe', async () => {
    const ranger = (level: number) => ({
      classes: [{ sourceKey: 'srd-2024_ranger', subclassKey: 'phb-2024_fey-wanderer', name: 'Waldläufer', level }],
    });
    expect(await footnotes(ranger(3))).toContainEqual(expect.stringContaining('+1W4 Psychischer Schaden'));
    expect(await footnotes(ranger(11))).toContainEqual(expect.stringContaining('+1W6 Psychischer Schaden'));
  });

  it('Göttlicher Schlag steht nur bei gewählter Option', async () => {
    const cleric = (choice: string, choiceDe: string) => ({
      classes: [{ sourceKey: 'srd-2024_cleric', name: 'Kleriker', level: 14 }],
      features: [{ sourceKey: 'srd-2024_cleric_blessed-strikes', name: 'Gesegnete Schläge', choice, choiceDe }],
    });
    expect(await footnotes(cleric('Divine Strike', 'Göttlicher Schlag'))).toEqual([
      expect.stringMatching(/^Gesegnete Schläge \(Göttlicher Schlag\) \+2W8: einmal pro Zug/),
    ]);
    expect(await footnotes(cleric('Potent Spellcasting', 'Verstärkte Zaubertricks'))).toEqual([]);
  });
});
