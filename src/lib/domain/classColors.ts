import { keySlug } from '$lib/utils/text';

/** Kennfarbe je Grundklasse, dunkel genug für weiße Ziffern auf dem Würfel. */
const CLASS_COLORS: Record<string, string> = {
  barbarian: '#b8452a',
  bard: '#9a4f8f',
  cleric: '#6e7f93',
  druid: '#5f7a2e',
  fighter: '#7a4a32',
  monk: '#2f7f9e',
  paladin: '#a8862c',
  ranger: '#3f6e4f',
  rogue: '#4a4c48',
  sorcerer: '#8f2a2a',
  warlock: '#5e2f86',
  wizard: '#2d4f9a',
};

export const classColor = (classKey: string | undefined): string | undefined => CLASS_COLORS[keySlug(classKey)];
