/**
 * Registry kontextsensitiver KI-Aktionen: Aktionen, die nur für bestimmte
 * `activeFile.type` angeboten werden. Die Toolbar rendert per `actionsFor(type)`
 * die passenden Buttons — neue Aktionen (z.B. „Gegenstand entwerfen") hängen sich
 * einfach als weiterer Eintrag an, ohne UI-Umbau.
 *
 * Hier lebt das App-Wiring (Stores lesen/schreiben, Datei öffnen, Kontext neu
 * laden). Die eigentliche Generierungs-Logik steckt in den jeweiligen Services
 * (z.B. services/designEncounter.ts).
 */
import { get } from 'svelte/store';
import type { FileEntry, LlmConfig } from '../types';
import type { AgentStep } from './vaultTools';
import { activeFile, fileContent, invalidateVault } from '../stores/campaign';
import {
  campaignCharacterData,
  monsterLibrary,
  loadEncounterContext,
  invalidateMonsterPaths,
} from '../stores/context';
import { designEncounter } from './designEncounter';

export interface ContextActionCallbacks {
  onStep?: (s: AgentStep) => void;
  onActivity?: () => void;
  /** Grobe Phasen-Meldung (zwischen den KI-Läufen). */
  onPhase?: (text: string) => void;
  signal?: AbortSignal;
}

export interface ContextAction {
  /** Stabile ID, z.B. 'design-encounter'. */
  id: string;
  /** Button-Beschriftung. */
  label: string;
  /** Icon für den Button. */
  icon: string;
  /** Prompt-Platzhalter für das Eingabefeld. */
  placeholder: string;
  /** Für welche activeFile-Typen die Aktion angeboten wird. */
  appliesTo: FileEntry['type'][];
  /** Führt die Aktion aus; liefert eine kurze Erfolgsmeldung für die UI. */
  run(config: LlmConfig, userInput: string, cb: ContextActionCallbacks): Promise<string>;
}

/** Leitet campaignPath + actDirName aus dem Pfad der geöffneten Akt-Datei ab. */
function parseActPath(path: string): { campaignPath: string; actDirName: string } {
  const m = path.match(/campaigns\/([^/]+)\/acts\/([^/]+)\/index\.md$/);
  if (!m) throw new Error('Akt-Pfad nicht erkannt.');
  return { campaignPath: m[1], actDirName: m[2] };
}

const designEncounterAction: ContextAction = {
  id: 'design-encounter',
  label: 'Encounter entwerfen',
  icon: '⚡',
  placeholder: 'z.B. ein mittelschwerer Hinterhalt am Nordtor mit fehlerhaften Automaten',
  appliesTo: ['act'],
  async run(config, userInput, cb) {
    const file = get(activeFile);
    if (!file || file.type !== 'act') throw new Error('Kein Akt geöffnet.');
    const { campaignPath, actDirName } = parseActPath(file.path);

    const result = await designEncounter(
      {
        config,
        campaignPath,
        actDirName,
        actContent: get(fileContent),
        party: get(campaignCharacterData),
        library: get(monsterLibrary),
      },
      userInput,
      cb,
    );

    // Vault-/Kontext-Caches auffrischen und neuen Encounter öffnen
    invalidateMonsterPaths();
    invalidateVault();
    await loadEncounterContext(campaignPath);
    activeFile.set({ name: result.filename.replace(/\.json$/, ''), path: result.path, type: 'encounter' });

    const parts = [`Encounter „${result.encounter.name}" angelegt`];
    if (result.generatedSlugs.length) parts.push(`${result.generatedSlugs.length} Monster generiert`);
    if (result.reusedSlugs.length) parts.push(`${result.reusedSlugs.length} wiederverwendet`);
    return parts.join(' · ');
  },
};

export const CONTEXT_ACTIONS: ContextAction[] = [designEncounterAction];

export function actionsFor(type: FileEntry['type'] | undefined): ContextAction[] {
  if (!type) return [];
  return CONTEXT_ACTIONS.filter((a) => a.appliesTo.includes(type));
}
