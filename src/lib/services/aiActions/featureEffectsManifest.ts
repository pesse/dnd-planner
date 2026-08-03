/**
 * Das JSON, das Pass A am Ende seiner Prosa deklariert: parsen und jeden Choice-Eintrag
 * normalisieren. Was keine Frage trägt, wird verworfen statt halb übernommen.
 */
import { CHOICE_HELP_EN_MAX_CHARS } from '../../schemas/levelUp';
import type { AnalysisChoice } from '../analysis/types';
import { stripJsonFence } from '../jsonFence';
import { resolveClass } from '../../spellLibrary';

export interface EffectsManifest {
  choices: AnalysisChoice[];
  spellsToGround: string[];
  blocked: boolean;
}

export function normalizeChoice(raw: unknown): AnalysisChoice | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.question !== 'string' || !o.question.trim()) return null;
  const slug = `choice_${o.question}`.toLowerCase().replace(/\W+/g, '_').slice(0, 40);
  const spellLevels = Array.isArray(o.spellLevels)
    ? [...new Set(o.spellLevels.filter((x): x is number => typeof x === 'number' && x >= 0 && x <= 9).map(Math.floor))]
    : [];
  const spellClass = typeof o.spellClass === 'string' ? (resolveClass(o.spellClass) ?? '') : '';
  // Eine Zauber-Wahl OHNE Grad-Filter wäre ein Picker über die ganze Bibliothek — dann ist
  // eine gewöhnliche Wahl das kleinere Übel. Die Klassenliste darf fehlen (dann ungefiltert
  // nach Klasse, aber immer noch nach Grad), der Grad nicht.
  const type =
    o.type === 'spell-pick' && spellLevels.length
      ? 'spell-pick'
      : o.type === 'multiselect' || o.type === 'text'
        ? o.type
        : 'choice';
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : slug,
    feature: typeof o.feature === 'string' ? o.feature : '',
    featureDe: '', // deterministisch nachgetragen (siehe `withGermanChoices`)
    featureKey: typeof o.featureKey === 'string' ? o.featureKey.trim() : '',
    question: o.question,
    type,
    options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [],
    spellLevels: type === 'spell-pick' ? spellLevels : [],
    spellClass: type === 'spell-pick' ? spellClass : '',
    help: typeof o.help === 'string' ? o.help.trim() : '',
    optionHelp:
      o.optionHelp && typeof o.optionHelp === 'object' && !Array.isArray(o.optionHelp)
        ? Object.fromEntries(
            Object.entries(o.optionHelp as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string' && v.trim())
              .map(([k, v]) => [k, (v as string).trim()]),
          )
        : {},
    max: typeof o.max === 'number' && o.max > 0 ? Math.floor(o.max) : 1,
    // Eine Zauber-Wahl kann nichts weiter freischalten — die gewählten Zauber SIND der
    // Effekt. Sonst würde der Flow unnötig einen zweiten Analyse-Durchlauf anhängen.
    determinesFurtherEffects: type !== 'spell-pick' && o.determinesFurtherEffects === true,
    // Vorsichtiger Default: eine nicht als Aufbau-Wahl markierte Antwort wird nur
    // protokolliert, wenn das Modell es ausdrücklich sagt — sonst wächst das Ledger
    // mit Taktik-Optionen zu.
    isBuildDecision: o.isBuildDecision === true,
    // Bleiben leer, bis der Übersetzungs-Call sie füllt.
    questionDe: '',
    helpDe: '',
    optionsDe: [],
    optionHelpDe: {},
  };
}

/**
 * Bewusst tolerant, weil die Antwort Prosa UND JSON enthält: letzter ```json-Block, sonst
 * das letzte `{…}`; bei Fehlschlag der harmlose Default statt eines Fehlers.
 */
export function parseManifest(text: string): EffectsManifest {
  const empty: EffectsManifest = { choices: [], spellsToGround: [], blocked: false };
  const jsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const candidate of [jsonBlocks.at(-1), text.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try {
      const o = JSON.parse(stripJsonFence(candidate)) as Record<string, unknown>;
      return {
        choices: Array.isArray(o.choices)
          ? o.choices.map(normalizeChoice).filter((c): c is AnalysisChoice => c !== null)
          : [],
        spellsToGround: Array.isArray(o.spellsToGround)
          ? o.spellsToGround.filter((s): s is string => typeof s === 'string')
          : [],
        blocked: o.blocked === true,
      };
    } catch {
      /* nächsten Kandidaten versuchen */
    }
  }
  return empty;
}
