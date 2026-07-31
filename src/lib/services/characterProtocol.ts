/**
 * Verdichtet einen fertig zusammengesetzten `Character` zu einem gruppierten
 * „das steht drauf"-Protokoll (Attribute, Werte, Übungen, Zauber, Ausrüstung …) — die
 * gemeinsame Quelle für jede Ansicht, die zeigen will, was ein Charakter KONKRET bekommt
 * (heute: der Wizard-Überblick, analog zur Progression des Stufenaufstiegs).
 *
 * Bewusst rein, ohne Framework/Datei-Zugriff, und alles aus dem Objekt abgeleitet, damit
 * die Vorschau exakt dem entspricht, was gespeichert wird. Merkmals-Entscheidungen tragen
 * im Ledger (`character.features`) keine Fragestellung, nur die Wahl — die lesbare
 * {Frage, Antwort}-Fassung kommt daher optional von außen (aus den KI-Ridern).
 */
import type { Character } from '../schemas/character';
import { SKILL_DEFS } from '../pdf/characterFields';

export interface ProtocolGroup {
  heading: string;
  lines: string[];
}

const ABILITY_ORDER = ['str', 'ges', 'kon', 'int', 'wei', 'cha'] as const;
const ABILITY_LABEL: Record<(typeof ABILITY_ORDER)[number], string> = {
  str: 'Stärke', ges: 'Geschicklichkeit', kon: 'Konstitution',
  int: 'Intelligenz', wei: 'Weisheit', cha: 'Charisma',
};
const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

/** Baut das gruppierte Überblicks-Protokoll; leere Gruppen fallen weg. */
export function buildCharacterProtocol(
  c: Character,
  extras: { decisions?: { question: string; answer: string }[] } = {},
): ProtocolGroup[] {
  const groups: ProtocolGroup[] = [];
  const add = (heading: string, lines: string[]): void => {
    if (lines.length) groups.push({ heading, lines });
  };

  add('Attribute', ABILITY_ORDER.map((k) => `${ABILITY_LABEL[k]} ${c[k]} (${signed(c[`${k}Mod`])})`));

  add('Werte', [
    ...(c.hpMax ? [`Trefferpunkte: ${c.hpMax}`] : []),
    ...(c.hitDice ? [`Trefferwürfel: ${c.hitDice}`] : []),
    ...(c.speed ? [`Bewegungsrate: ${c.speed}`] : []),
    `Übungsbonus: +${c.proficiencyBonus}`,
  ]);

  add('Geübte Fertigkeiten', SKILL_DEFS.filter((d) => c.skills[d.key]?.prof && !c.skills[d.key]?.exp).map((d) => d.label));
  add('Expertise', SKILL_DEFS.filter((d) => c.skills[d.key]?.exp).map((d) => d.label));
  add('Rettungswurf-Übungen', ABILITY_ORDER.filter((k) => c[`${k}SaveProf`]).map((k) => ABILITY_LABEL[k]));

  add('Waffen', [
    ...(c.proficiencies.simpleWeapons ? ['Einfache Waffen'] : []),
    ...(c.proficiencies.martialWeapons ? ['Kriegswaffen'] : []),
    ...(c.proficiencies.otherWeapons?.trim() ? [c.proficiencies.otherWeapons.trim()] : []),
  ]);
  add('Rüstung', [
    ...(c.proficiencies.lightArmor ? ['Leichte Rüstung'] : []),
    ...(c.proficiencies.mediumArmor ? ['Mittelschwere Rüstung'] : []),
    ...(c.proficiencies.heavyArmor ? ['Schwere Rüstung'] : []),
    ...(c.proficiencies.shields ? ['Schilde'] : []),
  ]);
  add('Waffenbeherrschung', c.masteries);
  add('Werkzeuge', c.tools);
  add('Sprachen', c.languages);

  const spells: string[] = [];
  const slots = c.spells.slots.map((s, i) => ({ lvl: i + 1, total: s.total })).filter((s) => s.total > 0);
  if (slots.length) spells.push(`Zauberplätze: ${slots.map((s) => `Grad ${s.lvl}: ${s.total}`).join(', ')}`);
  if (c.spells.cantrips.length) spells.push(`Zaubertricks: ${c.spells.cantrips.map((x) => x.name).join(', ')}`);
  // Nach `prepared` trennen, nicht nach Herkunft: aus dem gespeicherten Charakter ist nicht
  // ablesbar, ob ein Zauber gewählt oder gewährt wurde — die Markierung ist es aber, und beim
  // Magier ist genau sie die interessante Information (Buch ⊋ Vorbereitung).
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
