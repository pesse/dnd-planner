/** Farben und Texte der Zauber-Badges in Seitenleiste und Tabelle: Hue = Schule, Helligkeit = Grad. */
import { SCHOOL_COLORS, SPELL_SCHOOL_DIR } from '../spellLibrary';

const SCHOOL_KEY_OF_DIR: Record<string, string> =
  Object.fromEntries(Object.entries(SPELL_SCHOOL_DIR).map(([key, dir]) => [dir, key]));

/** `dir` ist der Vault-Ordner („hervorrufung"), nicht der englische Schulschlüssel. */
export const schoolDirColor = (dir: string): string => SCHOOL_COLORS[SCHOOL_KEY_OF_DIR[dir]] ?? 'var(--ink)';

export const schoolDirLabel = (dir: string): string => dir.charAt(0).toUpperCase() + dir.slice(1);

/** Zaubertrick leicht aufgehellt, Grad 9 am dunkelsten. */
export function spellBadgeColor(baseColor: string, level: number): string {
  if (level <= 0) return `color-mix(in srgb, ${baseColor} 78%, white)`;
  const darken = Math.min((level - 1) * 6, 48); // 0 % (Grad 1) … 48 % Schwarz (Grad 9)
  return `color-mix(in srgb, ${baseColor}, black ${darken}%)`;
}

export const levelBadgeText = (level: number): string => (level === 0 ? 'Z' : String(level));

export const levelLabel = (level: number): string => (level === 0 ? 'Zaubertrick' : `Grad ${level}`);

export const levelGroupLabel = (level: number): string => (level === 0 ? 'Zaubertricks' : `Grad ${level}`);
