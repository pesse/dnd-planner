import type { GroupedSpell } from '$lib/services/spellcasting/grouped';

/** Ein Zauber der Bogen-Sicht ohne Konzentration, Wirkzeit-Art und Komponenten. */
export const groupedSpell = (
  spell: Pick<GroupedSpell, 'key' | 'label' | 'level'> & Partial<GroupedSpell>,
): GroupedSpell => ({
  ritual: false, concentration: false, castTime: '', components: '', costlyMaterial: false, school: '', ...spell,
});
