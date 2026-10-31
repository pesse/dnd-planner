/**
 * Herleitungs-Tooltips des Charakterbogens als HTML-Schnipsel. Die Klassen
 * (`tip-row`, `tip-total`, …) stylt `components/character/sheet.css`.
 */
import { sign } from '../utils/num';
import { effectiveProficiencyBonus } from './classProgression';
import { esc } from '../print/character/html';
import { mod } from '../domain/skills';
import type { AbilityResolution } from './effectiveAbilities';
import { abilityStepNotes, type HpDerivation } from './hitPointDerivation';
import type { ArmorClassDerivation } from './armorClass';
import type { AttackParts } from './attackCalc';
import type { SavingThrowDerivation } from './savingThrows';
import { ABILITY_ABBR_DE, type AbilityKey } from '../schemas/abilities';
import type { Character } from '../schemas/characterSchema';
import type { CombatFallbacks } from './combatFallbacks';
import type { SkillCheckEffects } from './abilityChecks';

function row(label: string, val: string | number): string {
  const v = typeof val === 'number' ? sign(val) : val;
  return `<span class="tip-row"><span class="tip-lbl">${label}</span><span class="tip-val">${v}</span></span>`;
}
function divider(): string { return `<span class="tip-div"></span>`; }
function total(val: string | number, label = ''): string {
  const v = typeof val === 'number' ? sign(val) : val;
  return `<span class="tip-row tip-total"><span class="tip-lbl">${label}</span><span class="tip-val">${v}</span></span>`;
}
function step(label: string): string { return `<span class="tip-step">${label}</span>`; }
const steps = (notes: readonly string[]): string => notes.map((n) => step(esc(n))).join('');

/** `storedMod` ist der Mod aus der Datei; weicht er ab, ist sie noch mit dem Grundwert gespeichert. */
export function attrModTip(abbrDe: string, r: AbilityResolution, storedMod?: number): string {
  const m = mod(r.score);
  const items = r.steps.length ? row('Grundwert', String(r.base)) + steps(abilityStepNotes(abbrDe, r)) : '';
  const stale = storedMod !== undefined && storedMod !== m ? steps([`gespeichert ${sign(storedMod)}: im Editor neu speichern`]) : '';
  return items + row(abbrDe, String(r.score)) + step('− 10') + step('÷ 2') + divider() + total(m) + stale;
}

export function hpTip(d: HpDerivation): string {
  const rows = d.rows.map((r, i) =>
    row(esc(r.labelDe), i === 0 && d.diceKnown ? String(r.value) : r.value) + steps(r.notes)).join('');
  const sum = d.total === null ? '' : divider() + total(String(d.total), 'TP-Maximum');
  const off = d.total !== null && d.stored !== null && d.stored !== d.total
    ? row('eingetragen', String(d.stored)) + row('Abweichung', d.stored - d.total)
    : '';
  return rows + sum + off + steps(d.notes);
}

export interface CombatTips {
  initiative: string;
  /** Steht neben dem Wert, nicht nur im Tooltip: auch der Druck zeigt ihn. */
  initiativeAdvantage: boolean;
  speed: string;
  proficiencyBonus: string;
  hpCurrent: string;
}

export const NO_COMBAT_TIPS: CombatTips = { initiative: '', initiativeAdvantage: false, speed: '', proficiencyBonus: '', hpCurrent: '' };

/** Die Herleitung der gerechneten Kampfwerte; eine Abweichung des eingetragenen Werts steht darunter. */
export function combatTips(
  c: { initiative: string; speed: string; hpCurrent: string; hpMax: string; proficiencyBonus?: number | null },
  fb: CombatFallbacks,
): CombatTips {
  const speed = c.speed.trim();
  const pb = c.proficiencyBonus;
  const initiative = c.initiative.trim();
  const hpMax = c.hpMax.trim() || (fb.hpMax === null ? '' : String(fb.hpMax));
  return {
    initiative: fb.initiativeRows.map((r) => row(esc(r.labelDe), r.value)).join('') + divider() + total(fb.initiative, 'Initiative')
      + steps(fb.initiativeAdvantage.map((l) => `Vorteil (${l})`))
      + (initiative && initiative !== fb.initiative ? steps([`eingetragen ${esc(initiative)}`]) : ''),
    initiativeAdvantage: fb.initiativeAdvantage.length > 0,
    speed: fb.speedRows.length
      ? fb.speedRows.map((r, i) => row(esc(r.labelDe), i === 0 ? `${r.feet} Fuß` : `${sign(r.feet)} Fuß`)).join('')
        + divider() + total(`${fb.speed} m`, 'Bewegung')
        + (speed && speed !== fb.speed ? steps([`eingetragen ${esc(speed)} m`]) : '')
      : '',
    proficiencyBonus: fb.proficiencyBonusRows.map((r, i) => row(esc(r.labelDe), i === 0 ? sign(r.value) : r.value)).join('')
      + divider() + total(sign(fb.proficiencyBonus), 'Übungsbonus')
      + (pb != null && pb !== fb.proficiencyBonus ? steps([`eingetragen ${sign(pb)}`]) : ''),
    hpCurrent: c.hpCurrent.trim() || !hpMax
      ? ''
      : row('TP-Maximum', esc(hpMax)) + steps(['keine aktuellen TP eingetragen']),
  };
}

export function acTip(d: ArmorClassDerivation): string {
  const rows = d.rows.map((r, i) => row(esc(r.labelDe), i === 0 ? String(r.value) : r.value) + steps(r.notes)).join('');
  const off = d.stored !== null && d.stored !== d.total ? row(`eingetragen ${d.stored} · Abweichung`, d.stored - d.total) : '';
  return rows + divider() + total(String(d.total), 'RK') + off + steps(d.notes);
}

export function saveTip(d: SavingThrowDerivation): string {
  return d.rows.map((r) => row(esc(r.labelDe), r.value)).join('') + divider() + total(d.total) + steps(d.notes);
}

export function skillTip(
  character: Character,
  attr: AbilityKey | undefined,
  skill: { value: number; prof: boolean; exp: boolean },
  fx: SkillCheckEffects = { rows: [], notes: [], advantage: false },
): string {
  if (!attr) return '';
  const attrLabel = ABILITY_ABBR_DE[attr];
  const attrMod = character.mods[attr];
  const pb = effectiveProficiencyBonus(character);
  const head = row(`${attrLabel}-Mod`, attrMod);
  const declared = fx.rows.map((r) => row(esc(r.labelDe), r.value)).join('');
  const tail = steps(fx.notes);
  if (skill.exp) return head + row('2× Übungsbonus', pb * 2) + declared + divider() + total(skill.value) + tail;
  if (skill.prof) return head + row('Übungsbonus', pb) + declared + divider() + total(skill.value) + tail;
  if (character.alleskoenner) return head + row('½ Übungsbonus', Math.floor(pb / 2)) + declared + divider() + total(skill.value) + tail;
  return head + declared + divider() + total(attrMod + fx.rows.reduce((n, r) => n + r.value, 0)) + tail;
}

export function attackBonusTip(bonus: string): string {
  return row('Angriffswurf', '1W20 + ' + bonus) + row('gegen', 'RK des Ziels');
}

export function attackDamageTip(damage: string, type: string): string {
  return row('Schaden', damage) + (type ? row('Typ', type) : '');
}

const partRows = (p: AttackParts): string => p.parts.map((x) => row(esc(x.labelDe), x.value)).join('');

/** Herleitung eines auto-berechneten Angriffs; `attackBonusTip` bleibt für handeingetragene. */
export function attackBonusPartsTip(p: AttackParts, bonus: string): string {
  // Zauberzeilen tragen „SG 15 WEI“ oder „trifft“ — dort gibt es keinen Angriffswurf.
  if (!/^[+-]\d/.test(bonus)) return (p.parts.length ? partRows(p) + divider() : '') + total(esc(bonus)) + steps(p.notes);
  return partRows(p) + divider() + total(bonus, 'Angriff') + row('Angriffswurf', '1W20 ' + bonus) + steps(p.notes);
}

export function attackDamagePartsTip(p: AttackParts, dice: string, damage: string, type: string): string {
  return row('Würfel', esc(dice)) + partRows(p) + divider() + total(esc(damage), 'Schaden')
    + (type ? row('Typ', esc(type)) : '') + steps(p.notes);
}
