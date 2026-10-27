/**
 * Die Unterklassenwahl des Aufstiegs hängt an `grantsSubclass` im ECHTEN Vault, nicht am Namen.
 *
 *   npm run test -- levelUpSubclass
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { computeLevelUpDelta, isFlowOwnedChoiceFeature } from '../../src/lib/services/levelUp';

const fighterAt = (level: number) =>
  characterSchema.parse({ name: 'Testfigur', classes: [{ sourceKey: 'srd-2024_fighter', name: 'Kämpfer', level }] });

describe('Unterklassenwahl im Aufstieg', () => {
  // Ab Stufe 2 löst schon die Ausgangsstufe aus — nur der Sprung ab 1 braucht das Merkmal.
  it('stellt die Wahl beim Sprung von 1 auf 3', async () => {
    const delta = await computeLevelUpDelta(fighterAt(1), 0, 3);
    const marker = delta.featuresGained.find((f) => f.grantsSubclass);
    expect(marker?.key).toBe('srd-2024_fighter_fighter-subclass');
    expect(delta.triggersSubclassChoice).toBe(true);
    // Die Wahl führt der Subklassen-Schritt — die Merkmals-Analyse darf sie nicht ein zweites Mal stellen.
    expect(isFlowOwnedChoiceFeature(marker!)).toBe(true);
  });

  it('stellt sie auch beim Barden, dessen Merkmal in Open5e fehlt', async () => {
    const bard = characterSchema.parse({ name: 'Testfigur', classes: [{ sourceKey: 'srd-2024_bard', name: 'Barde', level: 1 }] });
    expect((await computeLevelUpDelta(bard, 0, 3)).triggersSubclassChoice).toBe(true);
  });

  it('stellt sie vor Stufe 3 nicht', async () => {
    expect((await computeLevelUpDelta(fighterAt(1), 0, 2)).triggersSubclassChoice).toBe(false);
  });
});
