/**
 * Die Blöcke neben dem festen Übersichtsblatt: Waffenmeisterschaft, Options-Pools, Ausrüstung
 * samt Geldmitteln. Für die ersten beiden hat der Taendler-Bogen keinen Platz, die Ausrüstung
 * führt er auf seinem zweiten Blatt.
 */
import type { WeaponMastery } from '$lib/schemas/vocabulary';
import { masteryLabel, masteryRuleDe } from '$lib/itemLabels';
import { coversWeapon, weaponNameSet } from '$lib/services/weaponProficiency';
import { formatKg, formatTotalWeight, lineWeightKg } from '$lib/utils/inventoryWeight';
import { poolPicks } from '$lib/services/declaration/optionPool';
import type { CharacterPrintData } from '../data';
import { block, esc, escLines, field, table, tickBoxes, writeLines } from '../html';

export function renderMasteries(d: CharacterPrintData): string {
  const chosen = d.character.masteries ?? [];
  // Eine gespeicherte Wahl zählt auch ohne Kontingent: Homebrew liefert keine Angebotszahl.
  if (!chosen.length && d.mastery.allowance <= 0) return '';
  // Derselbe Namensvergleich wie bei der Waffenübung — „kurzschwert" trifft „Kurzschwert".
  const ruleOf = (name: string): WeaponMastery | undefined => {
    const set = weaponNameSet([name], () => undefined);
    return d.mastery.weapons.find((w) => coversWeapon(set, w))?.mastery;
  };
  const lines = chosen.map((name) => {
    const m = ruleOf(name);
    return `<div class="pick"><span class="pick-name">${esc(name)}</span>` +
      (m ? ` <span class="pick-help">— ${esc(masteryLabel(m))}: ${esc(masteryRuleDe(m))}</span>` : '') +
      '</div>';
  }).join('');
  const open = Math.max(0, d.mastery.allowance - chosen.length);
  const rest = open ? `<div class="res-label">Offen</div>${writeLines(open)}` : '';
  return block('Waffenmeisterschaft', lines + rest, { hint: `max. ${d.mastery.allowance}` });
}

export function renderOptionPools(d: CharacterPrintData, cls = ''): string {
  return d.pools.map((offer) => {
    const picked = poolPicks(d.character.optionPicks ?? [], offer.featureKey);
    const byValue = new Map(offer.options.map((o) => [o.value, o]));
    const lines = picked.map((p) => {
      const opt = byValue.get(p.value);
      const help = opt?.helpDe ?? '';
      return `<div class="pick"><span class="pick-name">${esc(p.valueDe || opt?.labelDe || p.value)}</span>` +
        (help ? `<div class="pick-help">${esc(help)}</div>` : '') + '</div>';
    }).join('');
    const open = Math.max(0, offer.allowance - picked.length);
    const rest = open ? `<div class="res-label">Offen</div>${writeLines(open)}` : '';
    // Eine einzelne Wahl ließe die zweite Spalte leer.
    const wide = picked.length + (open ? 1 : 0) > 1 ? ' cols' : '';
    return block(offer.titleDe, lines + rest, { cls: cls + wide, hint: `max. ${offer.allowance}` });
  }).join('');
}

/** Drei Tabellen nebeneinander wie beim Taendler: eine über die ganze Breite ist ein Drittel
 *  Namensspalte und zwei Drittel Luft, und sie schiebt sich als Ganzes aufs nächste Blatt. */
const INVENTORY_COLUMNS = 3;

/** Dieselbe Schreibweise wie die Gesamtlast darunter — sonst steht „0.05" über „101,25". */
const weightCell = (raw: string): string => {
  const n = lineWeightKg({ weight: raw });
  const text = n > 0 ? `${formatKg(n)} kg` : esc(raw);
  return `<span class="num">${text}</span>`;
};

/** Am Tisch kommt Ausrüstung dazu — je Spalte vier Zeilen zum Nachtragen. */
const INVENTORY_WRITE_ROWS = 4;

const INVENTORY_HEADERS = ['Gegenstand', 'Anz.', 'Gew.'];
const WRITE_ROW = ['<span class="wcell"></span>', '', ''];

/**
 * Drei gleich lange Spalten: die kürzeste bekommt die Leerzeilen der längsten dazu, damit die
 * Schreibfläche eine Fläche ist und keine Treppe.
 */
const inventoryTables = (inv: CharacterPrintData['character']['inventory']): string => {
  const perColumn = Math.ceil(inv.length / INVENTORY_COLUMNS);
  const rowCount = perColumn + INVENTORY_WRITE_ROWS;
  return Array.from({ length: INVENTORY_COLUMNS }, (_, i) => {
    const rows = inv.slice(i * perColumn, (i + 1) * perColumn).map((item) => [
      esc(item.name),
      `<span class="num">${esc(item.count)}</span>`,
      weightCell(item.weight),
    ]);
    while (rows.length < rowCount) rows.push(WRITE_ROW);
    return table(INVENTORY_HEADERS, rows, 'inv');
  }).join('');
};

export function renderInventory(d: CharacterPrintData): string {
  const inv = d.character.inventory ?? [];
  const notes = d.character.inventoryNotes?.trim();
  const total = formatTotalWeight(inv);
  // Kein Notizfeld: die Leerzeilen der Tabelle sind die Fläche. Eine gepflegte Notiz steht
  // trotzdem darunter, sonst fiele sie beim Drucken weg.
  const body = `<div class="inv-cols">${inventoryTables(inv)}</div>` +
    (notes ? `<div class="prose inv-notes">${escLines(notes)}</div>` : '');
  return block('Ausrüstung & Geldmittel', `<div class="inv-wrap">${body}</div>${currencyColumn(d)}`,
    { cls: 'wide long inv', hint: total ? `Gesamtlast ${total} kg` : '' });
}

const CURRENCY_ROWS: [string, keyof CharacterPrintData['character']['currency']][] = [
  ['KM', 'km'], ['SM', 'sm'], ['EM', 'em'], ['GM', 'gm'], ['PM', 'pm'],
];

/** Alle fünf Sorten: der Stand ändert sich am Tisch dauernd, die leere Kapsel ist Schreibfläche. */
export const currencyFields = (d: CharacterPrintData): string =>
  CURRENCY_ROWS.map(([label, key]) =>
    field(label, esc(d.character.currency[key] ?? ''), 'small')).join('');

/** Die Münzen stehen am rechten Rand der Ausrüstung, nicht in einem zweiten Kasten. */
const currencyColumn = (d: CharacterPrintData): string =>
  `<div class="inv-money"><span class="o-plbl">Geldmittel</span>${currencyFields(d)}</div>`;
