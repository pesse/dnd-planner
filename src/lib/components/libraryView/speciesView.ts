/** Größe und Bewegungsrate eines Volks — die Werte stehen in den Trait-Deklarationen, nicht im Kopf. */
import type { Species } from '$lib/types';
import { MONSTER_SIZES, type MonsterSize } from '$lib/schemas/vocabulary';
import { ftToM } from '$lib/itemFormat';

const sizeDe = (s: string): string => MONSTER_SIZES[s as MonsterSize] ?? s;

export function speciesFacts(species: Species): { size: string; speed: string } {
  let size = species.size;
  let speed = species.speed;
  for (const t of species.traits) {
    const props = t.grants?.properties;
    if (props?.size) size = sizeDe(props.size);
    if (props?.speedFeet) speed = ftToM(props.speedFeet);
    for (const c of t.grantsChoice ?? []) {
      if (c.kind === 'characterProperty' && c.property === 'size' && c.propertyValues?.length) {
        size = c.propertyValues.map(sizeDe).join(' oder ');
      }
    }
  }
  return { size, speed };
}
