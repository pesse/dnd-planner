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

const CATEGORY_LABELS: Record<string, string> = {
  'monsters': 'Monster',
  'spells': 'Zauber',
};

export function describeAiStep(s: AgentStep): StepLabel | null {
  if (s.type === 'tool_call') {
    switch (s.tool) {
      case 'search_dnd_api': {
        const cat = CATEGORY_LABELS[arg(s, 'category')] ?? 'SRD';
        return { icon: '🔍', text: `Suche in der DnD-API nach „${arg(s, 'query')}“ (${cat})…`, muted: false };
      }
      case 'get_dnd_api_resource': {
        const slug = arg(s, 'url').split('/').filter(Boolean).pop() ?? '';
        return { icon: '📥', text: `Lade SRD-Eintrag „${slug}“…`, muted: false };
      }
      case 'search_open5e_items':
        return { icon: '🔍', text: `Suche Ausrüstung nach „${arg(s, 'query')}“…`, muted: false };
      case 'get_open5e_item': {
        const slug = (arg(s, 'key').split('_').pop()) ?? '';
        return { icon: '📥', text: `Lade Gegenstand „${slug}“…`, muted: false };
      }
      case 'json-korrektur':
        return { icon: '✎', text: 'Bringe das Ergebnis ins richtige Format…', muted: false };
      default:
        return { icon: '🔧', text: `Führe „${s.tool}“ aus…`, muted: false };
    }
  }
  if (s.type === 'tool_result') {
    switch (s.tool) {
      case 'search_dnd_api':
      case 'search_open5e_items': {
        let n = 0;
        try {
          n = (JSON.parse(s.result ?? '[]') as unknown[]).length;
        } catch { /* ignore */ }
        return { icon: '↳', text: n ? `${n} passende Einträge gefunden` : 'Keine Treffer', muted: true };
      }
      case 'get_dnd_api_resource':
      case 'get_open5e_item':
        return { icon: '↳', text: 'Eintrag geladen', muted: true };
      case 'json-korrektur':
        return { icon: '↳', text: s.result === 'ok' ? 'Format korrigiert' : 'Korrektur fehlgeschlagen', muted: true };
      default:
        return { icon: '↳', text: 'Erledigt', muted: true };
    }
  }
  if (s.type === 'done') return { icon: '✓', text: 'Fertig', muted: true };
  return null; // 'error' o.ä. → nicht anzeigen
}
