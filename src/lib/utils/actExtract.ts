/**
 * Extrahiert die ## Summary Sektion aus einer Akt-Datei.
 * Fällt auf die ersten 300 Zeichen des gesamten Inhalts zurück wenn keine Summary vorhanden.
 */
export function extractActSummary(markdown: string): string {
  const match = markdown.match(/^##\s+Summary\s*\n([\s\S]*?)(?=^##\s|\Z)/m);
  if (match) return match[1].trim();

  // Fallback: Titel + ersten Absatz
  const lines = markdown.split('\n').filter((l) => l.trim());
  return lines.slice(0, 5).join('\n');
}

/**
 * Gibt den Titel eines Aktes zurück (erste # Zeile).
 */
export function extractActTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Unbekannter Akt';
}
