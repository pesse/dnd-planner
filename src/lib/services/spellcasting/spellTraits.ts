/**
 * Was am Tisch an einem Zauber zählt und im Index nur als Wortlaut steht: Wirkzeit-Art und ob
 * die Materialkomponente einen Preis nennt oder verbraucht wird.
 */
import type { SpellInfo } from '$lib/spellLibrary';

/** Aktion und alles Längere bleibt leer — das ist der Normalfall. */
export type CastTime = 'bonus' | 'reaction' | '';

export function castTimeOf(text = ''): CastTime {
  const t = text.trim().replace(/^1\s+/, '');
  if (/^(Bonusaktion|Bonus Action)/i.test(t)) return 'bonus';
  if (/^(Reaktion|Reaction)/i.test(t)) return 'reaction';
  return '';
}

const COSTLY = /im Wert von|verbraucht|\bworth\b|\bconsume/i;

export const costlyMaterial = (info: Pick<SpellInfo, 'components' | 'materials'>): boolean =>
  !!info.components?.includes('M') && COSTLY.test(info.materials ?? '');
