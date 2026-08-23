/**
 * Welche Art Zauber-Deklaration ein Merkmal trägt — das Klassen-Zauberwirken selbst oder einen
 * Zugang daneben. Beide Antworten halten das Merkmal aus der KI-Deutung heraus.
 */
import type { ClassFeature } from '$lib/schemas/classProgression';
import { choiceGrants, type DeclaredChoiceSource } from './source';

/**
 * Der EXAKTE Name ist nur der Fallback für Merkmale ohne `grantsChoice`: „Spell Mastery",
 * „Magical Secrets" und „Signature Spells" dürfen nicht mitfallen, sie tragen eigene
 * Mechanik. Ginge das Merkmal in die KI-Analyse, erfände das Modell Zauberlisten.
 */
const CASTING_FEATURE_NAMES = /^(spellcasting|pact magic|zauberwirken|paktmagie)$/i;

export function isSpellcastingFeature(f: ClassFeature): boolean {
  if (f.grantsChoice) return choiceGrants(f).some((g) => g.kind === 'spellcasting');
  return CASTING_FEATURE_NAMES.test(f.name.trim()) || CASTING_FEATURE_NAMES.test((f.nameDe ?? '').trim());
}

export function isSpellAccessFeature(f: DeclaredChoiceSource): boolean {
  return choiceGrants(f).some((g) => g.kind === 'spellAccess');
}

/**
 * Ob das Merkmal sein Zauberwirken DEKLARIERT — Kontingent, Pool, Attribut und Tauschtakt
 * kommen dann aus der Bibliothek, und die KI-Deutung schriebe daneben eine zweite Fassung
 * derselben Mechanik. Trägt es Prosa ohne Senke, holt `aiInterpretsRest` es für die
 * Bogen-Notiz zurück (`unredactedChoiceFeatures`).
 */
export const declaresCasting = (f: DeclaredChoiceSource): boolean => f.grantsCasting !== undefined;
