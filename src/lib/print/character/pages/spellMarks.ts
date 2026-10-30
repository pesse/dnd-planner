/**
 * Die Kennzeichen einer Zauberzeile und ihre Legende im Kastenkopf: Konzentration, Wirkzeit,
 * Ritual, gesperrte Zustände (Tiergestalt, Kampfrausch) und wegfallende Komponenten.
 */
import type { CastingState, ComponentWaiver } from '$lib/schemas/casting';
import type { BlockedState } from '$lib/services/spellcasting/resolve';
import type { GroupedSpell, SpellQuotaGroup } from '$lib/services/spellcasting/grouped';
import { esc } from '../html';

const STATE_DE: Record<CastingState, string> = { 'wild-shape': 'Tiergestalt', rage: 'Kampfrausch' };
const STATE_MARK: Record<CastingState, string> = { 'wild-shape': 'T', rage: 'KR' };
const COMPONENT_LETTER = { verbal: 'V', somatic: 'S', material: 'M' } as const;

/** Was eine Zeile aus ihren Kontingenten mitbringt; gesammelt über alle, die sie führen. */
export interface SpellRiders {
  castableIn: Set<CastingState>;
  waivers: ComponentWaiver[];
}

export const noRiders = (): SpellRiders => ({ castableIn: new Set(), waivers: [] });

export function addRiders(riders: SpellRiders, q: SpellQuotaGroup, s: GroupedSpell): void {
  const castable = q.castableIn;
  if (castable && !(castable.exceptCostlyMaterial && s.costlyMaterial)) riders.castableIn.add(castable.state);
  riders.waivers.push(...q.waivers);
}

/** „ohne V, S" — nur Komponenten, die der Zauber hat; teures Material bleibt, wo die Regel es sagt. */
export function waiverNote(s: GroupedSpell, waivers: ComponentWaiver[]): string {
  const notes = waivers.flatMap((w) => {
    if (w.schools.length && !w.schools.some((school) => school === s.school)) return [];
    const letters = w.omit
      .filter((c) => !(c === 'material' && w.keepCostlyMaterial && s.costlyMaterial))
      .map((c) => COMPONENT_LETTER[c])
      .filter((l) => s.components.includes(l));
    if (!letters.length) return [];
    return [`${w.whenDe.trim() ? `${w.whenDe.trim()} ` : ''}ohne ${letters.join(', ')}`];
  });
  return [...new Set(notes)].join(' · ');
}

/** Ein gesperrter Zustand im Kasten: welche Zeilen ein Zeichen tragen, und was es heißt. */
interface StateMarking {
  state: CastingState;
  /** true = das Zeichen markiert die Ausnahmen, die NICHT gehen. */
  inverted: boolean;
  marked: Set<string>;
  note: string;
}

/**
 * Markiert wird die Minderheit: beim Mondzirkel die wenigen Zirkelzauber, beim Erzdruiden die
 * wenigen Zauber mit teurem Material — ein Zeichen an jeder Zeile sagte nichts mehr.
 */
function stateMarking(block: BlockedState, spells: { key: string; riders: SpellRiders }[]): StateMarking {
  const name = STATE_DE[block.state];
  const mark = STATE_MARK[block.state];
  const conc = block.concentration === 'kept' ? 'Konzentration bleibt' : 'Konzentration endet';
  const castable = spells.filter((s) => s.riders.castableIn.has(block.state)).map((s) => s.key);
  const blocked = spells.filter((s) => !s.riders.castableIn.has(block.state)).map((s) => s.key);
  const base = { state: block.state, inverted: false, marked: new Set<string>() };
  if (!castable.length) return { ...base, note: `${name}: kein Zaubern, ${conc}` };
  if (!blocked.length) return { ...base, note: `${name}: alle Zauber dieses Kastens wirkbar, ${conc}` };
  if (castable.length <= blocked.length)
    return { ...base, marked: new Set(castable), note: `${name}: nur mit <b>${mark}</b> markierte Zauber, ${conc}` };
  return {
    ...base,
    inverted: true,
    marked: new Set(blocked),
    note: `${name}: alle Zauber außer mit <s><b>${mark}</b></s> markierten, ${conc}`,
  };
}

export interface BoxMarks {
  /** Die Zeichen hinter dem Zaubernamen, schon als HTML. */
  marksOf: (s: GroupedSpell) => string;
  /** Zeilen für den Kastenkopf. */
  legend: string[];
}

const markSpan = (text: string, title: string, struck = false): string =>
  `<span class="spell-mark" title="${esc(title)}">${struck ? `<s>${text}</s>` : text}</span>`;

export function boxMarks(
  spells: { spell: GroupedSpell; riders: SpellRiders }[],
  blocks: BlockedState[],
  alwaysWithChosen: boolean,
): BoxMarks {
  const states = blocks.map((b) => stateMarking(b, spells.map((s) => ({ key: s.spell.key, riders: s.riders }))));
  const has = (pred: (s: GroupedSpell) => boolean) => spells.some(({ spell }) => pred(spell));

  const marksOf = (s: GroupedSpell): string =>
    [
      s.concentration ? markSpan('K', 'Konzentration') : '',
      s.castTime === 'bonus' ? markSpan('B', 'Bonusaktion') : '',
      s.castTime === 'reaction' ? markSpan('Re', 'Reaktion') : '',
      s.ritual ? markSpan('R', 'Ritual') : '',
      ...states
        .filter((m) => m.marked.has(s.key))
        .map((m) => markSpan(STATE_MARK[m.state], STATE_DE[m.state], m.inverted)),
    ].join('');

  const keys = [
    has((s) => s.concentration) ? '<b>K</b> Konzentration' : '',
    has((s) => s.castTime === 'bonus') ? '<b>B</b> Bonusaktion (pro Zug nur ein Zauberplatz)' : '',
    has((s) => s.castTime === 'reaction') ? '<b>Re</b> Reaktion' : '',
    alwaysWithChosen ? '<i class="cbox always"></i> immer vorbereitet, zählt nicht gegen die Vorbereitung' : '',
  ].filter(Boolean);
  return { marksOf, legend: [...(keys.length ? [keys.join(' · ')] : []), ...states.map((m) => m.note)] };
}
