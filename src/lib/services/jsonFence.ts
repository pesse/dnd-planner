/**
 * Streift einen ```json / ``` -Codeblock ab; ohne Fence: getrimmter Originaltext.
 *
 * LLMs verpacken JSON-Antworten oft in einen Markdown-Codeblock, auch wenn per
 * Structured Output (`output_config.format` / `response_format`) rohes JSON
 * angefordert wurde. Diese Utility ist das gemeinsame Sicherheitsnetz vor
 * `JSON.parse` auf den nativen Structured-Output-Pfaden.
 */
export function stripJsonFence(text: string): string {
  if (!text) return text;
  const fenced =
    text.match(/```json\s*([\s\S]*?)```/i)?.[1] ??
    text.match(/```\s*([\s\S]*?)```/)?.[1];
  return (fenced ?? text).trim();
}

/**
 * Versucht, ein JSON-Objekt aus Freitext zu extrahieren (Fence-Block, rohes JSON,
 * erstes `{…}`). Gibt `null` zurück, wenn nichts Parsebares gefunden wurde.
 *
 * Das ist die tolerante Variante für Pfade OHNE nativen Structured Output — der
 * Runner nutzt sie nach dem Agent-Loop, die Eval-Prompt-Werkstatt für den
 * `structured: 'prompt'`-Vergleich.
 */
export function extractJson(text: string): unknown {
  if (!text) return null;
  const candidates = [stripJsonFence(text), text.match(/\{[\s\S]*\}/)?.[0], text];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim());
    } catch {
      /* nächsten Kandidaten versuchen */
    }
  }
  return null;
}
