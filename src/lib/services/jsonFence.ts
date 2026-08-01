/**
 * Das Sicherheitsnetz vor `JSON.parse` auf den NATIVEN Structured-Output-Pfaden: auch dort
 * verpacken Modelle ihre Antwort gern noch in einen Markdown-Codeblock.
 */
export function stripJsonFence(text: string): string {
  if (!text) return text;
  const fenced =
    text.match(/```json\s*([\s\S]*?)```/i)?.[1] ??
    text.match(/```\s*([\s\S]*?)```/)?.[1];
  return (fenced ?? text).trim();
}

/**
 * Die tolerante Variante für Pfade OHNE nativen Structured Output (Agent-Loop,
 * Eval-Prompt-Werkstatt): Fence, rohes JSON, erstes `{…}` — sonst `null`.
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
