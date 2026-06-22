/**
 * Übersetzt rohe Agent-Tool-Schritte in verständliche, deutsche Fortschritts-Texte
 * für die UI (statt `🔧 search_dnd_api ({"query":...})`).
 */
import type { AgentStep } from '../vaultTools';

export interface StepLabel {
  icon: string;
  text: string;
  muted: boolean;
}

function arg(s: AgentStep, key: string): string {
  const v = s.args?.[key];
  return v == null ? '' : String(v);
}

export function describeAiStep(s: AgentStep): StepLabel | null {
  if (s.type === 'tool_call') {
    switch (s.tool) {
      case 'search_dnd_api': {
        const cat = arg(s, 'category') === 'magic-items' ? 'magische Gegenstände' : 'Ausrüstung';
        return { icon: '🔍', text: `Suche in der DnD-API nach „${arg(s, 'query')}“ (${cat})…`, muted: false };
      }
      case 'get_dnd_api_resource': {
        const slug = arg(s, 'url').split('/').filter(Boolean).pop() ?? '';
        return { icon: '📥', text: `Lade Basis-Gegenstand „${slug}“…`, muted: false };
      }
      case 'json-korrektur':
        return { icon: '✎', text: 'Bringe das Ergebnis ins richtige Format…', muted: false };
      default:
        return { icon: '🔧', text: `Führe „${s.tool}“ aus…`, muted: false };
    }
  }
  if (s.type === 'tool_result') {
    switch (s.tool) {
      case 'search_dnd_api': {
        let n = 0;
        try {
          n = (JSON.parse(s.result ?? '[]') as unknown[]).length;
        } catch { /* ignore */ }
        return { icon: '↳', text: n ? `${n} passende Einträge gefunden` : 'Keine Treffer', muted: true };
      }
      case 'get_dnd_api_resource':
        return { icon: '↳', text: 'Basis-Gegenstand geladen', muted: true };
      case 'json-korrektur':
        return { icon: '↳', text: s.result === 'ok' ? 'Format korrigiert' : 'Korrektur fehlgeschlagen', muted: true };
      default:
        return { icon: '↳', text: 'Erledigt', muted: true };
    }
  }
  if (s.type === 'done') return { icon: '✓', text: 'Gegenstand erstellt', muted: true };
  return null; // 'error' o.ä. → nicht anzeigen
}
