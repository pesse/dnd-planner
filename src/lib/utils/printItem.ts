import type { Item } from '../types';
import { structuralType, dirOf } from '../itemLibrary';
import { DAMAGE_TYPE_LABELS, PROPERTY_LABELS, WEAPON_CATEGORY_LABELS, WEAPON_RANGE_LABELS, ARMOR_CATEGORY_LABELS, CATEGORY_LABELS, masteryLabel, masteryRuleDe } from '../itemLabels';
import { formatCost, formatRarity, formatDamageDice, ftToM } from '../itemFormat';
import { renderMarkdown, ruleText } from './markdown';
import { RULE_TEXT_PRINT_CSS } from './printCss';

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

function rarityHex(item: Item): string {
  const n = item.rarity?.name;
  return (n && RARITY_PRINT_COLORS[n]) || RARITY_PRINT_COLORS.Common;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FONT_FAMILY = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";

const ORNDIV = `<div class="orndiv"><div class="ol"></div><span class="og">◆</span><div class="ol"></div></div>`;

function row(label: string, value: string): string {
  return `<div class="prop"><span class="plabel">${esc(label)}</span><span>${value}</span></div>`;
}

const CARD_CSS = `
@page { size: A4 portrait; margin: 16mm; }
* { box-sizing: border-box; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ${FONT_FAMILY}; background: white; color: #1a0a00;
       display: flex; justify-content: center; }

.card {
  position: relative;
  width: 120mm;
  border: 0.5mm solid color-mix(in srgb, var(--c) 70%, #6a5a30);
  border-radius: 2.5mm;
  overflow: hidden;
  background: #fef8ec;
  display: flex; flex-direction: column;
}
.card::after {
  content: '';
  position: absolute; inset: 1mm;
  border: 0.2mm solid color-mix(in srgb, var(--c) 55%, transparent);
  border-radius: 2mm; pointer-events: none;
}

.head {
  padding: 4mm 6mm 3mm;
  text-align: center;
  background: linear-gradient(to bottom,
    color-mix(in srgb, var(--c) 50%, #fef8ec) 0%,
    color-mix(in srgb, var(--c) 9%, #fef8ec) 100%);
}
.name { font-size: 14pt; font-weight: 700; font-variant: small-caps; line-height: 1.2; letter-spacing: 0.02em; }
.name-en { font-size: 8.5pt; font-style: italic; color: #6a5a3a; margin-top: 0.5mm; }
.meta { font-size: 8.5pt; color: color-mix(in srgb, var(--c) 75%, #333); margin-top: 1mm; font-style: italic; }
.subtype { font-size: 7.5pt; color: #897149; margin-top: 0.5mm; text-transform: uppercase; letter-spacing: 0.05em; }
.attune { font-size: 7.5pt; font-weight: 700; color: var(--c); margin-top: 1.2mm; text-transform: uppercase; letter-spacing: 0.04em; }

.orndiv { display: flex; align-items: center; gap: 1.5mm; margin: 2mm 4mm 0; }
.ol { flex: 1; height: 0.3mm; background: linear-gradient(to right, transparent, var(--c) 30%, var(--c) 70%, transparent); }
.orndiv .ol:last-child { background: linear-gradient(to left, transparent, var(--c) 30%, var(--c) 70%, transparent); }
.og { font-size: 7pt; color: var(--c); line-height: 1; }

.props { padding: 2mm 6mm 1mm; display: flex; flex-direction: column; gap: 1mm; font-size: 9pt; }
.prop { display: grid; grid-template-columns: 28mm 1fr; gap: 2mm; align-items: baseline; }
.plabel { color: #897149; font-size: 7.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.pills { display: flex; flex-wrap: wrap; gap: 1mm; }
.pill { background: color-mix(in srgb, var(--c) 12%, #fef8ec); border: 0.2mm solid color-mix(in srgb, var(--c) 35%, transparent);
        border-radius: 4mm; font-size: 7.5pt; padding: 0.2mm 2mm; color: #5a4a30; }
.disadv { color: #a82a18; }

.desc { padding: 3mm 6mm; font-size: 9.5pt; line-height: 1.6; }
.desc.muted { color: #b8a777; }
${RULE_TEXT_PRINT_CSS}

.foot {
  display: flex; align-items: center; justify-content: space-between;
  padding: 2.5mm 6mm; border-top: 0.3mm solid color-mix(in srgb, var(--c) 40%, transparent);
  background: color-mix(in srgb, var(--c) 6%, #fef8ec);
  font-size: 7.5pt; color: #897149; font-style: italic;
}
.src { text-transform: uppercase; letter-spacing: 0.05em; }
`;

/** Erzeugt druckbares HTML für einen Gegenstand (eine Karte, A4). Zeigt NUR die deutsche
 *  Beschreibung — die englische Original-Beschreibung wird im Druck weggelassen. */
export function prepareItemPrint(item: Item, _doc: Document): string {
  const c = rarityHex(item);
  const stype = structuralType(item);
  const catLabel = CATEGORY_LABELS[dirOf(item)] ?? item.equipment_category?.name ?? '';

  // Subtyp-Zeile (Waffenkategorie/-reichweite bzw. Rüstungskategorie)
  let subtype = '';
  if (stype === 'weapon' && (item.weapon_category || item.weapon_range)) {
    const parts = [
      item.weapon_category ? (WEAPON_CATEGORY_LABELS[item.weapon_category] ?? item.weapon_category) : '',
      item.weapon_range ? (WEAPON_RANGE_LABELS[item.weapon_range] ?? item.weapon_range) : '',
    ].filter(Boolean);
    subtype = parts.join(' · ');
  } else if (stype === 'armor' && item.armor_category) {
    subtype = ARMOR_CATEGORY_LABELS[item.armor_category] ?? item.armor_category;
  }

  // Spielwerte
  const rows: string[] = [];
  if (stype === 'weapon') {
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
    if (item.mastery) {
      rows.push(row('Meisterschaft', `<strong>${esc(masteryLabel(item.mastery))}</strong> — ${esc(masteryRuleDe(item.mastery))}`));
    }
  } else if (stype === 'armor') {
    if (item.armor_class) {
      const dex = item.armor_class.dex_bonus
        ? ` + GES-Mod${item.armor_class.max_bonus != null ? ` (max. ${item.armor_class.max_bonus})` : ''}` : '';
      rows.push(row('RK', esc(`${item.armor_class.base}${dex}`)));
    }
    if (item.str_minimum) rows.push(row('Stärke', esc(`mind. ${item.str_minimum}`)));
    if (item.stealth_disadvantage) rows.push(`<div class="prop"><span class="plabel">Heimlichkeit</span><span class="disadv">Nachteil</span></div>`);
  }

  // Beschreibung: deutsche bevorzugt, sonst englische — NIE beide (kein "Original (Englisch)" im Druck).
  const descArr = item.desc_de?.length ? item.desc_de : (item.desc ?? []);
  const descHtml = descArr.length
    ? `<div class="desc"><div class="md">${renderMarkdown(ruleText(descArr))}</div></div>`
    : `<div class="desc muted">—</div>`;

  const footRight = [
    item.cost ? formatCost(item.cost) : '',
    item.weight != null ? `${item.weight} Pfd.` : '',
  ].filter(Boolean).join(' · ');

  const title = item.name_de ?? item.name;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${esc(title)} – Gegenstand</title>
<style>${CARD_CSS}</style>
</head>
<body>
  <div class="card" style="--c:${c}">
    <div class="head">
      <div class="name">${esc(title)}</div>
      ${item.name_de ? `<div class="name-en">${esc(item.name)}</div>` : ''}
      <div class="meta">${item.rarity ? `${esc(formatRarity(item.rarity))} · ` : ''}${esc(catLabel)}</div>
      ${subtype ? `<div class="subtype">${esc(subtype)}</div>` : ''}
      ${item.attunement ? `<div class="attune">Einstimmung erforderlich${item.attunement_by ? ` (${esc(item.attunement_by)})` : ''}</div>` : ''}
    </div>
    ${ORNDIV}
    ${rows.length ? `<div class="props">${rows.join('')}</div>${ORNDIV}` : ''}
    ${descHtml}
    <div class="foot"><span class="src">${esc(item.source)}</span><span>${esc(footRight)}</span></div>
  </div>
</body>
</html>`;
}
