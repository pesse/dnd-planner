/**
 * Klassenzeile als Freitext: Anzeige und Rück-Parse („Kämpfer 5 (Champion) / Zauberer 2").
 * Der Bogen hat nur ein Textfeld dafür, die App aber eine Liste — beide Richtungen
 * stehen hier, damit ein Export/Import-Zyklus nichts verschiebt.
 */
import type { CharacterClass, CharacterSpecies } from './characterSchema';

export function formatSpecies(species: CharacterSpecies | undefined): string {
  if (!species) return '';
  const base = species.name.trim();
  const sub = species.subspeciesName?.trim();
  if (!base) return '';
  return sub ? `${base} (${sub})` : base;
}

export function formatClassLevel(classes: CharacterClass[]): string {
  return (classes ?? [])
    .filter((c) => c.name.trim())
    .map((c) => `${c.name.trim()} ${c.level}${c.subclassName?.trim() ? ` (${c.subclassName.trim()})` : ''}`)
    .join(' / ');
}

export function totalLevel(classes: CharacterClass[]): number {
  return (classes ?? []).reduce((sum, c) => sum + (c.level || 0), 0);
}

/** Stufen-Schlüsselwörter, die zwischen Klassenname und Zahl stehen können. */
const LEVEL_KEYWORD_RE = /\b(?:level|lvl|lv|stufe|stufen|grad)\b/gi;

/** „Schurke Level" → „Schurke". */
export function cleanClassName(name: string): string {
  return (name ?? '')
    .replace(LEVEL_KEYWORD_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,:_-]+|[\s.,:_-]+$/g, '')
    .trim();
}

/** „Waldläufer 5", „Schurke Level 2" → Name + Stufe; angehängte Ganzzahl = Stufe, sonst 1. */
function parseClassLevelPart(part: string): CharacterClass | null {
  const trimmed = part.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(.*?)[\s.,-]*(\d{1,2})\s*$/);
  const level = m ? Math.min(20, Math.max(1, Number(m[2]))) : 1;
  const name = cleanClassName(m ? m[1] : trimmed);
  if (!name) return null;
  return { sourceKey: '', name, level };
}

/**
 * `sourceKey`/Subklasse bleiben leer — die Bibliotheks-Verknüpfung passiert separat.
 * Für die Migration UND die explizite Umstellung in der UI.
 */
export function parseClassLevelText(text: string): CharacterClass[] {
  return (text ?? '')
    .split('/')
    .map(parseClassLevelPart)
    .filter((x): x is CharacterClass => x !== null);
}
