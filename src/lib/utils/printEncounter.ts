import type { Encounter, Monster } from '../types';
import { monsterSizeLabel, monsterTypeLabel, monsterAlignmentLabel } from '../types';
import { renderMarkdown, renderMarkdownInline } from './markdown';
import { RULE_TEXT_PRINT_CSS } from './printCss';

export interface PrintMonster { monster: Monster | null; count: number; notes: string; slug: string; }

function modStr(n: number): string {
  const m = Math.floor((n - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderStatBlock(pm: PrintMonster): string {
  if (!pm.monster) return `<div class="missing">${esc(pm.slug)} — nicht gefunden</div>`;
  const m = pm.monster;

  const statsHtml = (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((key, i) => {
    const label = ['STR', 'DEX', 'KON', 'INT', 'WEI', 'CHA'][i];
    return `<div class="sb-stat"><div class="stat-lbl">${label}</div><div class="stat-val">${m.stats[key]} (${modStr(m.stats[key])})</div></div>`;
  }).join('');

  const props: string[] = [];
  if (Object.keys(m.saving_throws ?? {}).length)
    props.push(`<div class="sb-prop"><span class="lbl">Rettungswürfe</span> ${esc(Object.entries(m.saving_throws).map(([k, v]) => `${k} ${v}`).join(', '))}</div>`);
  if (Object.keys(m.skills ?? {}).length)
    props.push(`<div class="sb-prop"><span class="lbl">Fertigkeiten</span> ${esc(Object.entries(m.skills).map(([k, v]) => `${k} ${v}`).join(', '))}</div>`);
  if (m.damage_resistances?.length)
    props.push(`<div class="sb-prop"><span class="lbl">Schadensresistenzen</span> ${esc(m.damage_resistances.join(', '))}</div>`);
  if (m.damage_immunities?.length)
    props.push(`<div class="sb-prop"><span class="lbl">Schadensimmunitäten</span> ${esc(m.damage_immunities.join(', '))}</div>`);
  if (m.condition_immunities?.length)
    props.push(`<div class="sb-prop"><span class="lbl">Zustandsimmunitäten</span> ${esc(m.condition_immunities.join(', '))}</div>`);
  props.push(`<div class="sb-prop"><span class="lbl">Sinne</span> ${esc(m.senses)}</div>`);
  props.push(`<div class="sb-prop"><span class="lbl">Sprachen</span> ${esc(m.languages)}</div>`);
  if (pm.notes)
    props.push(`<hr class="thin"><div class="sb-prop notes"><span class="lbl">DM-Notizen</span> <span class="md md-inline">${renderMarkdownInline(pm.notes)}</span></div>`);

  // Beschreibungen als Inline-Markdown — der Text läuft in derselben Zeile wie
  // der Aktionsname weiter, ein Block-Element würde sie umbrechen.
  const renderActions = (arr: Monster['actions']) =>
    (arr ?? []).map(a =>
      `<div class="sb-action"><span class="action-name">${esc(a.name)}.</span>${a.attack_bonus !== undefined ? ` Angriff +${a.attack_bonus}.` : ''}${a.damage?.length ? ` Schaden: ${esc(a.damage.map(d => d.type ? `${d.dice} ${d.type}` : d.dice).join(' + '))}.` : ''} <span class="md md-inline">${renderMarkdownInline(a.description)}</span></div>`
    ).join('');
  const renderSimple = (arr: Monster['traits']) =>
    (arr ?? []).map(t =>
      `<div class="sb-action"><span class="action-name">${esc(t.name)}.</span> <span class="md md-inline">${renderMarkdownInline(t.description)}</span></div>`
    ).join('');

  const traits = renderSimple(m.traits);
  const actions = renderActions(m.actions);
  const reactions = renderSimple(m.reactions);
  const legendary = renderSimple(m.legendary_actions);

  const hpBoxes = Array.from({ length: pm.count }, (_, i) =>
    `<div class="track-box-wrap"><span class="track-num">${pm.count > 1 ? `#${i + 1}` : ''}</span><div class="track-box"></div></div>`
  ).join('');

  return `<div class="stat-block">
  <div class="sb-name-row">
    <span class="sb-name">${pm.count > 1 ? `${pm.count}× ` : ''}${esc(m.name)}</span>
    <span class="sb-cr">HG ${esc(m.cr)} (${m.xp} EP)</span>
  </div>
  <div class="sb-type">${esc(monsterSizeLabel(m.size))}, ${esc(monsterTypeLabel(m.type))}, ${esc(monsterAlignmentLabel(m.alignment))}</div>
  <hr class="orange">
  <div class="sb-prop"><span class="lbl">Rüstungsklasse</span> ${m.ac.value}${m.ac.note ? ` (${esc(m.ac.note)})` : ''}</div>
  <div class="sb-prop"><span class="lbl">Trefferpunkte</span> ${m.hp.average} (${esc(m.hp.formula)})</div>
  <div class="sb-prop"><span class="lbl">Bewegungsrate</span> ${esc(m.speed)}</div>
  <hr class="orange">
  <div class="sb-stats">${statsHtml}</div>
  <hr class="orange">
  ${props.join('')}
  ${traits ? `<hr class="orange">${traits}` : ''}
  ${actions ? `<div class="section-title">Aktionen</div><hr class="thin">${actions}` : ''}
  ${reactions ? `<div class="section-title">Reaktionen</div><hr class="thin">${reactions}` : ''}
  ${legendary ? `<div class="section-title">Legendäre Aktionen</div><hr class="thin">${legendary}` : ''}
  <hr class="orange">
  <div class="track-row">
    <div class="track-group">
      <span class="track-lbl">Initiative</span>
      <div class="track-box"></div>
    </div>
    <div class="track-group track-hp">
      <span class="track-lbl">TP (${m.hp.average})</span>
      <div class="track-boxes">${hpBoxes}</div>
    </div>
  </div>
</div>`;
}

const DIFF_COLOR: Record<string, string> = {
  leicht: '#2d6a2d', mittel: '#7a5c00', schwer: '#8c3a00', 'tödlich': '#8c1a00',
};
const STATUS_LABEL: Record<string, string> = {
  planned: 'Geplant', done: 'Gespielt', skipped: 'Übersprungen',
};

export function buildPrintHtmlMarkdown(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
@page { margin: 2cm; }
* { box-sizing: border-box; }
body { font-family: 'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif; color: #1a1008; background: white; font-size: 11pt; line-height: 1.7; margin: 0; }
h1 { font-size: 20pt; font-variant: small-caps; color: #5c1a00; border-bottom: 3px solid #8c6a1a; padding-bottom: 0.3rem; margin-bottom: 0.8rem; }
h2 { font-size: 14pt; font-variant: small-caps; color: #5c1a00; border-bottom: 1px solid #8c6a1a88; margin-top: 1.5rem; margin-bottom: 0.4rem; }
h3 { font-size: 12pt; color: #3a2000; margin-top: 1.2rem; margin-bottom: 0.3rem; }
h4, h5, h6 { color: #3a2000; margin-top: 1rem; margin-bottom: 0.2rem; }
p { margin: 0 0 0.8rem; }
ul, ol { padding-left: 1.5rem; margin: 0 0 0.8rem; }
li { margin-bottom: 0.2rem; }
strong { color: #5c1a00; }
em { color: #3a2000; }
code { font-family: 'Courier New',monospace; background: #f5edd8; padding: 0.1em 0.35em; border-radius: 2px; font-size: 9.5pt; }
pre { background: #f5edd8; border: 1px solid #8c6a1a66; border-radius: 4px; padding: 0.8rem 1rem; white-space: pre-wrap; font-size: 9pt; margin: 0 0 0.8rem; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #8c6a1a; margin: 0 0 0.8rem; padding: 0.3rem 0 0.3rem 1rem; color: #3a2000; font-style: italic; }
hr { border: none; border-top: 2px solid #8c6a1a; margin: 1.2rem 0; }
table { border-collapse: collapse; width: 100%; margin-bottom: 0.8rem; font-size: 10pt; }
th { background: #f0e0b8; color: #5c1a00; font-weight: 700; border: 1px solid #8c6a1a88; padding: 0.3rem 0.6rem; text-align: left; }
td { border: 1px solid #8c6a1a55; padding: 0.25rem 0.6rem; vertical-align: top; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function buildPrintHtml(draft: Encounter, printMonsters: PrintMonster[]): string {
  const monsterRows = draft.monsters.filter(m => m.slug).map(m =>
    `<tr><td class="mon-count">${m.count}×</td><td class="mon-slug">${esc(m.slug)}</td><td class="mon-notes md">${renderMarkdownInline(m.notes)}</td></tr>`
  ).join('');

  const statBlocks = printMonsters.map(renderStatBlock).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${esc(draft.name)}</title>
<style>
@page { margin: 1.5cm; }
* { box-sizing: border-box; }
body { font-family: 'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif; color: #1a1008; background: white; font-size: 10pt; line-height: 1.5; margin: 0; }
.header { border-bottom: 3px solid #8c6a1a; padding-bottom: 0.4rem; margin-bottom: 0.6rem; display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
h1 { font-size: 18pt; font-variant: small-caps; color: #5c1a00; margin: 0; }
.badges { display: flex; gap: 0.8rem; font-size: 9pt; font-weight: 600; color: #3a2000; align-items: center; flex-wrap: wrap; }
.diff { color: ${DIFF_COLOR[draft.difficulty] ?? '#3a2000'}; }
.lbl { font-weight: 700; color: #5c1a00; }
.meta { font-size: 9pt; margin-bottom: 0.4rem; }
.section-title { font-size: 11pt; font-weight: 700; font-variant: small-caps; color: #5c1a00; border-bottom: 1px solid #8c6a1a88; margin-top: 0.8rem; margin-bottom: 0.3rem; padding-bottom: 0.1rem; }
.text { margin-bottom: 0.3rem; }
.read-aloud { background: #f5edd8; border-left: 4px solid #8c6a1a; border-radius: 3px; padding: 0.5rem 0.8rem; margin: 0.6rem 0; }
.read-aloud-label { font-size: 8pt; font-weight: 700; color: #5c1a00; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.25rem; }
.read-aloud-text { font-style: italic; line-height: 1.7; color: #2a1800; }
.monster-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
.mon-count { width: 2rem; font-weight: 700; color: #5c1a00; vertical-align: top; padding: 0.15rem 0.3rem 0.15rem 0; }
.mon-slug { width: 10rem; font-weight: 600; vertical-align: top; padding: 0.15rem 0.5rem 0.15rem 0; }
.mon-notes { color: #3a2000; font-style: italic; vertical-align: top; padding: 0.15rem 0; }
.statblocks-title { font-size: 13pt; font-weight: 700; font-variant: small-caps; color: #5c1a00; border-top: 3px solid #8c6a1a; margin-top: 1.2rem; padding-top: 0.5rem; margin-bottom: 0.8rem; }
.statblocks { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; align-items: start; }
.stat-block { background: #fdf1dc; border: 2px solid #8c6a1a; border-radius: 4px; padding: 0.6rem 0.75rem; font-size: 8.5pt; break-inside: avoid; }
.sb-name-row { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
.sb-name { font-size: 11pt; font-weight: 700; color: #5c1a00; font-variant: small-caps; }
.sb-cr { font-size: 8pt; color: #5c1a00; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.sb-type { font-style: italic; font-size: 8pt; color: #3a2000; margin-bottom: 0.15rem; }
hr { border: none; margin: 0.25rem 0; }
hr.orange { border-top: 2px solid #8c6a1a; }
hr.thin { border-top: 1px solid #8c6a1a66; }
.sb-prop { margin: 0.08rem 0; line-height: 1.4; }
.sb-prop.notes { font-style: italic; color: #3a2000; }
.sb-stats { display: grid; grid-template-columns: repeat(6,1fr); text-align: center; gap: 0.1rem; margin: 0.2rem 0; }
.sb-stat { display: flex; flex-direction: column; }
.stat-lbl { font-size: 7pt; font-weight: 700; color: #5c1a00; text-transform: uppercase; }
.stat-val { font-size: 8pt; }
.section-title { font-size: 9pt; font-variant: small-caps; font-weight: 700; color: #5c1a00; margin-top: 0.3rem; margin-bottom: 0.05rem; }
.sb-action { margin: 0.2rem 0; line-height: 1.4; }
.action-name { font-weight: 700; font-style: italic; }
.missing { font-style: italic; color: #888; }
.track-row { display: flex; gap: 0.6rem; align-items: flex-start; margin-top: 0.3rem; flex-wrap: wrap; }
.track-group { display: flex; align-items: center; gap: 0.3rem; }
.track-hp { flex: 1; }
.track-lbl { font-size: 7.5pt; font-weight: 700; color: #5c1a00; white-space: nowrap; }
.track-boxes { display: flex; flex-wrap: wrap; gap: 0.2rem; }
.track-box-wrap { display: flex; align-items: center; gap: 0.15rem; }
.track-num { font-size: 6.5pt; color: #8c6a1a; }
.track-box { width: 2cm; height: 0.55cm; border: 1.5px solid #8c6a1a; border-radius: 2px; background: white; }
${RULE_TEXT_PRINT_CSS}
</style>
</head>
<body>
<div class="header">
  <h1>${esc(draft.name)}</h1>
  <div class="badges">
    <span class="diff">${draft.difficulty.toUpperCase()}</span>
    <span>${draft.xp_total} XP</span>
    <span>${draft.party_size}× Lvl ${draft.party_level}</span>
    <span>${STATUS_LABEL[draft.status ?? 'planned'] ?? ''}</span>
  </div>
</div>
${draft.location ? `<div class="meta"><span class="lbl">Ort</span> ${esc(draft.location)}</div>` : ''}
${draft.description ? `<div class="section-title">Beschreibung</div><div class="text md">${renderMarkdown(draft.description)}</div>` : ''}
${draft.read_aloud ? `<div class="read-aloud"><div class="read-aloud-label">📖 Vorlesetext</div><div class="read-aloud-text md">${renderMarkdown(draft.read_aloud)}</div></div>` : ''}
<div class="section-title">Monster</div>
<table class="monster-table">${monsterRows}</table>
${draft.loot ? `<div class="section-title">Beute</div><div class="text md">${renderMarkdown(draft.loot)}</div>` : ''}
${draft.notes ? `<div class="section-title">Notizen</div><div class="text md">${renderMarkdown(draft.notes)}</div>` : ''}
${printMonsters.length ? `<div class="statblocks-title">Stat Blocks</div><div class="statblocks">${statBlocks}</div>` : ''}
</body>
</html>`;
}
