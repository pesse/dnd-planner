/**
 * Anzeige-Vokabular des Gegenstands-Bereichs: deutsche Labels, englische Schlüssel.
 * Kategorie-Schlüssel = Ordnername = Open5e-v2 `category.key` — ein Identity-Mapping.
 */
import { WEAPON_MASTERIES, type DamageType, type WeaponMastery } from './schemas/vocabulary';

export const CATEGORY_COLORS: Record<string, string> = {
  'weapon':             'var(--danger)',
  'armor':              'var(--red)',
  'shield':             'var(--red-bright)',
  'ammunition':         'var(--teal)',
  'adventuring-gear':   'var(--magenta)',
  'equipment-pack':     'var(--magenta)',
  'tools':              'var(--steel)',
  'spellcasting-focus': 'var(--arcane)',
  'mount':              'var(--red-bright)',
  'land-vehicle':       'var(--copper)',
  'waterborne-vehicle': 'var(--steel)',
  'wondrous-item':      'var(--arcane)',
  'ring':               'var(--gold)',
  'rod':                'var(--copper)',
  'staff':              'var(--danger)',
  'wand':               'var(--magenta)',
  'scroll':             'var(--steel)',
  'potion':             'var(--green)',
  'poison':             'var(--green)',
  'gem':                'var(--arcane)',
  'jewelry':            'var(--gold)',
  'art':                'var(--copper)',
  'trade-good':         'var(--steel)',
  'service':            'var(--ink-muted)',
  'other':              'var(--ink-muted)',
};

/** Fängt unangetasteten Homebrew aus der dnd5eapi-Zeit ab. */
const LEGACY_DIR_ALIASES: Record<string, string> = {
  'wondrous-items': 'wondrous-item',
  'mounts-and-vehicles': 'mount',
  'shields': 'shield',
};

export const DIR_TO_CATEGORY: Record<string, string> = {
  ...Object.fromEntries(Object.keys(CATEGORY_COLORS).map((k) => [k, k])),
  ...LEGACY_DIR_ALIASES,
};

export const CATEGORY_TO_DIR: Record<string, string> = Object.fromEntries(
  Object.keys(CATEGORY_COLORS).map((k) => [k, k]),
);

export const CATEGORY_LABELS: Record<string, string> = {
  'weapon':             'Waffe',
  'armor':              'Rüstung',
  'shield':             'Schild',
  'ammunition':         'Munition',
  'adventuring-gear':   'Ausrüstung',
  'equipment-pack':     'Ausrüstungspaket',
  'tools':              'Werkzeug',
  'spellcasting-focus': 'Zauberfokus',
  'mount':              'Reittier',
  'land-vehicle':       'Landfahrzeug',
  'waterborne-vehicle': 'Wasserfahrzeug',
  'wondrous-item':      'Wundersamer Gegenstand',
  'ring':               'Ring',
  'rod':                'Rute',
  'staff':              'Stab',
  'wand':               'Zauberstab',
  'scroll':             'Schriftrolle',
  'potion':             'Trank',
  'poison':             'Gift',
  'gem':                'Edelstein',
  'jewelry':            'Schmuck',
  'art':                'Kunstgegenstand',
  'trade-good':         'Handelsware',
  'service':            'Dienstleistung',
  'other':              'Sonstiges',
};

export const RARITY_LABELS: Record<string, string> = {
  Common:      'Gewöhnlich',
  Uncommon:    'Ungewöhnlich',
  Rare:        'Selten',
  'Very Rare': 'Sehr selten',
  Legendary:   'Legendär',
  Artifact:    'Artefakt',
};

export const RARITY_COLORS: Record<string, string> = {
  Common:      'var(--ink-muted)', // neutral
  Uncommon:    'var(--green)',
  Rare:        'var(--steel)',     // blau
  'Very Rare': 'var(--arcane)',    // violett
  Legendary:   'var(--copper)',    // orange
  Artifact:    'var(--danger)',    // rot
};

export function rarityColor(rarity?: string | { name?: string } | null): string {
  const name = typeof rarity === 'string' ? rarity : rarity?.name;
  return (name && RARITY_COLORS[name]) || RARITY_COLORS.Common;
}

/** `DamageType` ist total abgedeckt; der String-Index bleibt für Fremdwerte der API offen. */
export const DAMAGE_TYPE_LABELS: Record<DamageType, string> & Record<string, string> = {
  slashing:    'Hiebschaden',
  piercing:    'Stichschaden',
  bludgeoning: 'Wuchtschaden',
  fire:        'Feuerschaden',
  cold:        'Kälteschaden',
  lightning:   'Blitzschaden',
  thunder:     'Schallschaden',
  acid:        'Säureschaden',
  poison:      'Giftschaden',
  necrotic:    'Nekrotischer Schaden',
  radiant:     'Gleißender Schaden',
  force:       'Energieschaden',
  psychic:     'Psychischer Schaden',
};

export const WEAPON_CATEGORY_LABELS: Record<string, string> = {
  Martial: 'Kriegswaffe',
  Simple:  'Einfache Waffe',
  Exotic:  'Exotische Waffe',
};

export const WEAPON_RANGE_LABELS: Record<string, string> = {
  Melee:  'Nahkampf',
  Ranged: 'Fernkampf',
};

export const ARMOR_CATEGORY_LABELS: Record<string, string> = {
  Light:  'Leichte Rüstung',
  Medium: 'Mittlere Rüstung',
  Heavy:  'Schwere Rüstung',
  Shield: 'Schild',
};

export const PROPERTY_LABELS: Record<string, string> = {
  versatile:   'Vielseitig',
  finesse:     'Finesse',
  light:       'Leicht',
  heavy:       'Schwer',
  'two-handed':'Zweihändig',
  thrown:      'Wurfwaffe',
  reach:       'Reichweite',
  loading:     'Laden',
  ammunition:  'Munition',
  special:     'Besonders',
  monk:        'Mönchswaffe',
};

export const PROPERTY_INDEX_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(PROPERTY_LABELS).map(([index, label]) => [label.toLowerCase(), index])
);

/**
 * Die Texte sind EINMALIG abgeschrieben (SRD 5.2 / `rules-chunks.json`, beide CC-BY-4.0):
 * `rules-chunks.json` bleibt reines KI-Material und wird zur Laufzeit NICHT gelesen.
 * `Record<WeaponMastery, …>` macht Vollständigkeit zum Compilerfehler.
 */
export const MASTERY_INFO: Record<WeaponMastery, { nameDe: string; desc: string; descDe: string }> = {
  Sap: {
    nameDe: 'Auslaugen',
    desc: 'If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn.',
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst, ist diese Kreatur bei ihrem nächsten Angriffswurf vor Beginn deines nächsten Zugs im Nachteil.',
  },
  Nick: {
    nameDe: 'Einkerben',
    desc: 'When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn.',
    descDe: 'Wenn du den zusätzlichen Angriff der Eigenschaft Leicht ausführst, kannst du dies als Teil der Angriffsaktion statt als Bonusaktion tun. Du kannst diesen zusätzlichen Angriff nur einmal pro Zug ausführen.',
  },
  Vex: {
    nameDe: 'Plagen',
    desc: 'If you hit a creature with this weapon and deal damage to the creature, you have Advantage on your next attack roll against that creature before the end of your next turn.',
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst und ihr Schaden zufügst, bist du beim nächsten Angriffswurf gegen diese Kreatur vor Ende deines nächsten Zugs im Vorteil.',
  },
  Cleave: {
    nameDe: 'Spalten',
    desc: "If you hit a creature with a melee attack roll using this weapon, you can make a melee attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon's damage, but don't add your ability modifier to that damage unless that modifier is negative. You can make this extra attack only once per turn.",
    descDe: 'Wenn du eine Kreatur mit einem Nahkampfangriffswurf triffst, den du mit dieser Waffe ausführst, kannst du mit der Waffe einen weiteren Nahkampfangriff auf eine zweite Kreatur im Abstand von bis zu 1,5 Metern von der ersten ausführen, sofern die zweite sich ebenfalls in Reichweite befindet. Bei einem Treffer erleidet die Kreatur den Waffenschaden. Du fügst dem Schaden jedoch nicht deinen Attributsmodifikator hinzu, sofern dieser Modifikator nicht negativ ist. Du kannst diesen zusätzlichen Angriff nur einmal pro Zug ausführen.',
  },
  Push: {
    nameDe: 'Stoßen',
    desc: 'If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from yourself if it is Large or smaller.',
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst, kannst du sie bis zu drei Meter weit in gerader Linie von dir wegstoßen, sofern sie von höchstens großer Größe ist.',
  },
  Graze: {
    nameDe: 'Streifen',
    desc: 'If your attack roll with this weapon misses a creature, you can deal damage to that creature equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and the damage can be increased only by increasing the ability modifier.',
    descDe: 'Wenn dein Angriffswurf mit dieser Waffe eine Kreatur verfehlt, kannst du der Kreatur Schaden in Höhe des Attributsmodifikators zufügen, den du für den Angriffswurf verwendet hast. Die Schadensart entspricht der Waffe. Der Schaden kann nur durch Erhöhen des Attributsmodifikators erhöht werden.',
  },
  Topple: {
    nameDe: 'Umstoßen',
    desc: 'If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 plus the ability modifier used to make the attack roll and your Proficiency Bonus). On a failed save, the creature has the Prone condition.',
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst, kannst du sie zu einem Konstitutionsrettungswurf (SG 8 plus Attributsmodifikator für den Angriffswurf plus dein Übungsbonus) zwingen. Misslingt der Wurf, so wird die Kreatur umgestoßen und hat den Zustand Liegend.',
  },
  Slow: {
    nameDe: 'Verlangsamen',
    desc: "If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. If the creature is hit more than once by weapons that have this property, the Speed reduction doesn't exceed 10 feet.",
    descDe: 'Wenn du eine Kreatur mit dieser Waffe triffst und ihr Schaden zufügst, kannst du ihre Bewegungsrate bis zum Beginn deines nächsten Zugs um drei Meter verringern. Wird die Kreatur mehrfach von Waffen mit dieser Eigenschaft getroffen, so wird ihre Bewegungsrate dennoch nur um drei Meter verringert.',
  },
};

export const MASTERY_LABELS: Record<WeaponMastery, string> = Object.fromEntries(
  WEAPON_MASTERIES.map((m) => [m, MASTERY_INFO[m].nameDe]),
) as Record<WeaponMastery, string>;

/** Rückrichtung für den PDF-Import. */
export const MASTERY_BY_LABEL: Record<string, WeaponMastery> = Object.fromEntries(
  WEAPON_MASTERIES.map((m) => [MASTERY_INFO[m].nameDe.toLowerCase(), m]),
);

/** Unbekannte Werte (Fremdimport) unverändert durchreichen. */
export function masteryLabel(mastery: string | undefined | null): string {
  return mastery ? (MASTERY_LABELS[mastery as WeaponMastery] ?? mastery) : '';
}

export function masteryRuleDe(mastery: string | undefined | null): string {
  return mastery ? (MASTERY_INFO[mastery as WeaponMastery]?.descDe ?? '') : '';
}

export const COST_UNIT_LABELS: Record<string, string> = {
  gp: 'GM',
  sp: 'SM',
  cp: 'KM',
  ep: 'EM',
  pp: 'PM',
};

/** Open5e liefert die Ziel-Keys bereits; der Rest ist Back-Compat für Legacy/Homebrew. */
export const API_CATEGORY_MAP: Record<string, string> = {
  ...Object.fromEntries(Object.keys(CATEGORY_COLORS).map((k) => [k, k])),
  // Back-Compat (dnd5eapi/2014 & Homebrew)
  'wondrous-items':      'wondrous-item',
  'wundersam':           'wondrous-item',
  'mounts-and-vehicles': 'mount',
  'shields':             'shield',
};
