/**
 * `## Summary` und `## Ergebnis` bilden den Kurzkontext eines Aktes — vollständig geht
 * nur die aktive Datei in den Prompt.
 */
export function extractActSummary(markdown: string): string {
  const parts: string[] = [];

  const summaryMatch = markdown.match(/^##\s+Summary\s*\n([\s\S]*?)(?=^##\s|\Z)/m);
  if (summaryMatch) parts.push(`## Summary\n${summaryMatch[1].trim()}`);

  const ergebnisMatch = markdown.match(/^##\s+Ergebnis\s*\n([\s\S]*?)(?=^##\s|\Z)/m);
  if (ergebnisMatch) parts.push(`## Ergebnis\n${ergebnisMatch[1].trim()}`);

  if (parts.length > 0) return parts.join('\n\n');

  return markdown.split('\n').filter((l) => l.trim()).slice(0, 5).join('\n');
}

/** Erste `#`-Zeile. */
export function extractActTitle(markdown: string, fallback = 'Unbekannter Akt'): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}
