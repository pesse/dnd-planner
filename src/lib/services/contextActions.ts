/**
 * Registry der KI-Aktionen je `activeFile.type`; eine neue Aktion ist ein Eintrag, kein
 * UI-Umbau. Hier lebt nur das App-Wiring — die Generierung steckt im jeweiligen Service, der
 * UI-Zustand kommt als `ContextActionState` vom Aufrufer.
 */
import type { FileEntry, LlmConfig } from '../types';
import type { AgentStep } from './vaultTools';
import { invalidateVault } from '../stores/campaign';
import { navigateTo } from './navigation';
import { loadEncounterContext } from '../stores/context';
import { invalidateMonsterPaths } from './contextLoad';
import type { CharacterCompact, MonsterLibraryEntry } from './contextTypes';
import { designEncounter } from './designEncounter';

export interface ContextActionCallbacks {
  onStep?: (s: AgentStep) => void;
  onActivity?: () => void;
  onPhase?: (text: string) => void;
  signal?: AbortSignal;
}

export interface ContextActionOptions {
  /** undefined → globale `contextFlags`. */
  monsterGroups?: string[];
}

/** Der Aufrufer liest die Stores, nicht die Aktion. */
export interface ContextActionState {
  activeFile: FileEntry | null;
  fileContent: string;
  party: CharacterCompact[];
  monsterLibrary: MonsterLibraryEntry[];
  /** Global kuratiert (`contextFlags.monsterGroups`). */
  monsterGroups: string[];
}

export interface ContextAction {
  id: string;
  label: string;
  icon: string;
  placeholder: string;
  appliesTo: FileEntry['type'][];
  selectsMonsterGroups?: boolean;
  /** Liefert eine kurze Erfolgsmeldung für die UI. */
  run(state: ContextActionState, config: LlmConfig, userInput: string, cb: ContextActionCallbacks, options?: ContextActionOptions): Promise<string>;
}

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
  selectsMonsterGroups: true,
  async run(state, config, userInput, cb, options) {
    const file = state.activeFile;
    if (!file || file.type !== 'act') throw new Error('Kein Akt geöffnet.');
    const { campaignPath, actDirName } = parseActPath(file.path);

    const groups = options?.monsterGroups ?? state.monsterGroups;

    const result = await designEncounter(
      {
        config,
        campaignPath,
        actDirName,
        actContent: state.fileContent,
        party: state.party,
        library: state.monsterLibrary,
        // Gekappt, damit der Entwurfs-Prompt klein bleibt; leere Liste = keine Bibliothek
        // im Prompt, das Modell erdet dann über die SRD-Suche.
        libraryOptions: { groups, maxEntries: 40 },
      },
      userInput,
      cb,
    );

    invalidateMonsterPaths();
    invalidateVault();
    await loadEncounterContext(campaignPath);
    await navigateTo({ name: result.filename.replace(/\.json$/, ''), path: result.path, type: 'encounter' });

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
