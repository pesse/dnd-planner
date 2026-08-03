/**
 * Ein gruppiertes „das steht drauf"-Protokoll eines fertigen `Character`. Alles aus dem
 * Objekt abgeleitet, damit die Vorschau exakt dem entspricht, was gespeichert wird; die
 * Fragestellung zu einer Wahl steht nicht im Ledger und kommt daher von außen.
 */
import type { Character } from '../schemas/characterSchema';
import { SKILL_DEFS } from '../domain/skills';
import { ABILITY_KEYS, ABILITY_LABEL } from '../schemas/abilities';
import { sign } from '../utils/num';

export interface ProtocolGroup {
  heading: string;
  lines: string[];
}



export function buildCharacterProtocol(
  c: Character,
  extras: { decisions?: { question: string; answer: string }[] } = {},
): ProtocolGroup[] {
  const groups: ProtocolGroup[] = [];
  const add = (heading: string, lines: string[]): void => {
    if (lines.length) groups.push({ heading, lines });
  };

  add('Attribute', ABILITY_KEYS.map((k) => `${ABILITY_LABEL[k]} ${c[k]} (${sign(c[`${k}Mod`])})`));

  add('Werte', [
    ...(c.hpMax ? [`Trefferpunkte: ${c.hpMax}`] : []),
    ...(c.hitDice ? [`Trefferwürfel: ${c.hitDice}`] : []),
    ...(c.speed ? [`Bewegungsrate: ${c.speed}`] : []),
    `Übungsbonus: +${c.proficiencyBonus}`,
  ]);

  add('Geübte Fertigkeiten', SKILL_DEFS.filter((d) => c.skills[d.key]?.prof && !c.skills[d.key]?.exp).map((d) => d.label));
  add('Expertise', SKILL_DEFS.filter((d) => c.skills[d.key]?.exp).map((d) => d.label));
  add('Rettungswurf-Übungen', ABILITY_KEYS.filter((k) => c[`${k}SaveProf`]).map((k) => ABILITY_LABEL[k]));

  add('Waffen', [
    ...(c.proficiencies.simpleWeapons ? ['Einfache Waffen'] : []),
    ...(c.proficiencies.martialWeapons ? ['Kriegswaffen'] : []),
    ...(c.proficiencies.individualWeapons ?? []),
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
