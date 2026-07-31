/**
 * Klassenzeile als Freitext: Anzeige und Rück-Parse („Kämpfer 5 (Champion) / Zauberer 2").
 * Der Bogen hat nur ein Textfeld dafür, die App aber eine Liste — beide Richtungen
 * stehen hier, damit ein Export/Import-Zyklus nichts verschiebt.
 */
import type { CharacterClass, CharacterSpecies } from './characterSchema';

/** Anzeige-String der Spezies (inkl. optionaler Unterspezies). */
export function formatSpecies(species: CharacterSpecies | undefined): string {
  if (!species) return '';
  const base = species.name.trim();
  const sub = species.subspeciesName?.trim();
  if (!base) return '';
  return sub ? `${base} (${sub})` : base;
}

/** Anzeige-String aus den strukturierten Klassen, z.B. „Kämpfer 5 (Champion) / Zauberer 2". */
export function formatClassLevel(classes: CharacterClass[]): string {
  return (classes ?? [])
    .filter((c) => c.name.trim())
    .map((c) => `${c.name.trim()} ${c.level}${c.subclassName?.trim() ? ` (${c.subclassName.trim()})` : ''}`)
    .join(' / ');
}

/** Gesamtstufe (Summe der Einzelstufen) über alle gepflegten Klassen. */
export function totalLevel(classes: CharacterClass[]): number {
  return (classes ?? []).reduce((sum, c) => sum + (c.level || 0), 0);
}

/** Stufen-Schlüsselwörter, die zwischen Klassenname und Zahl stehen können. */
const LEVEL_KEYWORD_RE = /\b(?:level|lvl|lv|stufe|stufen|grad)\b/gi;

/**
 * Entfernt Stufen-Schlüsselwörter und Rand-Interpunktion aus einem Klassennamen
 * („Schurke Level" → „Schurke"). Kollabiert Mehrfach-Leerraum.
 */
export function cleanClassName(name: string): string {
  return (name ?? '')
    .replace(LEVEL_KEYWORD_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,:_-]+|[\s.,:_-]+$/g, '')
    .trim();
}

/**
 * Zerlegt einen Freitext-Eintrag wie „Waldläufer 5" oder „Schurke Level 2" in
 * Name + Stufe. Angehängte Ganzzahl = Stufe (Default 1), Rest = Name (bereinigt um
 * Stufen-Schlüsselwörter; sourceKey bleibt leer).
 */
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
 * Zerlegt einen Freitext-Klassenstring wie „Kämpfer 5 / Zauberer 2" in strukturierte
 * Klassen-Einträge. Trennung an „/"; sourceKey/Subklasse bleiben leer (Bibliotheks-
 * Verknüpfung erfolgt separat). Für Migration UND explizite Umstellung in der UI.
 */
export function parseClassLevelText(text: string): CharacterClass[] {
  return (text ?? '')
    .split('/')
    .map(parseClassLevelPart)
    .filter((x): x is CharacterClass => x !== null);
}
