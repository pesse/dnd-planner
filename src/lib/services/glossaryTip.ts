/**
 * Erklärtext zu einem Regelbegriff für Tooltips: die Regelbibliothek zuerst, eigene
 * Einsteigertexte nur für Begriffe, die sie nicht führt.
 */
import { lookupRule } from './rulesReference';
import { ruleText } from '$lib/rulesLibrary';

const BEGINNER_TIPS: Record<string, string> = {
  Übungsbonus:
    'Ein Bonus, der mit der Stufe wächst (+2 auf Stufe 1). Du addierst ihn zu allem, worin du Übung hast: Fertigkeiten, Rettungswürfe, Waffenangriffe.',
  Waffenbeherrschung:
    'Mit Waffen, deren Beherrschung du gewählt hast, nutzt du eine Zusatzeigenschaft — etwa Gegner umstoßen oder verlangsamen.',
  Talent:
    'Ein Talent ist eine besondere Fähigkeit, die dir neue Optionen gibt oder Werte verbessert. Herkunftstalente gibt es ab Stufe 1.',
  Herkunftstalent:
    'Ein Talent, das dir dein Hintergrund (beim Menschen auch das Volk) auf Stufe 1 schenkt.',
  Standardsatz:
    'Sechs feste Werte — 15, 14, 13, 12, 10, 8 —, die du frei auf deine Attribute verteilst. Der schnellste Weg zu einem ausgewogenen Charakter.',
  Punktekauf:
    'Du kaufst Attributswerte mit 27 Punkten: Jeder Wert startet bei 8, höhere Werte kosten mehr. Mehr Kontrolle, aber mehr Rechnerei.',
  Hauptattribut:
    'Das Attribut, auf das deine Klasse am meisten angewiesen ist — hier sollte dein höchster Wert landen.',
};

export async function glossaryTip(term: string): Promise<string | null> {
  if (BEGINNER_TIPS[term]) return BEGINNER_TIPS[term];
  const hit = await lookupRule(term);
  return hit.found && hit.matchType !== 'fuzzy' ? ruleText(hit.entry!) : null;
}
