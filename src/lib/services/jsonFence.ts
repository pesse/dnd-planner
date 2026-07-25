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
