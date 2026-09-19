/**
 * Was auf einer Gegenstandskarte steht, unabhängig vom Format: die große Einzelkarte
 * (`printItem.ts`) und die 70×99-Karte des Bogens (`printItemCard.ts`) setzen dasselbe Bündel.
 * Die Klassennamen sind in beiden Stylesheets dieselben.
 */
import type { Item } from '../types';
import { structuralType, dirOf } from '../itemLibrary';
import {
  ARMOR_CATEGORY_LABELS, CATEGORY_LABELS, DAMAGE_TYPE_LABELS, PROPERTY_LABELS,
  WEAPON_CATEGORY_LABELS, WEAPON_RANGE_LABELS, masteryLabel, masteryRuleDe,
} from '../itemLabels';
import { formatCost, formatDamageDice, formatRarity, ftToM } from '../itemFormat';
import { ruleText } from './markdown';

// Helle Hex-Farben pro Seltenheit (im Druck-Iframe gibt es keine Theme-Variablen).
// Pastellig gehalten wie die Zauber-Schulfarben, damit der getönte Karten-Hintergrund hell bleibt.
const RARITY_PRINT_COLORS: Record<string, string> = {
  Common:      '#b3a47d',
  Uncommon:    '#7cbf6c',
  Rare:        '#6fa6cf',
  'Very Rare': '#a884c9',
  Legendary:   '#d99a57',
  Artifact:    '#cf7060',
};

export interface ItemCardFacts {
  title: string;
  /** Der englische Originalname, leer wenn er der Titel selbst ist. */
  nameEn: string;
  /** Seltenheit und Kategorie. */
  meta: string;
  /** Waffenkategorie/-reichweite bzw. Rüstungskategorie. */
  subtype: string;
  attune: string;
  /** Fertige `.prop`-Zeilen mit den Spielwerten. */
  rows: string[];
  /** Beschreibung als Markdown — deutsch, sonst englisch, NIE beides. */
  description: string;
  /** Quelle und Preis/Gewicht für den Kartenfuß. */
  source: string;
  price: string;
  /** Seltenheitsfarbe für `--c`. */
  color: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const row = (label: string, value: string): string =>
  `<div class="prop"><span class="plabel">${esc(label)}</span><span>${value}</span></div>`;

function subtypeOf(item: Item): string {
  const stype = structuralType(item);
  if (stype === 'weapon') {
    return [
      item.weapon_category ? (WEAPON_CATEGORY_LABELS[item.weapon_category] ?? item.weapon_category) : '',
      item.weapon_range ? (WEAPON_RANGE_LABELS[item.weapon_range] ?? item.weapon_range) : '',
    ].filter(Boolean).join(' · ');
  }
  if (stype === 'armor' && item.armor_category) {
    return ARMOR_CATEGORY_LABELS[item.armor_category] ?? item.armor_category;
  }
  return '';
}

function weaponRows(item: Item, compact: boolean): string[] {
  const rows: string[] = [];
  if (item.damage) {
    const dt = DAMAGE_TYPE_LABELS[item.damage.damage_type.index] ?? item.damage.damage_type.name;
    const th = item.two_handed_damage ? ` · ${formatDamageDice(item.two_handed_damage.damage_dice)} (zweih.)` : '';
    rows.push(row('Schaden', `${esc(formatDamageDice(item.damage.damage_dice))} ${esc(dt)}${esc(th)}`));
  }
  if (item.range) rows.push(row('Reichweite', esc(`${ftToM(item.range.normal)}${item.range.long ? ` / ${ftToM(item.range.long)}` : ''}`)));
  if (item.throw_range) rows.push(row('Wurfweite', esc(`${ftToM(item.throw_range.normal)} / ${ftToM(item.throw_range.long)}`)));
  if (item.magic_bonus) rows.push(row('Bonus', `+${item.magic_bonus} auf Angriff &amp; Schaden`));
  if (item.properties?.length) {
    const pills = item.properties.map((p) => `<span class="pill">${esc(PROPERTY_LABELS[p.index] ?? p.name)}</span>`).join('');
    rows.push(`<div class="prop"><span class="plabel">Eigensch.</span><span class="pills">${pills}</span></div>`);
  }
  // Meisterschaft mit Regeltext — im Druck gibt es keinen Tooltip, also ausgeschrieben.
  // Auf der kleinen Karte nicht: der Regeltext verdrängte dort die Beschreibung.
  if (item.mastery) {
    const label = `<strong>${esc(masteryLabel(item.mastery))}</strong>`;
    rows.push(row('Meisterschaft', compact ? label : `${label} — ${esc(masteryRuleDe(item.mastery))}`));
  }
  return rows;
}

function armorRows(item: Item): string[] {
  const rows: string[] = [];
  if (item.armor_class) {
    const dex = item.armor_class.dex_bonus
      ? ` + GES-Mod${item.armor_class.max_bonus != null ? ` (max. ${item.armor_class.max_bonus})` : ''}` : '';
    rows.push(row('RK', esc(`${item.armor_class.base}${dex}`)));
  }
  if (item.str_minimum) rows.push(row('Stärke', esc(`mind. ${item.str_minimum}`)));
  if (item.stealth_disadvantage) rows.push(`<div class="prop"><span class="plabel">Heimlichkeit</span><span class="disadv">Nachteil</span></div>`);
  return rows;
}

/** `compact` ist die 70×99-Karte des Bogens: dieselben Angaben, aber keine Regelabsätze. */
export function itemCardFacts(item: Item, compact = false): ItemCardFacts {
  const stype = structuralType(item);
  const title = item.name_de ?? item.name;
  const descArr = item.desc_de?.length ? item.desc_de : (item.desc ?? []);

  return {
    title,
    nameEn: item.name_de ? item.name : '',
    meta: [item.rarity ? formatRarity(item.rarity) : '', CATEGORY_LABELS[dirOf(item)] ?? item.equipment_category?.name ?? '']
      .filter(Boolean).join(' · '),
    subtype: subtypeOf(item),
    attune: item.attunement
      ? `Einstimmung erforderlich${item.attunement_by ? ` (${item.attunement_by})` : ''}` : '',
    rows: stype === 'weapon' ? weaponRows(item, compact) : stype === 'armor' ? armorRows(item) : [],
    description: ruleText(descArr),
    source: item.source,
    price: [item.cost ? formatCost(item.cost) : '', item.weight != null ? `${item.weight} Pfd.` : '']
      .filter(Boolean).join(' · '),
    color: (item.rarity?.name && RARITY_PRINT_COLORS[item.rarity.name]) || RARITY_PRINT_COLORS.Common,
  };
}
