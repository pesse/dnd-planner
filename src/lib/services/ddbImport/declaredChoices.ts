/** Zweigwahlen aus D&D Beyond („Forest Gnome", „Primal Order: Warden") gegen die deklarierten Optionen. */
import type { Character } from '$lib/schemas/characterSchema';
import type { DdbSheet } from '$lib/schemas/ddbSheet';
import type { Species } from '$lib/schemas/species';
import type { ClassProgression } from '$lib/schemas/classProgression';
import { normName } from '$lib/utils/text';
import type { DeclaredChoiceSource } from '../declaration/source';
import { optionListChoice, optionListRefs } from '../declaration/optionList';

interface ChoiceLibraries {
  speciesByKey: (key: string) => Promise<Species | null>;
  classByKey: (key: string) => Promise<ClassProgression | null>;
}

interface ChoiceCarrier { feature: DeclaredChoiceSource; gainedAt: number }

/** Volksmerkmale ab Stufe 1, Klassen- und Unterklassenmerkmale bis zur erreichten Klassenstufe. */
async function choiceCarriers(c: Character, libs: ChoiceLibraries): Promise<ChoiceCarrier[]> {
  const out: ChoiceCarrier[] = [];
  const species = c.species.sourceKey ? await libs.speciesByKey(c.species.sourceKey) : null;
  for (const t of species?.traits ?? []) out.push({ feature: t, gainedAt: 1 });
  for (const row of c.classes) {
    for (const key of [row.sourceKey, row.subclassKey ?? '']) {
      const cls = key ? await libs.classByKey(key) : null;
      for (const f of cls?.features ?? []) {
        const at = f.gainedAt[0] ?? 1;
        if (at <= row.level) out.push({ feature: f, gainedAt: at });
      }
    }
  }
  return out;
}

/** Trägt jede erkannte Wahl in `features[]` ein und liefert die Zeilen fürs Protokoll. */
export async function applyDeclaredChoices(c: Character, s: DdbSheet, libs: ChoiceLibraries): Promise<string[]> {
  const done: string[] = [];
  for (const { feature, gainedAt } of await choiceCarriers(c, libs)) {
    const ddb = s.features.find((f) => normName(f.name) === normName(feature.name));
    if (!ddb?.options.length) continue;
    for (const ref of optionListRefs(feature)) {
      const choice = optionListChoice(ref);
      const i = choice ? choice.options.findIndex((o) => ddb.options.some((d) => normName(d) === normName(o))) : -1;
      if (!choice || i < 0) continue;
      const de = choice.optionsDe?.[i] ?? choice.options[i];
      c.features.push({
        sourceKey: feature.key ?? '', name: '', choice: choice.options[i], choiceDe: de,
        choiceId: choice.id, gainedAt, desc: '',
      });
      done.push(`${feature.nameDe || feature.name}: ${de}`);
    }
  }
  return done;
}
