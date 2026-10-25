/**
 * Korrektur für Angriffe, die beim Anlegen einen anderen Magie-Bonus kopiert haben,
 * als die Waffe heute in der Bibliothek trägt.
 *
 *   npm run test -- attackMagicFix
 */
import { describe, expect, it } from 'vitest';
import { attackMagicFix, type LegacyLinkLibraries, type LegacyLinkTarget } from '../../src/lib/services/characterLegacyLinks';
import { blankAttack } from '../../src/lib/services/attackCalc';
import { buildItemIndex, type ItemInfo } from '../../src/lib/itemLibrary';
import type { Attack } from '../../src/lib/schemas/characterSchema';

const AXE: ItemInfo = {
  key: 'srd-2024_berserker-battleaxe', name: 'Berserker Battleaxe', name_de: 'Berserker-Streitaxt',
  category: 'weapon', rarity: 'Rare', path: 'weapon/berserker-battleaxe.json', magic: true, magic_bonus: 1,
};
const libs = { items: buildItemIndex({ weapon: [AXE] }) } as unknown as LegacyLinkLibraries;

const axeAttack = (extra: Partial<Attack> = {}): Attack =>
  ({ ...blankAttack(), name: 'Berserker-Streitaxt', sourceKey: AXE.key, magicBonus: 0, ...extra });

/** Nur das Feld, das `attackMagicFix` liest. */
const target = (attacks: Attack[]) => ({ attacks }) as unknown as LegacyLinkTarget;

describe('attackMagicFix', () => {
  it('übernimmt den Bonus der Bibliothek und ist danach erledigt', () => {
    const t = target([axeAttack()]);
    const fix = attackMagicFix(t, libs)!;
    expect(fix.label).toBe('Magie-Bonus aus der Bibliothek übernehmen: Berserker-Streitaxt +1');
    fix.apply();
    expect(t.attacks[0].magicBonus).toBe(1);
    expect(attackMagicFix(t, libs)).toBeUndefined();
  });

  it('lässt manuelle und unverknüpfte Angriffe in Ruhe', () => {
    expect(attackMagicFix(target([axeAttack({ auto: false })]), libs)).toBeUndefined();
    expect(attackMagicFix(target([axeAttack({ sourceKey: undefined })]), libs)).toBeUndefined();
  });

  it('schweigt, wo der Bonus schon stimmt', () => {
    expect(attackMagicFix(target([axeAttack({ magicBonus: 1 })]), libs)).toBeUndefined();
  });
});
