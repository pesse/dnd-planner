/** Angelegte (und, wo verlangt, eingestimmte) Gegenstände als Träger ihrer Deklarationen. */
import type { CharacterInventoryEntry } from '$lib/schemas/characterSchema';
import { wornItems } from '../wornItems';
import { NO_ANSWERS, type Carrier } from './carriers';

export async function itemCarriers(inventory: CharacterInventoryEntry[]): Promise<Carrier[]> {
  return (await wornItems(inventory))
    .filter(({ item }) => item.grantsResource || item.grantsCasting)
    .map(({ id, item }) => ({
      key: id,
      instanceId: id,
      name: item.name,
      nameDe: item.name_de,
      desc: '',
      gainedAt: [1],
      origin: 'item',
      level: 1,
      classKey: '',
      answers: NO_ANSWERS,
      grantsResource: item.grantsResource,
      grantsCasting: item.grantsCasting,
    }));
}
