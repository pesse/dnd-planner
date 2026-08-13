/**
 * Zwei eingecheckte Antworten von `GET /v2/creatures/?document__key=srd-2024` — die Vorlage,
 * an der `mapOpen5eCreature` ohne Netzzugriff geprüft wird.
 *
 * Warum diese zwei: die Katze ist der Minimalfall (HG 0, ein Angriff, keine Rettungswürfe),
 * der uralte rote Drache der Maximalfall — legendäre Aktionen, `usage_limits`
 * („Aufladung 5–6"), Zusatzschaden, Immunität, Sinne und ein zweisprachiger Sprachsatz.
 * Unverändert übernommen: eine geglättete Kopie würde genau die Kanten wegnehmen,
 * um die es hier geht.
 */

export const OPEN5E_CAT: Record<string, unknown> =
  {
    "key": "srd-2024_cat",
    "name": "Cat",
    "document": {
      "name": "System Reference Document 5.2",
      "key": "srd-2024",
      "type": "SOURCE",
      "display_name": "5e 2024 Rules",
      "publisher": {
        "name": "Wizards of the Coast",
        "key": "wizards-of-the-coast"
      },
      "gamesystem": {
        "name": "5th Edition 2024",
        "key": "5e-2024"
      },
      "permalink": "https://dnd.wizards.com/resources/systems-reference-document"
    },
    "type": {
      "name": "Beast",
      "key": "beast"
    },
    "size": {
      "name": "Small",
      "key": "small"
    },
    "challenge_rating": 0.0,
    "proficiency_bonus": null,
    "speed": {
      "walk": 40,
      "unit": "feet",
      "climb": 40
    },
    "speed_all": {
      "unit": "feet",
      "walk": 40,
      "crawl": 20,
      "hover": false,
      "fly": 0,
      "burrow": 0,
      "climb": 40,
      "swim": 20
    },
    "category": "Animals",
    "subcategory": null,
    "alignment": "unaligned",
    "languages": {
      "as_string": "",
      "data": []
    },
    "armor_class": 12,
    "armor_detail": "natural armor",
    "hit_points": 2,
    "hit_dice": "1d4",
    "experience_points": 0,
    "ability_scores": {
      "strength": 3,
      "dexterity": 15,
      "constitution": 10,
      "intelligence": 3,
      "wisdom": 12,
      "charisma": 7
    },
    "modifiers": {
      "strength": -4,
      "dexterity": 2,
      "constitution": 0,
      "intelligence": -4,
      "wisdom": 1,
      "charisma": -2
    },
    "initiative_bonus": 2,
    "saving_throws": {
      "strength": -4,
      "dexterity": 4,
      "constitution": 0,
      "intelligence": -4,
      "wisdom": 1,
      "charisma": -2
    },
    "saving_throws_all": {
      "strength": -4,
      "dexterity": 4,
      "constitution": 0,
      "intelligence": -4,
      "wisdom": 1,
      "charisma": -2
    },
    "skill_bonuses": {
      "perception": 3,
      "stealth": 4
    },
    "skill_bonuses_all": {
      "acrobatics": 2,
      "animal_handling": 1,
      "arcana": -4,
      "athletics": -4,
      "deception": -2,
      "history": -4,
      "insight": 1,
      "intimidation": -2,
      "investigation": -4,
      "medicine": 1,
      "nature": -4,
      "perception": 3,
      "performance": -2,
      "persuasion": -2,
      "religion": -4,
      "sleight_of_hand": 2,
      "stealth": 4,
      "survival": 1
    },
    "passive_perception": 13,
    "resistances_and_immunities": {
      "damage_immunities_display": "",
      "damage_immunities": [],
      "damage_resistances_display": "",
      "damage_resistances": [],
      "damage_vulnerabilities_display": "",
      "damage_vulnerabilities": [],
      "condition_immunities_display": "",
      "condition_immunities": []
    },
    "normal_sight_range": 10560,
    "darkvision_range": 60,
    "blindsight_range": null,
    "tremorsense_range": null,
    "truesight_range": null,
    "actions": [
      {
        "name": "Scratch",
        "desc": "Melee Attack Roll: +4, reach 5 ft. 1 Slashing damage.",
        "attacks": [],
        "action_type": "ACTION",
        "order_in_statblock": 0,
        "legendary_action_cost": 1,
        "limited_to_form": null,
        "usage_limits": null
      }
    ],
    "traits": [
      {
        "name": "Jumper",
        "desc": "The cat's jump distance is determined using its Dexterity rather than its Strength."
      }
    ],
    "creaturesets": [],
    "environments": [],
    "illustration": null,
    "crossreferences": {
      "to": []
    }
  };

export const OPEN5E_ANCIENT_RED_DRAGON: Record<string, unknown> =
  {
    "key": "srd-2024_ancient-red-dragon",
    "name": "Ancient Red Dragon",
    "document": {
      "name": "System Reference Document 5.2",
      "key": "srd-2024",
      "type": "SOURCE",
      "display_name": "5e 2024 Rules",
      "publisher": {
        "name": "Wizards of the Coast",
        "key": "wizards-of-the-coast"
      },
      "gamesystem": {
        "name": "5th Edition 2024",
        "key": "5e-2024"
      },
      "permalink": "https://dnd.wizards.com/resources/systems-reference-document"
    },
    "type": {
      "name": "Dragon",
      "key": "dragon"
    },
    "size": {
      "name": "Gargantuan",
      "key": "gargantuan"
    },
    "challenge_rating": 24.0,
    "proficiency_bonus": null,
    "speed": {
      "walk": 40,
      "unit": "feet",
      "fly": 80,
      "climb": 40
    },
    "speed_all": {
      "unit": "feet",
      "walk": 40,
      "crawl": 20,
      "hover": false,
      "fly": 80,
      "burrow": 0,
      "climb": 40,
      "swim": 20
    },
    "category": "Monsters",
    "subcategory": null,
    "alignment": "chaotic evil",
    "languages": {
      "as_string": "Common, Draconic",
      "data": [
        {
          "name": "Common",
          "key": "common",
          "desc": "Typical speakers are Humans."
        },
        {
          "name": "Draconic",
          "key": "draconic",
          "desc": "Typical speakers include dragons and dragonborn."
        }
      ]
    },
    "armor_class": 22,
    "armor_detail": "natural armor",
    "hit_points": 507,
    "hit_dice": "26d20 + 234",
    "experience_points": 62000,
    "ability_scores": {
      "strength": 30,
      "dexterity": 10,
      "constitution": 29,
      "intelligence": 18,
      "wisdom": 15,
      "charisma": 27
    },
    "modifiers": {
      "strength": 10,
      "dexterity": 0,
      "constitution": 9,
      "intelligence": 4,
      "wisdom": 2,
      "charisma": 8
    },
    "initiative_bonus": 14,
    "saving_throws": {
      "strength": 10,
      "dexterity": 7,
      "constitution": 9,
      "intelligence": 4,
      "wisdom": 9,
      "charisma": 8
    },
    "saving_throws_all": {
      "strength": 10,
      "dexterity": 7,
      "constitution": 9,
      "intelligence": 4,
      "wisdom": 9,
      "charisma": 8
    },
    "skill_bonuses": {
      "perception": 16,
      "stealth": 7
    },
    "skill_bonuses_all": {
      "acrobatics": 0,
      "animal_handling": 2,
      "arcana": 4,
      "athletics": 10,
      "deception": 8,
      "history": 4,
      "insight": 2,
      "intimidation": 8,
      "investigation": 4,
      "medicine": 2,
      "nature": 4,
      "perception": 16,
      "performance": 8,
      "persuasion": 8,
      "religion": 4,
      "sleight_of_hand": 0,
      "stealth": 7,
      "survival": 2
    },
    "passive_perception": 26,
    "resistances_and_immunities": {
      "damage_immunities_display": "fire",
      "damage_immunities": [
        {
          "name": "Fire",
          "key": "fire"
        }
      ],
      "damage_resistances_display": "",
      "damage_resistances": [],
      "damage_vulnerabilities_display": "",
      "damage_vulnerabilities": [],
      "condition_immunities_display": "",
      "condition_immunities": []
    },
    "normal_sight_range": 10560,
    "darkvision_range": 120,
    "blindsight_range": 60,
    "tremorsense_range": null,
    "truesight_range": null,
    "actions": [
      {
        "name": "Commanding Presence",
        "desc": "The dragon uses Spellcasting to cast Command (level 2 version). The dragon can't take this action again until the start of its next turn.",
        "attacks": [],
        "action_type": "LEGENDARY_ACTION",
        "order_in_statblock": 0,
        "legendary_action_cost": 1,
        "limited_to_form": null,
        "usage_limits": null
      },
      {
        "name": "Fiery Rays",
        "desc": "The dragon uses Spellcasting to cast Scorching Ray (level 3 version). The dragon can't take this action again until the start of its next turn.",
        "attacks": [],
        "action_type": "LEGENDARY_ACTION",
        "order_in_statblock": 1,
        "legendary_action_cost": 1,
        "limited_to_form": null,
        "usage_limits": null
      },
      {
        "name": "Fire Breath",
        "desc": "Dexterity Saving Throw: DC 24, each creature in a 90-foot Cone. Failure: 91 (26d6) Fire damage. Success: Half damage.",
        "attacks": [],
        "action_type": "ACTION",
        "order_in_statblock": 2,
        "legendary_action_cost": 1,
        "limited_to_form": null,
        "usage_limits": {
          "type": "RECHARGE_ON_ROLL",
          "param": 5
        }
      },
      {
        "name": "Multiattack",
        "desc": "The dragon makes three Rend attacks. It can replace one attack with a use of Spellcasting to cast Scorching Ray (level 3 version).",
        "attacks": [],
        "action_type": "ACTION",
        "order_in_statblock": 0,
        "legendary_action_cost": 1,
        "limited_to_form": null,
        "usage_limits": null
      },
      {
        "name": "Pounce",
        "desc": "The dragon moves up to half its Speed, and it makes one Rend attack.",
        "attacks": [],
        "action_type": "LEGENDARY_ACTION",
        "order_in_statblock": 2,
        "legendary_action_cost": 1,
        "limited_to_form": null,
        "usage_limits": null
      },
      {
        "name": "Rend",
        "desc": "Melee Attack Roll: +17, reach 15 ft. 19 (2d8 + 10) Slashing damage plus 10 (3d6) Fire damage.",
        "attacks": [
          {
            "name": "Rend attack",
            "attack_type": "WEAPON",
            "to_hit_mod": 17,
            "reach": 15,
            "range": null,
            "long_range": null,
            "target_creature_only": false,
            "damage_die_count": 2,
            "damage_die_type": "D8",
            "damage_bonus": 10,
            "damage_type": {
              "name": "Slashing",
              "key": "slashing"
            },
            "extra_damage_die_count": 3,
            "extra_damage_die_type": "D6",
            "extra_damage_bonus": 0,
            "extra_damage_type": {
              "name": "Fire",
              "key": "fire"
            },
            "distance_unit": "feet"
          }
        ],
        "action_type": "ACTION",
        "order_in_statblock": 1,
        "legendary_action_cost": 1,
        "limited_to_form": null,
        "usage_limits": null
      },
      {
        "name": "Spellcasting",
        "desc": "The dragon casts one of the following spells, requiring no Material components and using Charisma as the spellcasting ability (spell save DC 23, +15 to hit with spell attacks):\n\n- **At Will:** Command, Detect Magic, Scorching Ray\n- **1/Day Each:** Fireball, Scrying",
        "attacks": [],
        "action_type": "ACTION",
        "order_in_statblock": 3,
        "legendary_action_cost": 1,
        "limited_to_form": null,
        "usage_limits": null
      }
    ],
    "traits": [
      {
        "name": "Legendary Resistance (4/Day, or 5/Day in Lair)",
        "desc": "If the dragon fails a saving throw, it can choose to succeed instead."
      }
    ],
    "creaturesets": [],
    "environments": [],
    "illustration": null,
    "crossreferences": {
      "to": []
    }
  };

