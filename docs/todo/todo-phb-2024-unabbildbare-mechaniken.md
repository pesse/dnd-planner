# TODO: Unterklassen-Mechaniken ohne Senke

> Entstanden beim Übertragen aller PHB-2024-Unterklassen in den Vault (2026-10-28).
> Diese Mechaniken stehen nur als Text im Merkmal, deklariert ist höchstens der Teil, den das
> Schema schon kann. Keys ohne Präfix lesen sich als `phb-2024_<klasse>_<unterklasse>_<merkmal>`.

## Fehler in der App (Daten sind richtig)

- **Zirkel des Landes:** Das Land wird nach jeder Langen Rast neu gewählt. `fromDescTable`
  vereinigt alle vier Tabellen, damit gelten heute alle 16 Zauber als vorbereitet
  (`srd-2024_druid_circle-of-the-land_spell-list`).

## Schadensresistenz und Zustandsimmunität

Feste, an eine Lage gebundene und per Option gewählte Resistenzen stehen in `grants.defenses`
(Auren: `aura.resistances`). Offen sind flüchtige Wahlen und Schaden, der keine Schadensart ist.

| Merkmal | Mechanik | Was fehlt |
|---|---|---|
| `wizard_abjurer_spell-resistance` | Schaden durch Zauber | keine Schadensart |
| `srd-2024_druid_circle-of-the-land_natures-ward` | Resistenz je Land | Land wechselt je Lange Rast (Immunität Vergiftet ist deklariert) |
| `srd-2024_warlock_fiend-patron_fiendish-resilience` | gewählte Art | neu je Rast (flüchtig) |
| `barbarian_path-of-the-wild-heart_rage-of-the-wilds` | Bär: alles außer Energie, nekrotisch, psychisch, gleißend | Wahl je Kampfrausch (flüchtig) |
| `monk_warrior-of-the-elements_elemental-epitome` | gewählte Art, jede Runde wechselbar | flüchtig |

## Bewegungsraten und Sinne

Feste und an eine Lage gebundene Bewegungsarten, Erhöhungen und Sinne stehen in `grants.speeds` /
`grants.senses` (Abschnitt „Bewegung & Sinne" auf Bogen und Druck). Offen:

| Merkmal | Mechanik | Was fehlt |
|---|---|---|
| `srd-2024_monk_unarmored-movement` | +10 bis +30 ft nach Mönchsstufe | die Laufzeit-Senke kennt die Klassenstufe nicht |
| `srd-2024_rogue_thief_second-story-work` | Sprungweite aus GES | kein Feld für Sprungweite (Klettern ist deklariert) |
| `wizard_diviner_the-third-eye` | Dunkelsicht oder Unsichtbares sehen | Wahl bis zur Rast (flüchtig) |
| `barbarian_path-of-the-wild-heart_power-of-the-wilds` | Fliegen (Falke) | Wahl je Kampfrausch (flüchtig) |
| `fighter_psi-warrior_telekinetic-adept` | Fliegen | ein Zug |
| `monk_warrior-of-the-elements_elemental-epitome` | +20 ft | ein Zug nach Schritt des Windes |
| `sorcerer_aberrant-sorcery_revelation-in-flesh` | Schwimmen, Fliegen, Unsichtbares sehen | Wahl bei jeder Anwendung (flüchtig) |
| Bewegungsrate im Kampfblock | dauerhafte Erhöhungen (Aura der Behändigkeit) | stehen als eigene Zeile, nicht in der eingetragenen Bewegungsrate |

## Ressourcen

| Merkmal | Mechanik | Was fehlt |
|---|---|---|
| `fighter_psi-warrior_psionic-power`, `rogue_soulknife_psionic-power` | Kurze Rast gibt einen Würfel zurück | Teil-Auffüllung (heute `long-rest`) |
| `phb-2024_fighter_battle-master_combat-superiority` | dito | dito |
| `barbarian_path-of-the-world-tree_travel-along-the-tree`, `barbarian_path-of-the-zealot_fanatical-focus` | einmal pro Kampfrausch | Recharge pro Kampfrausch |
| `barbarian_path-of-the-zealot_zealous-presence`, `srd-2024_barbarian_path-of-the-berserker_intimidating-presence` | Rückgewinn gegen Kampfrausch-Anwendung | Ressource A füllt Ressource B |
| `bard_college-of-glamour_beguiling-magic` | Rückgewinn gegen Bardische Inspiration | dito |
| `bard_college-of-glamour_mantle-of-majesty` | Rückgewinn gegen Platz ≥ 3 | dito |
| `paladin_oath-of-glory_living-legend`, `paladin_oath-of-the-ancients_elder-champion`, `paladin_oath-of-vengeance_avenging-angel` | Rückgewinn gegen Platz 5. Grades | dito |
| `druid_circle-of-the-moon_moonlight-step` | Rückgewinn gegen Platz ≥ 2 | dito |
| `fighter_psi-warrior_*` (telekinetic-adept, bulwark-of-force, telekinetic-master), `fighter_battle-master_know-your-enemy` | Rückgewinn gegen Psi-/Überlegenheitswürfel | dito |
| `rogue_soulknife_psychic-veil`, `rogue_soulknife_rend-mind` | Rückgewinn gegen Psi-Würfel | dito |
| `rogue_soulknife_psionic-power` | erste Psychic Whispers je Lange Rast gratis | Gratis-Erstnutzung |
| `sorcerer_aberrant-sorcery_psionic-sorcery` | Zaubereipunkte = Zaubergrad | variable Kosten (`amount` ist fest) |

## Angriff, Würfe, Sonstiges

| Merkmal | Mechanik |
|---|---|
| `srd-2024_fighter_champion_improved-critical`, `_superior-critical` | Kritischer Treffer bei 19–20 / 18–20 |
| `srd-2024_fighter_champion_remarkable-athlete` | Vorteil auf Initiative und Athletik |
| `srd-2024_fighter_champion_survivor` | Vorteil auf Todesrettungswürfe, Regeneration |
| `srd-2024_fighter_champion_heroic-warrior` | Heldische Inspiration |
| `rogue_assassin_assassinate` | Vorteil auf Initiative |
| `ranger_gloom-stalker_dread-ambusher` | WEI-Mod auf Initiative |
| `ranger_fey-wanderer_otherworldly-glamour` | WEI-Mod auf Charismawürfe |
| `ranger_gloom-stalker_iron-mind` | ersatzweise INT- oder CHA-Rettungswurf, wenn WEI schon geübt |
| `ranger_fey-wanderer_dreadful-strikes` | +1W4/1W6 psychisch (`attack.damage` nimmt keine Würfel) |
| `bard_college-of-dance_dazzling-footwork` | Vorteil auf Auftreten; waffenlose Angriffe mit GES + BI-Würfel |
| `barbarian_path-of-the-world-tree_battering-roots` | +10 ft Reichweite; Stoßen/Umstoßen als zusätzliche Meisterschaft |
| `monk_warrior-of-the-elements_elemental-attunement` | +10 ft Reichweite, wählbare Schadensart (aktiv) |
| `monk_way-of-shadow_cloak-of-shadows` | unsichtbar, durch Kreaturen bewegen (aktiv) |
| `rogue_soulknife_psychic-blades` | manifestierte Waffe als eigener Angriff |
| `ranger_beast-master_primal-companion` | Begleiter-Werteblock |
| `fighter_eldritch-knight_war-bond` | Schutz vor Entwaffnen, Waffe herbeirufen |
| `srd-2024_rogue_thief_use-magic-device` | Einstimmungslimit 4 |
| `cleric_war-domain_war-gods-blessing` | ohne Konzentration, 1 Minute |
| `paladin_oath-of-the-ancients_undying-sentinel` | kein magisches Altern (reine Erzählung) |
