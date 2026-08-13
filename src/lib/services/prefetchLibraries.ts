/**
 * Was der erste Karten- oder Charakteraufruf sonst am Stück nachlädt, wird hier im Leerlauf
 * vorgewärmt — eine Einheit je Scheibe, sonst ruckelt das Vorwärmen selbst.
 */
import { listItemDirs, getItemsByDir } from '$lib/itemLibrary';
import { getSpellLibrary } from '$lib/spellLibrary';
import { getClasses } from '$lib/classLibrary';
import { getSpeciesList } from '$lib/speciesLibrary';
import { getBackgroundsList } from '$lib/backgroundsLibrary';
import { getFeats } from '$lib/featsLibrary';
import {
  parseCharacter,
  parseItem,
  parseMonster,
  parseSpell,
  parseEncounter,
} from '$lib/utils/schemaValidation';

type Job = () => Promise<unknown>;

/**
 * Zod baut seinen Fastpass je Objektknoten beim ERSTEN synchronen Parse. `characterSchema`
 * hat rund 50 davon — das ist der Teil des „erste Karte hakt", der nicht vom Lesen kommt.
 * Das Ergebnis ist egal, gebaut wird der Pfad auch für eine ungültige Eingabe.
 */
function warmSchemas(): Promise<void> {
  for (const parse of [parseCharacter, parseItem, parseMonster, parseSpell, parseEncounter]) {
    parse({});
  }
  return Promise.resolve();
}

export function onIdle(run: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: 2000 });
  else setTimeout(run, 200);
}

function drain(jobs: Job[]): void {
  const next = jobs.shift();
  if (!next) return;
  onIdle(() => {
    void next().catch(() => {}).then(() => drain(jobs));
  });
}

/**
 * Fehler werden verschluckt: das hier ist Vorarbeit, der echte Aufruf meldet später selbst.
 * Die Gegenstände stehen am Ende — 972 Dateien in 17 Ordnern, jeder Ordner eine eigene Scheibe.
 */
export function prefetchLibraries(): void {
  const jobs: Job[] = [
    warmSchemas,
    getSpellLibrary,
    getClasses,
    getSpeciesList,
    getBackgroundsList,
    getFeats,
    async () => {
      for (const dir of await listItemDirs()) jobs.push(() => getItemsByDir(dir));
    },
  ];
  drain(jobs);
}
