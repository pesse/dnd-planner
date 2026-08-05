/**
 * Charakterdateien im Zustand VOR dem Zauberquellen-Umbau: flacher `spells`-Block, alte
 * `_version`. Gekürzt auf die Felder, an denen die Auflösung der Quellen hängt.
 */

/** Neun Grade, unverbraucht — so steht der Block in jeder Altdatei. */
const slots = (...totals: number[]) =>
  Array.from({ length: 9 }, (_, i) => ({ total: totals[i] ?? 0, used: 0 }));

export const LEGACY_CHARACTERS: Record<string, Record<string, unknown>> = {
  thromm: {
    name: 'Thromm Flechtenstein',
    _version: 4,
    classLevel: 'Druide 3 (Zirkel des Mondes)',
    race: 'Zwerg',
    background: 'Einsiedler',
    proficiencyBonus: 2,
    strMod: 1,
    gesMod: 0,
    konMod: 2,
    intMod: -1,
    weiMod: 3,
    chaMod: 1,
    classes: [
      {
        sourceKey: 'srd-2024_druid',
        name: 'Druide',
        subclassKey: 'phb-2024_circle-of-the-moon',
        subclassName: 'Zirkel des Mondes',
        level: 3
      }
    ],
    species: {
      sourceKey: 'srd-2024_dwarf',
      name: 'Zwerg'
    },
    backgroundRef: {
      sourceKey: 'phb-2024_hermit',
      name: 'Einsiedler'
    },
    features: [
      {
        sourceKey: 'srd-2024_druid_primal-order',
        name: '',
        choice: 'Wächter',
        gainedAt: 1
      }
    ],
    spells: {
      spellcastingClass: 'Druide',
      spellcastingAbility: 'CHA',
      saveDC: 13,
      attackBonus: 5,
      autoCalc: false,
      slots: slots(4, 2),
      cantrips: [
        'Donnerschlag',
        'Druidenkunst',
        'Sternenlichtfunke'
      ],
      byLevel: {
        '1': [
          {
            name: 'Tierfreundschaft',
            prepared: false
          },
          {
            name: 'Erdrütteln',
            prepared: false
          },
          {
            name: 'Verstricken',
            prepared: false
          },
          {
            name: 'Vertrauten finden',
            prepared: false
          },
          {
            name: 'Springen',
            prepared: false
          },
          {
            name: 'Mit Tieren sprechen',
            prepared: true
          },
          {
            name: 'Wunden heilen',
            prepared: true
          }
        ],
        '2': [
          {
            name: 'Mondstrahl',
            prepared: true
          }
        ]
      }
    }
  },
  silvara: {
    name: 'Silvara/Sivral',
    _version: 6,
    classLevel: 'Zauberer 3 (Wildmagie-Zauberei)',
    race: 'Fee',
    background: 'Unterhaltungskünstler',
    proficiencyBonus: 2,
    strMod: -1,
    gesMod: 1,
    konMod: 1,
    intMod: 2,
    weiMod: 1,
    chaMod: 3,
    classes: [
      {
        sourceKey: 'srd-2024_sorcerer',
        name: 'Zauberer',
        subclassKey: 'phb-2024_wild-magic-sorcery',
        subclassName: 'Wildmagie-Zauberei',
        level: 3
      }
    ],
    species: {
      sourceKey: 'phb-2024_fairy',
      name: 'Fee'
    },
    backgroundRef: {
      sourceKey: 'phb-2024_entertainer',
      name: 'Unterhaltungskünstler'
    },
    features: [
      {
        sourceKey: 'phb-2024_fairy_size',
        name: '',
        choice: 'Klein',
        choiceDe: 'Klein'
      },
      {
        sourceKey: 'phb-2024_fairy_fairy-magic',
        name: '',
        choice: 'Charisma',
        choiceDe: 'Charisma'
      }
    ],
    spells: {
      spellcastingClass: 'Zauberer',
      spellcastingAbility: 'CHA',
      saveDC: 13,
      attackBonus: 5,
      autoCalc: false,
      slots: slots(4, 2),
      cantrips: [
        {
          name: 'Freundschaft',
          sourceKey: 'phb-2024_friends'
        },
        {
          name: 'Einfache Illusion',
          sourceKey: 'srd-2024_minor-illusion'
        },
        {
          name: 'Kältestrahl',
          sourceKey: 'srd-2024_ray-of-frost'
        },
        {
          name: 'Taschenspielerei',
          sourceKey: 'srd-2024_prestidigitation'
        },
        {
          name: 'Druidenkunst',
          sourceKey: 'srd-2024_druidcraft'
        }
      ],
      byLevel: {
        '1': [
          {
            name: 'Magisches Geschoss',
            sourceKey: 'srd-2024_magic-missile',
            prepared: false
          },
          {
            name: 'Schild',
            sourceKey: 'srd-2024_shield',
            prepared: false
          },
          {
            name: 'Selbstverkleidung',
            sourceKey: 'srd-2024_disguise-self',
            prepared: false
          },
          {
            name: 'Feenfeuer',
            sourceKey: 'srd-2024_faerie-fire',
            prepared: false
          }
        ],
        '2': [
          {
            name: 'Spiegelbilder',
            sourceKey: 'srd-2024_mirror-image',
            prepared: false
          }
        ]
      }
    }
  },
  phoenix: {
    name: 'Phönix',
    _version: 1,
    classLevel: '',
    race: '',
    background: '',
    proficiencyBonus: 2,
    strMod: 0,
    gesMod: 0,
    konMod: 0,
    intMod: 0,
    weiMod: 0,
    chaMod: 0,
    spells: {
      spellcastingClass: 'Magier',
      spellcastingAbility: '',
      saveDC: 0,
      attackBonus: 0,
      slots: slots(2),
      cantrips: [
        'Taschenspielerei',
        'Kältestrahl',
        'Klingenbann',
        'Einfache Illusion'
      ],
      byLevel: {
        '1': [
          {
            name: 'Brennende Hände',
            prepared: false
          },
          {
            name: 'Magisches Geschoss',
            prepared: false
          },
          {
            name: 'Schild',
            prepared: false
          },
          {
            name: 'Schlaf',
            prepared: false
          },
          {
            name: 'Federfall',
            prepared: false
          },
          {
            name: 'Chromatische Kugel',
            prepared: false
          }
        ]
      }
    }
  },
  carric: {
    name: 'Carric Galanodel',
    _version: 2,
    classLevel: 'Schurke 2 / Mönch 1',
    race: 'Waldelf',
    background: 'Krimineller',
    proficiencyBonus: 2,
    strMod: 0,
    gesMod: 3,
    konMod: 1,
    intMod: -1,
    weiMod: 1,
    chaMod: 2,
    classes: [
      {
        sourceKey: 'srd-2024_rogue',
        name: 'Schurke',
        level: 2
      },
      {
        sourceKey: 'srd-2024_monk',
        name: 'Mönch',
        level: 1
      }
    ],
    spells: {
      spellcastingClass: '',
      spellcastingAbility: '',
      saveDC: 0,
      attackBonus: 0,
      autoCalc: false,
      slots: slots(0, 0, 2),
      cantrips: [
        'Kältestrahl'
      ],
      byLevel: {
        '3': [
          {
            name: 'Feuerball',
            prepared: false
          }
        ]
      }
    }
  },
};
