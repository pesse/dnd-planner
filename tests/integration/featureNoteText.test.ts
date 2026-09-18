/**
 * Der Schnitt am ECHTEN Vault: die Absätze, die eine Option ausbuchstabieren, verschwinden
 * aus der Notiz an der Frage — der Rest des Merkmals bleibt stehen.
 *
 *   npm run test -- featureNoteText
 */
import { describe, expect, it } from 'vitest';
import { getClasses } from '../../src/lib/classLibrary';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { featureNote } from '../../src/lib/services/featureText';
import type { ClassFeature } from '../../src/lib/schemas/classProgression';

const featureOf = async (classKey: string, featureKey: string): Promise<ClassFeature> => {
  await getClasses();
  const prog = await getProgressionByKey(classKey);
  const f = prog?.features.find((x) => x.key === featureKey);
  expect(f, featureKey).toBeTruthy();
  return f!;
};

const labelsOf = (f: ClassFeature): string[] => {
  const grants = Array.isArray(f.grantsChoice) ? f.grantsChoice : f.grantsChoice ? [f.grantsChoice] : [];
  return grants.flatMap((g) => g.options.flatMap((o) => [o.value, o.labelDe]));
};

const noteOf = async (classKey: string, featureKey: string) => {
  const f = await featureOf(classKey, featureKey);
  return featureNote(
    { name: f.name, nameDe: f.nameDe, desc: f.desc, descDe: f.descDe },
    labelsOf(f),
  );
};

describe('Notiz am Merkmal', () => {
  it('Kampfüberlegenheit: Vorzüge ja, zwanzig Manöver nein', async () => {
    const note = await noteOf('phb-2024_battle-master', 'phb-2024_fighter_battle-master_combat-superiority');
    expect(note?.titleDe).toBe('Kampfüberlegenheit');
    // Was der Spieler an der Frage braucht: Vorrat, Kontingent, Rettungswurf-SG.
    expect(note?.text).toContain('Überlegenheitswürfel');
    expect(note?.text).toContain('Manöver');
    expect(note?.text).toContain('SG 8');
    // Die Optionen selbst stehen im Tooltip des Pickers.
    expect(note?.text).not.toContain('Hinterhalt');
    expect(note?.text).not.toContain('Riposte');
    // Die Wand ist weg: der ganze `descDe` ist ein Vielfaches davon.
    const full = (await featureOf('phb-2024_battle-master', 'phb-2024_fighter_battle-master_combat-superiority')).descDe!;
    expect(note!.text.length).toBeLessThan(full.length / 5);
  });

  it('Beute des Jägers: die Einleitung bleibt, die zwei Optionen gehen', async () => {
    const note = await noteOf('srd-2024_hunter', 'srd-2024_ranger_hunter_hunters-prey');
    expect(note?.text).toContain('eine der folgenden Merkmalsoptionen');
    expect(note?.text).not.toContain('Kolossbezwinger');
    expect(note?.text).not.toContain('Meutebrecher');
  });

  it('Urtümliche Ordnung: dieselbe Grenze bei einer Grundklasse', async () => {
    const note = await noteOf('srd-2024_druid', 'srd-2024_druid_primal-order');
    expect(note?.text).not.toContain('**Magier.**');
    expect(note?.text).not.toContain('Wächter');
  });
});
