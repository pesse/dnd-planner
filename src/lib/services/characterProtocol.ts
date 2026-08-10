/**
 * Ein gruppiertes „das steht drauf"-Protokoll eines fertigen `Character`. Alles aus dem
 * Objekt abgeleitet, damit die Vorschau exakt dem entspricht, was gespeichert wird; die
 * Fragestellung zu einer Wahl steht nicht im Ledger und kommt daher von außen.
 */
import type { Character } from '../schemas/characterSchema';
import { characterSummary, type SummarySectionId, type SummaryValue } from './characterSummary';
import type { SheetSpellcasting } from './spellcasting/project';

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
  optionPicks: 'Merkmals-Optionen',
  tools: 'Werkzeuge',
  languages: 'Sprachen',
};

function spellLines(view: SheetSpellcasting | undefined): string[] {
  if (!view) return [];
  const lines: string[] = [];
  const slots = view.levels.filter((l) => l.slots);
  if (slots.length)
    lines.push(`Zauberplätze: ${slots.map((l) => `Grad ${l.level}: ${l.slots}`).join(', ')}`);
  if (view.pact) lines.push(`Pakt-Plätze: ${view.pact.total} × Grad ${view.pact.level}`);
  for (const source of view.sources)
    if (source.abilityDe) lines.push(`${source.label}: Zauber über ${source.abilityDe}`);
  for (const level of view.levels) {
    if (!level.spells.length) continue;
    const names = level.spells.map((s) => s.label).join(', ');
    lines.push(level.level === 0 ? `Zaubertricks: ${names}` : `Grad ${level.level}: ${names}`);
  }
  return lines;
}

function summaryLine(id: SummarySectionId, v: SummaryValue): string {
  if (id === 'abilities') return `${v.label} ${v.score} (${v.detail})`;
  if (id === 'coreValues') return `${v.label}: ${v.detail}`;
  return v.label;
}

/**
 * Die Zauber-Zeilen kommen als Projektion herein: Kontingente und Plätze sind abgeleitet
 * (`services/spellcasting/project.ts`) und am gespeicherten Charakter nicht ablesbar.
 */
export function buildCharacterProtocol(
  c: Character,
  extras: {
    decisions?: { question: string; answer: string }[];
    spellcasting?: SheetSpellcasting;
  } = {},
): ProtocolGroup[] {
  const groups: ProtocolGroup[] = [];
  const add = (heading: string, lines: string[]): void => {
    if (lines.length) groups.push({ heading, lines });
  };

  for (const s of characterSummary(c))
    add(HEADINGS[s.id], s.values.map((v) => summaryLine(s.id, v)));

  add('Zauber', spellLines(extras.spellcasting));

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
