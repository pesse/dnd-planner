/**
 * Antwort des D&D-Beyond-Character-Service (`data`), Struktur original, Inhalte fiktiv:
 * „Prüfling Tintenfass", Gnomen-Magier 2. Talent und Feder stammen aus einem erfundenen Buch.
 */
export const BOOK_SOURCE_ID = 9193;
const mod = (type: string, subType: string, extra: Record<string, unknown> = {}) => ({
  type, subType, value: null, statId: null, componentId: null, entityTypeId: null, friendlySubtypeName: null, ...extra,
});
const spell = (name: string, level: number, componentId: number | null = null) =>
  ({ componentId, prepared: true, alwaysPrepared: false, definition: { name, level } });
const stats = (values: (number | null)[]) => values.map((value, i) => ({ id: i + 1, value }));

export const CLOAK_ID = 3001;

export function ddbGnomeWizardJson(): Record<string, any> {
  return {
    id: 90000002,
    name: 'Prüfling Tintenfass',
    username: 'Testrunde',
    gender: 'männlich', age: 120, height: '95 cm', weight: 44, faith: null, hair: 'weiß', eyes: 'grün', skin: 'rosig',
    alignmentId: 2, currentXp: 0, inspiration: false,
    baseHitPoints: 10, bonusHitPoints: null, overrideHitPoints: null, removedHitPoints: 3,
    stats: stats([8, 14, 13, 15, 12, 10]),
    bonusStats: stats([null, null, null, null, null, null]),
    overrideStats: stats([null, null, null, null, null, null]),
    race: {
      fullName: 'Gnome', sizeId: 3, weightSpeeds: { normal: { walk: 30 } },
      racialTraits: [
        { definition: { id: 101, name: 'Darkvision', requiredLevel: null } },
        { definition: { id: 102, name: 'Gnomish Lineage', requiredLevel: null } },
      ],
    },
    background: { definition: { name: 'Sage' }, customBackground: { name: null } },
    classes: [{
      id: 9001, level: 2,
      definition: { name: 'Wizard', hitDice: 6, canCastSpells: true },
      subclassDefinition: null,
      classFeatures: [
        { definition: { id: 401, name: 'Arcane Recovery', requiredLevel: 1 } },
        { definition: { id: 402, name: 'Scholar', requiredLevel: 2 } },
        { definition: { id: 403, name: 'Wizard Subclass', requiredLevel: 3 } },
      ],
    }],
    feats: [
      { componentId: null, definition: { id: 201, name: 'Magic Initiate (Wizard)' } },
      { componentId: null, definition: { id: 202, name: 'Sage Ability Score Improvements' } },
      {
        componentId: null,
        definition: {
          id: 203, name: 'Inkbound Pact', isHomebrew: false, sources: [{ sourceId: BOOK_SOURCE_ID, pageNumber: 12 }],
          description: '<p>You can sign a pact in ink.</p><ul><li>Once per long rest.</li></ul>',
        },
      },
    ],
    modifiers: {
      race: [
        mod('language', 'common', { friendlySubtypeName: 'Common' }),
        mod('language', 'draconic', { friendlySubtypeName: 'Draconic' }),
      ],
      class: [
        mod('proficiency', 'intelligence-saving-throws'),
        mod('proficiency', 'wisdom-saving-throws'),
        mod('proficiency', 'simple-weapons', { friendlySubtypeName: 'Simple Weapons' }),
        mod('proficiency', 'investigation', { friendlySubtypeName: 'Investigation' }),
        mod('expertise', 'investigation', { friendlySubtypeName: 'Investigation' }),
      ],
      background: [
        mod('proficiency', 'arcana', { friendlySubtypeName: 'Arcana' }),
        mod('proficiency', 'history', { friendlySubtypeName: 'History' }),
        mod('proficiency', 'calligraphers-supplies', { friendlySubtypeName: "Calligrapher's Supplies" }),
        mod('bonus', 'intelligence-score', { value: 2 }),
        mod('bonus', 'constitution-score', { value: 1 }),
      ],
      item: [mod('bonus', 'armor-class', { value: 1, componentId: CLOAK_ID })],
      feat: [],
      condition: [],
    },
    choices: {
      race: [{ componentId: 102, componentTypeId: 1960452172, type: 2, optionValue: 5001, options: [] }],
      class: [], background: [], feat: [],
      choiceDefinitions: [{ id: '1960452172-2', options: [{ id: 5001, label: 'Forest Gnome' }, { id: 5002, label: 'Rock Gnome' }] }],
    },
    inventory: [
      { equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Dagger', weight: 1, bundleSize: 1, filterType: 'Weapon', grantedModifiers: [] } },
      { equipped: false, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Dagger', weight: 1, bundleSize: 1, filterType: 'Weapon', grantedModifiers: [] } },
      { equipped: false, isAttuned: false, quantity: 1, definition: { id: 2, name: 'Lantern, Bullseye', weight: 2, bundleSize: 1, filterType: 'Other Gear' } },
      { equipped: false, isAttuned: false, quantity: 1, definition: { id: 3, name: "Calligrapher's Supplies", weight: 5, bundleSize: 1, filterType: 'Other Gear' } },
      { equipped: false, isAttuned: false, quantity: 10, definition: { id: 4, name: 'Oil', weight: 1, bundleSize: 1, filterType: 'Other Gear' } },
      {
        equipped: true, isAttuned: false, quantity: 1,
        definition: { id: CLOAK_ID, name: 'Cloak of Protection', weight: 1, bundleSize: 1, filterType: 'Wondrous item', canAttune: true },
      },
      {
        equipped: true, isAttuned: false, quantity: 1,
        definition: {
          id: 3002, name: 'Quill of Endless Ink', type: 'Wondrous item', filterType: 'Wondrous item', rarity: 'Uncommon', magic: true,
          weight: 0, bundleSize: 1, cost: null, canAttune: false, sources: [{ sourceId: BOOK_SOURCE_ID }],
          description: '<p>This quill never runs dry.</p>',
        },
      },
    ],
    customItems: [{ name: 'Glitzerstaub', description: 'Funkelt im Dunkeln.', quantity: 1, weight: null }],
    currencies: { cp: 0, sp: 5, ep: 0, gp: 13, pp: 0 },
    traits: {
      personalityTraits: 'Zählt alles zweimal.',
      ideals: 'Ordnung ist das halbe Leben, sagt man in Prüfstadt, und die andere Hälfte besteht aus dem Sortieren von Büchern',
      bonds: 'Ein Regal voller Bücher', flaws: 'Vergisst Namen.', appearance: null,
    },
    notes: {
      allies: 'Die Bibliothek von Prüfstadt', organizations: null, enemies: 'Der Bücherwurm',
      backstory: 'Wuchs zwischen Regalen auf.', personalPossessions: null, otherHoldings: null,
      otherNotes: 'Trägt immer eine Feder hinter dem Ohr.',
    },
    spells: {
      race: [spell('Minor Illusion', 0, 102), spell('Speak with Animals', 1, 102)],
      class: [],
      feat: [spell('Mage Hand', 0, 201), spell('Minor Illusion', 0, 201)],
      item: [],
      background: [],
    },
    classSpells: [{ characterClassId: 9001, spells: [spell('Shield', 1), spell('Zauber der Prüfstadt', 1)] }],
  };
}
