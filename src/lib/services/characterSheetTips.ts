/**
 * Herleitungs-Tooltips des Charakterbogens als HTML-Schnipsel. Die Klassen
 * (`tip-row`, `tip-total`, …) stylt `components/character/sheet.css`.
 */
import { sign } from '../utils/num';
import type { Character } from '../schemas/characterSchema';

const ATTR_ABBR: Record<string, string> = { str: 'STR', ges: 'GES', kon: 'KON', int: 'INT', wei: 'WEI', cha: 'CHA' };

function row(label: string, val: string | number): string {
  const v = typeof val === 'number' ? sign(val) : val;
  return `<span class="tip-row"><span class="tip-lbl">${label}</span><span class="tip-val">${v}</span></span>`;
}
function divider(): string { return `<span class="tip-div"></span>`; }
function total(val: string | number): string {
  const v = typeof val === 'number' ? sign(val) : val;
  return `<span class="tip-row tip-total"><span class="tip-lbl"></span><span class="tip-val">${v}</span></span>`;
}
function step(label: string): string { return `<span class="tip-step">${label}</span>`; }

export function attrModTip(attr: string, score: number): string {
  const m = Math.floor((score - 10) / 2);
  return row(attr, String(score)) + step('− 10') + step('÷ 2') + divider() + total(m);
}

export function saveTip(character: Character, modKey: string, attrLabel: string, proficient: boolean): string {
  const attrMod = (character as unknown as Record<string, number>)[modKey];
  const pb = character.proficiencyBonus;
  if (proficient) return row(`${attrLabel}-Mod`, attrMod) + row('Übungsbonus', pb) + divider() + total(attrMod + pb);
  return row(`${attrLabel}-Mod`, attrMod) + divider() + total(attrMod);
}

export function skillTip(
  character: Character,
  attr: string | undefined,
  skill: { value: number; prof: boolean; exp: boolean },
): string {
  if (!attr) return '';
  const attrLabel = ATTR_ABBR[attr] ?? attr.toUpperCase();
  const attrMod = (character as unknown as Record<string, number>)[`${attr}Mod`];
  const pb = character.proficiencyBonus;
  if (skill.exp) return row(`${attrLabel}-Mod`, attrMod) + row('2× Übungsbonus', pb * 2) + divider() + total(skill.value);
  if (skill.prof) return row(`${attrLabel}-Mod`, attrMod) + row('Übungsbonus', pb) + divider() + total(skill.value);
  if (character.alleskoenner) return row(`${attrLabel}-Mod`, attrMod) + row('½ Übungsbonus', Math.floor(pb / 2)) + divider() + total(skill.value);
  return row(`${attrLabel}-Mod`, attrMod) + divider() + total(attrMod);
}

export function attackBonusTip(bonus: string): string {
  return row('Angriffswurf', '1W20 + ' + bonus) + row('gegen', 'RK des Ziels');
}

export function attackDamageTip(damage: string, type: string): string {
  return row('Schaden', damage) + (type ? row('Typ', type) : '');
}
