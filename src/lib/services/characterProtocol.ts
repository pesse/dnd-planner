/**
 * Ein gruppiertes „das steht drauf"-Protokoll eines fertigen `Character`. Alles aus dem
 * Objekt abgeleitet, damit die Vorschau exakt dem entspricht, was gespeichert wird; die
 * Fragestellung zu einer Wahl steht nicht im Ledger und kommt daher von außen.
 */
import type { Character } from '../schemas/characterSchema';
import { characterSummary, type SummarySectionId, type SummaryValue } from './characterSummary';

export interface ProtocolGroup {
  heading: string;
  lines: string[];
}

const HEADINGS: Record<SummarySectionId, string> = {
  abilities: 'Attribute',
  coreValues: 'Werte',
  skills: 'Geübte Fertigkeiten',
  expertise: 'Expertise',
  savingThrows: 'Rettungswurf-Übungen',
  weapons: 'Waffen',
  armor: 'Rüstung',
  masteries: 'Waffenbeherrschung',
  tools: 'Werkzeuge',
  languages: 'Sprachen',
};

function summaryLine(id: SummarySectionId, v: SummaryValue): string {
  if (id === 'abilities') return `${v.label} ${v.score} (${v.detail})`;
  if (id === 'coreValues') return `${v.label}: ${v.detail}`;
  return v.label;
}

export function buildCharacterProtocol(
  c: Character,
  extras: { decisions?: { question: string; answer: string }[] } = {},
): ProtocolGroup[] {
  const groups: ProtocolGroup[] = [];
  const add = (heading: string, lines: string[]): void => {
    if (lines.length) groups.push({ heading, lines });
  };

  for (const s of characterSummary(c))
    add(HEADINGS[s.id], s.values.map((v) => summaryLine(s.id, v)));

  const spells: string[] = [];
  const slots = c.spells.slots.map((s, i) => ({ lvl: i + 1, total: s.total })).filter((s) => s.total > 0);
  if (slots.length) spells.push(`Zauberplätze: ${slots.map((s) => `Grad ${s.lvl}: ${s.total}`).join(', ')}`);
  if (c.spells.cantrips.length) spells.push(`Zaubertricks: ${c.spells.cantrips.map((x) => x.name).join(', ')}`);
  // Nach `prepared` trennen, nicht nach Herkunft: gewählt vs. gewährt ist am gespeicherten
  // Charakter nicht ablesbar, die Markierung dagegen schon (Magier: Buch ⊋ Vorbereitung).
  const entries = Object.entries(c.spells.byLevel)
    .sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([lvl, arr]) => arr.map((e) => ({ ...e, label: `${e.name} (Grad ${lvl})` })));
  const prepared = entries.filter((e) => e.prepared);
  const inBook = entries.filter((e) => !e.prepared);
  if (prepared.length) spells.push(`Vorbereitet: ${prepared.map((e) => e.label).join(', ')}`);
  if (inBook.length) spells.push(`Im Zauberbuch (nicht vorbereitet): ${inBook.map((e) => e.label).join(', ')}`);
  add('Zauber', spells);

  add(
    'Merkmals-Entscheidungen',
    (extras.decisions ?? [])
      .filter((d) => d.answer.trim())
      .map((d) => `${d.question.trim() ? `${d.question}: ` : ''}${d.answer}`),
  );

  const eq = c.inventory.map((i) => (i.count && i.count !== '1' ? `${i.count}× ${i.name}` : i.name));
  if (c.currency.gm) eq.push(`${c.currency.gm} Goldmünzen`);
  add('Ausrüstung', eq);

  return groups;
}
