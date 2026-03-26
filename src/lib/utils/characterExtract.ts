/**
 * Extrahiert RP-relevante Informationen aus Charakter-Markdown-Dateien.
 *
 * Struktur erwartet:
 *   # Charaktername
 *   ## Spieler
 *   ## Klasse & Level
 *   ## Hintergrund
 *   ## Attribute
 *   ## Fähigkeiten & Zauber / Fähigkeiten & Kampfstil
 *   ## Entscheidungen
 *   ## Notizen         ← immer relevant (GM-Notizen)
 */

export interface CharacterSummary {
  name: string;
  player?: string;
  classLevel?: string;
  background?: string;
  decisions?: string;
  notes?: string;
  // Optional — nur auf Anfrage
  attributes?: string;
  abilities?: string;
}

/** Zerlegt Markdown in benannte Sektionen. */
function parseSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};

  // Titel (# Name) extrahieren
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  if (titleMatch) sections['__title__'] = titleMatch[1].trim();

  // ## Sektionen splitten
  const parts = markdown.split(/^##\s+/m);
  for (const part of parts.slice(1)) {
    const newline = part.indexOf('\n');
    if (newline === -1) continue;
    const heading = part.slice(0, newline).trim();
    const body = part.slice(newline + 1).trim();
    sections[heading.toLowerCase()] = body;
  }

  return sections;
}

/** Normalisiert Sektionsnamen auf bekannte Keys. */
function findSection(sections: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const match = Object.entries(sections).find(([k]) => k.includes(key.toLowerCase()));
    if (match && match[1]) return match[1];
  }
  return undefined;
}

/**
 * Extrahiert RP-relevante Felder aus einem Charakter-Markdown.
 *
 * @param includeAttributes  Attribute-Tabelle mit einbeziehen (Standard: false)
 * @param includeAbilities   Fähigkeiten/Zauber mit einbeziehen (Standard: false)
 */
export function extractCharacterInfo(
  markdown: string,
  includeAttributes = false,
  includeAbilities = false
): CharacterSummary {
  const s = parseSections(markdown);

  const summary: CharacterSummary = {
    name: s['__title__'] ?? 'Unbekannt',
    player: findSection(s, 'spieler'),
    classLevel: findSection(s, 'klasse'),
    background: findSection(s, 'hintergrund'),
    decisions: findSection(s, 'entscheidungen'),
    notes: findSection(s, 'notizen'),
  };

  if (includeAttributes) summary.attributes = findSection(s, 'attribute');
  if (includeAbilities) summary.abilities = findSection(s, 'fähigkeiten');

  return summary;
}

/**
 * Formatiert einen CharacterSummary als kompakten Kontext-Block.
 * GM-Notizen kommen immer zuerst und sind hervorgehoben.
 */
export function formatCharacterForContext(
  summary: CharacterSummary,
  includeAttributes = false,
  includeAbilities = false
): string {
  const lines: string[] = [`### Charakter: ${summary.name}`];

  if (summary.player) lines.push(`**Spieler:** ${summary.player}`);
  if (summary.classLevel) lines.push(`**Klasse & Level:** ${summary.classLevel}`);
  if (summary.background) lines.push(`\n**Hintergrund:**\n${summary.background}`);
  if (summary.decisions) lines.push(`\n**Entscheidungen:**\n${summary.decisions}`);

  // GM-Notizen immer, hervorgehoben
  if (summary.notes) lines.push(`\n**GM-Notizen (immer relevant):**\n${summary.notes}`);

  if (includeAttributes && summary.attributes)
    lines.push(`\n**Attribute:**\n${summary.attributes}`);
  if (includeAbilities && summary.abilities)
    lines.push(`\n**Fähigkeiten:**\n${summary.abilities}`);

  return lines.join('\n');
}
