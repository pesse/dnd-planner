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
  contextFlags,
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

/** Vom Dialog erfasste, lauf-spezifische Optionen (überschreiben globale Defaults). */
export interface ContextActionOptions {
  /** Im Dialog gewählte Monster-Gruppen für den Kontext. undefined → globale contextFlags. */
  monsterGroups?: string[];
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
  /** Dialog soll einen Monster-Gruppen-Picker für den Kontext anzeigen. */
  selectsMonsterGroups?: boolean;
  /** Führt die Aktion aus; liefert eine kurze Erfolgsmeldung für die UI. */
  run(config: LlmConfig, userInput: string, cb: ContextActionCallbacks, options?: ContextActionOptions): Promise<string>;
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
  selectsMonsterGroups: true,
  async run(config, userInput, cb, options) {
    const file = get(activeFile);
    if (!file || file.type !== 'act') throw new Error('Kein Akt geöffnet.');
    const { campaignPath, actDirName } = parseActPath(file.path);

    // Im Dialog gewählte Gruppen haben Vorrang; sonst die globale Kuratierung.
    const groups = options?.monsterGroups ?? get(contextFlags).monsterGroups;

    const result = await designEncounter(
      {
        config,
        campaignPath,
        actDirName,
        actContent: get(fileContent),
        party: get(campaignCharacterData),
        library: get(monsterLibrary),
        // Nur die gewählten Monster-Gruppen, gekappt — hält den Entwurfs-Prompt klein.
        // Leere Gruppenliste ⇒ keine Bibliothek im Prompt (Modell erdet dann via SRD-Suche).
        libraryOptions: { groups, maxEntries: 40 },
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
