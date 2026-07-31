/**
 * Die Datenformen des LLM-Kontexts: was geladen, gepinnt und gefiltert wird.
 * Neutral gehalten, weil Store (Halter) und Prompt-Rendering (Leser) sie teilen.
 */
import type { FileEntry } from '../types';
import type { CharacterContextLevel, CharacterMinimum, CharacterNotes } from './characterContext';

export interface EncounterSummaryEntry {
  slug: string;
  actSlug: string;
  name: string;
  difficulty: string;
  xpTotal: number;
  monsterList: string;
  status: 'planned' | 'done' | 'skipped';
}

export interface MonsterLibraryEntry {
  slug: string;
  name: string;
  cr: string;
  size: string;
  type: string;
  group: string;
}

export interface ActSummaryEntry {
  name: string;
  title: string;
  summary: string;
  path: string;
}

/** Tiefe eines gepinnten Charakters — die drei Kontext-Stufen (Alias). */
export type PinDetailLevel = CharacterContextLevel;

export interface PinnedEntry {
  entry: FileEntry;
  content: string;
  detailLevel: PinDetailLevel;
  isCharacter: boolean;
  /** Begleitdateien (details.md/gm-notes.md) — nur bei Charakteren, für die Stufe `full`. */
  notes?: CharacterNotes;
}

/** Identitäts-Extrakt eines Charakters (Alias auf die Minimum-Sicht des Kontext-Service). */
export type CharacterCompact = CharacterMinimum;

export interface ContextFlags {
  campaign: boolean;
  characters: boolean;
  acts: boolean;
  encounters: boolean;
  monsterGroups: string[];
  encounterMonsters: boolean;
  activeFile: boolean;
}
