/**
 * Das Übersichtsblatt — ein festes Raster, kein Kastenkatalog: Attributssäule links,
 * Rettungswürfe und Fertigkeiten daneben, Kampfwerte, Persönlichkeit und Angriffe rechts.
 * Aufteilung und Formensprache sind die des Taendler-Bogens, die sich am Tisch bewährt hat:
 * Schild für die Rüstungsklasse, Ovale für die Attributswerte. Gedruckt wird nur, was
 * gespeichert ist — freie Flächen gibt es allein für das, was im Spiel abgestrichen oder
 * nachgetragen wird (Trefferpunkte, Inspiration, Todesretter, Angriffe).
 */
import { ABILITY_ABBR_DE, ABILITY_KEYS, ABILITY_LABEL } from '$lib/schemas/abilities';
import { SKILL_DEFS } from '$lib/domain/skills';
import { PROFICIENCY_FLAGS, proficiencyLabel } from '$lib/domain/proficiencies';
import { formatClassLevel, formatSpecies } from '$lib/schemas/classLevelText';
import { sign } from '$lib/utils/num';
import type { CharacterPrintData } from '../data';
import { chainCircles, esc, escLines } from '../html';

/** Ein Kasten mit der Beschriftung auf der oberen Rahmenlinie, wie die Blöcke. */
const frame = (caption: string, body: string, cls = ''): string =>
  `<div class="tf ${cls}">${body}<span class="tcap">${esc(caption)}</span></div>`;

/** Übungsgrad als Ring: leer, gefüllt, gefüllt mit Ring = Expertise. */
const profMark = (prof: boolean, exp: boolean): string =>
  `<i class="pm${exp ? ' exp' : prof ? ' on' : ''}"></i>`;

/** Wert im Kreis, Beschriftung daneben: die liegenden Kapseln über den Rettungswürfen. */
const pill = (label: string, value: string, cls = ''): string =>
  `<div class="o-pill ${cls}"><span class="o-pill-val">${value}</span>` +
  `<span class="o-pill-lbl">${esc(label)}</span></div>`;

const identity = (d: CharacterPrintData): string => {
  const c = d.character;
  const ident = (label: string, value: string): string =>
    value.trim()
      ? `<div class="o-id"><span class="o-id-val">${value}</span>` +
        `<span class="tcap left">${esc(label)}</span></div>`
      : '';

  // Die Beschriftung gehört in die Namensspalte, nicht in den Kasten: sonst liegt sie unter
  // dem Porträt.
  const name = (d.portraitUrl ? `<img class="o-portrait" src="${esc(d.portraitUrl)}" alt="">` : '') +
    `<div class="o-namecol"><span class="o-name">${esc(c.name)}</span>` +
    `<span class="tcap left">Charaktername</span></div>`;

  const ids = ident('Klassen & Stufen', esc(c.classLevel || formatClassLevel(c.classes ?? []))) +
    ident('Spieler*in', esc(c.playerName)) +
    ident('Hintergrund', esc(c.background)) +
    ident('Volk', esc(c.race || formatSpecies(c.species))) +
    ident('Erfahrungspunkte', esc(c.xp));

  return `<header class="o-head${ids ? '' : ' o-head-solo'}">
    <div class="tf o-namebox">${name}</div>
    ${ids ? `<div class="tf o-idbox">${ids}</div>` : ''}
  </header>`;
};

const abilityStrip = (d: CharacterPrintData): string => {
  const c = d.character;
  const boxes = ABILITY_KEYS.map((k) => `<div class="tf o-attr">
      <span class="tcap o-attr-name">${esc(ABILITY_LABEL[k])}</span>
      <span class="o-attr-mod">${sign(c.mods[k])}</span>
      <span class="o-attr-score">${c.abilities[k]}</span>
    </div>`).join('');
  return `<div class="o-attrs">${boxes}</div>`;
};

/** Die Zeilen verteilen sich über die Kastenhöhe, statt oben zu kleben. */
const lines = (rows: string): string => `<div class="o-lines">${rows}</div>`;

const savesBox = (d: CharacterPrintData): string => {
  const c = d.character;
  const rows = ABILITY_KEYS.map((k) => {
    const value = c.mods[k] + (c.saveProfs[k] ? c.proficiencyBonus : 0);
    return `<div class="o-line">${profMark(c.saveProfs[k], false)}` +
      `<span class="o-val">${sign(value)}</span>` +
      `<span class="o-lbl">${esc(ABILITY_LABEL[k])}</span></div>`;
  }).join('');
  return frame('Rettungswürfe', lines(rows));
};

const skillsBox = (d: CharacterPrintData): string => {
  const c = d.character;
  const rows = SKILL_DEFS.map((def) => {
    const row = c.skills[def.key];
    return `<div class="o-line">${profMark(!!row?.prof, !!row?.exp)}` +
      `<span class="o-val">${sign(row?.value ?? 0)}</span>` +
      `<span class="o-lbl">${esc(def.label)} <em>(${esc(ABILITY_ABBR_DE[def.attr])})</em></span></div>`;
  }).join('');
  return frame('Fertigkeiten', lines(rows), 'o-skills');
};

const headPills = (d: CharacterPrintData): string => {
  const c = d.character;
  const alles = c.alleskoenner
    ? `<div class="o-alles">${profMark(true, false)}Alleskönner</div>`
    : '';
  return pill('Inspiration', '') +
    pill('Übungsbonus', sign(c.proficiencyBonus)) + alles;
};

/** Eine Aufzählung als Text; ohne Inhalt fällt die Zeile weg, statt leer zu stehen. */
const listLine = (label: string, values: string[]): string => {
  const text = values.map((v) => v.trim()).filter(Boolean).join(', ');
  return text
    ? `<div class="o-plist"><span class="o-plbl">${esc(label)}</span>${esc(text)}</div>`
    : '';
};

/**
 * Die Übungen in der Form, die das Schema schon hat: `flag` wird ein Ring, `list` und `prose`
 * stehen als Text darunter. Ohne Trennung nach Rüstung und Waffen gehen die sechs Ringe in
 * zwei Reihen à drei auf.
 */
const proficienciesBox = (d: CharacterPrintData): string => {
  const c = d.character;
  const radios = PROFICIENCY_FLAGS
    .map((f) => `<span class="o-radio">${profMark(!!c.proficiencies[f.field], false)}` +
      `${esc(proficiencyLabel(f.def))}</span>`).join('');

  return frame('Übung und Sprachen', `
    <div class="o-radios">${radios}</div>
    ${listLine('Sonstige Waffen',
      [...c.proficiencies.individualWeapons, c.proficiencies.otherWeapons])}
    ${listLine('Sprachen', c.languages ?? [])}
    ${listLine('Werkzeuge & andere', c.tools ?? [])}`);
};

/** Kleine Zeile im Kopf eines Kastens: „Trefferpunkte Maximum 27" über der Abstreichfläche. */
const capline = (label: string, value: string): string =>
  value.trim()
    ? `<div class="o-capline"><span class="o-plbl">${esc(label)}</span>` +
      `<span class="o-capval">${value}</span></div>`
    : '';

const vitalsBox = (d: CharacterPrintData): string => {
  const c = d.character;
  const disc = (caption: string, value: string, cls = ''): string =>
    value.trim()
      ? `<div class="o-disc ${cls}"><span class="o-disc-val">${value}</span>` +
        `<span class="tcap">${esc(caption)}</span></div>`
      : '';

  // Der gespeicherte Stand wird mitgedruckt (wie bei den Zauberplätzen), die Fläche bleibt
  // trotzdem: am Tisch ändert sich genau dieser Wert dauernd.
  const write = (value: string): string =>
    `<span class="o-write">${value ? `<span class="o-write-val">${esc(value)}</span>` : ''}</span>`;

  const hp = `${frame('Aktuelle Trefferpunkte',
      capline('Trefferpunkte Maximum', esc(c.hpMax)) + write(c.hpCurrent), 'o-hp o-hp-cur')}
    ${frame('Temporäre Trefferpunkte', write(c.hpTemp), 'o-hp o-hp-tmp')}`;

  const dice = frame('Trefferwürfel',
    (c.hitDice.trim() ? `<div class="o-dice">${esc(c.hitDice)}</div>` : '') + write(''),
    'o-hp o-hp-dice');
  const death = frame('Rettungswürfe gegen Tod',
    `<div class="o-death"><span class="o-plbl">Erfolge</span>${chainCircles(3)}</div>` +
    `<div class="o-death"><span class="o-plbl">Fehlschläge</span>${chainCircles(3)}</div>`, 'o-deathbox');

  const discs = disc('Rüstungsklasse', esc(c.ac), 'o-shield') +
    disc('Initiative', esc(c.initiative)) + disc('Bewegungsrate', esc(c.speed));

  return `<div class="o-vitals">
    ${discs ? `<div class="o-discs">${discs}</div>` : ''}
    ${hp}
    <div class="o-duo">${dice}${death}</div>
  </div>`;
};

const PERSON_ROWS: [string, keyof CharacterPrintData['character']][] = [
  ['Persönlichkeitsmerkmale', 'traits'], ['Ideale', 'ideals'],
  ['Bindungen', 'bonds'], ['Makel', 'flaws'],
];

/** Ein leerer Rahmen mit Beschriftung wäre ein Formularfeld — gedruckt wird, was da ist. */
const personBox = (d: CharacterPrintData): string => {
  const boxes = PERSON_ROWS.filter(([, key]) => String(d.character[key] ?? '').trim())
    .map(([caption, key]) =>
      frame(caption, `<div class="prose">${escLines(String(d.character[key] ?? ''))}</div>`, 'o-quote'))
    .join('');
  return boxes ? `<div class="o-person">${boxes}</div>` : '';
};

/** Der Rechner liefert die Zahl ohne Vorzeichen — auf dem Bogen ist sie ein Wurfbonus. */
const withSign = (bonus: string): string => (/^\d/.test(bonus) ? `+${bonus}` : bonus);

/** Am Tisch kommt eine Waffe dazu — der Kasten läuft mit Leerzeilen aus. */
const ATTACK_WRITE_ROWS = 8;

const attacksBox = (d: CharacterPrintData): string => {
  if (!d.attacks.length) return '';
  const cell = (v: string, cls = ''): string => `<td class="${cls}">${v}</td>`;
  const rows = d.attacks.map((a) => `<tr>${cell(esc(a.name))}${cell(esc(a.range), 'num')}` +
    `${cell(esc(withSign(a.bonus)), 'num')}${cell(esc(a.damage), 'num')}${cell(esc(a.type))}</tr>`);
  const writeRow = `<tr>${cell('<span class="wcell"></span>')}${'<td></td>'.repeat(4)}</tr>`;
  rows.push(...Array.from({ length: ATTACK_WRITE_ROWS }, () => writeRow));

  const head = ['Angriff', 'Reichweite', 'Bonus', 'Schaden', 'Schadentyp']
    .map((h, i) => `<th class="${i > 0 && i < 4 ? 'num' : ''}">${esc(h)}</th>`).join('');
  return frame('Waffen & Angriffszauber',
    `<table class="o-atk"><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`, 'o-atkbox');
};

export function renderOverview(d: CharacterPrintData): string {
  const pp = d.character.passivePerception.trim();
  const passive = pp ? pill('Passive Wahrnehmung (10 + Wahrnehmung)', esc(pp)) : '';
  const person = personBox(d);

  return `<section class="sheet">
    ${identity(d)}
    ${abilityStrip(d)}
    <div class="o-mid">${headPills(d)}
      <div class="o-panel">${savesBox(d)}${skillsBox(d)}</div>
    </div>
    <div class="o-extra">${passive}${proficienciesBox(d)}</div>
    <div class="o-main">
      <div class="o-top${person ? '' : ' o-top-solo'}">${vitalsBox(d)}${person}</div>
      ${attacksBox(d)}
    </div>
  </section>`;
}
