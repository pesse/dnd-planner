/**
 * Welche Art Zauber-Deklaration ein Merkmal trägt — das Klassen-Zauberwirken selbst oder einen
 * Zugang daneben. Beide Antworten halten das Merkmal aus der KI-Deutung heraus.
 */
import type { ClassFeature } from '$lib/schemas/classProgression';
import type { DeclaredChoiceSource } from './source';

/**
 * Der EXAKTE Name ist nur der Fallback für Merkmale ohne `grantsChoice`: „Spell Mastery",
 * „Magical Secrets" und „Signature Spells" dürfen nicht mitfallen, sie tragen eigene
 * Mechanik. Ginge das Merkmal in die KI-Analyse, erfände das Modell Zauberlisten.
 */
const CASTING_FEATURE_NAMES = /^(spellcasting|pact magic|zauberwirken|paktmagie)$/i;

export function isSpellcastingFeature(f: ClassFeature): boolean {
  if (f.grantsChoice) return f.grantsChoice.kind === 'spellcasting';
  return CASTING_FEATURE_NAMES.test(f.name.trim()) || CASTING_FEATURE_NAMES.test((f.nameDe ?? '').trim());
}

export function isSpellAccessFeature(f: DeclaredChoiceSource): boolean {
  return f.grantsChoice?.kind === 'spellAccess';
}
