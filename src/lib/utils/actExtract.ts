/**
 * Extrahiert ## Summary und ## Ergebnis aus einer Akt-Datei.
 * Diese beiden Sektionen bilden den "Kurzkontext" — vollständiger Inhalt nur bei der aktiven Datei.
 * Fällt auf die ersten 5 Zeilen zurück wenn keine strukturierten Sektionen vorhanden.
 */
export function extractActSummary(markdown: string): string {
  const parts: string[] = [];

  const summaryMatch = markdown.match(/^##\s+Summary\s*\n([\s\S]*?)(?=^##\s|\Z)/m);
  if (summaryMatch) parts.push(`## Summary\n${summaryMatch[1].trim()}`);

  const ergebnisMatch = markdown.match(/^##\s+Ergebnis\s*\n([\s\S]*?)(?=^##\s|\Z)/m);
  if (ergebnisMatch) parts.push(`## Ergebnis\n${ergebnisMatch[1].trim()}`);

  if (parts.length > 0) return parts.join('\n\n');

  // Fallback: erste 5 nicht-leere Zeilen
  return markdown.split('\n').filter((l) => l.trim()).slice(0, 5).join('\n');
}

/**
 * Gibt den Titel eines Aktes zurück (erste # Zeile).
 */
export function extractActTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Unbekannter Akt';
}
