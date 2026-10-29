# TODO: PHB-2024-Mechaniken ohne Senke

> Entstanden beim Übertragen der PHB-2024-Unterklassen, -Talente, -Hintergründe und -Zauber in den Vault (2026-10-28).
> Diese Mechaniken stehen nur als Text im Merkmal, deklariert ist höchstens der Teil, den das
> Schema schon kann. Keys ohne Präfix lesen sich als `phb-2024_<klasse>_<unterklasse>_<merkmal>`.

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

Die Teil-Auffüllung bei Kurzer Rast steht in `pool.shortRestRegain` (Kampfrausch, Tiergestalt,
Durchatmen, Psionische Energiewürfel), der Rückgewinn gegen einen Zauberplatz oder einen anderen
Vorrat in `pool.restoreBy` bzw. `mod.restoreBy` (Quelle der Inspiration, Wilde Wiederkehr). Was der
Zähler nicht zählt, steht als Hinweis `noteDe` an Vorrat oder Zuschlag (Gratis-Erstnutzung des
Psychischen Flüsterns, variable Kosten der Psionischen Zauberei).

| Merkmal | Mechanik | Was fehlt |
|---|---|---|
| `barbarian_path-of-the-world-tree_travel-along-the-tree`, `barbarian_path-of-the-zealot_fanatical-focus` | einmal pro Kampfrausch | Recharge pro Kampfrausch |
| `bard_college-of-glamour_mantle-of-majesty`, `fighter_psi-warrior_telekinetic-master` | Rückgewinn gegen Platz ≥ 3 bzw. Psi-Würfel | die freie Anwendung ist eine Wirk-Option (`grantsCasting`), kein Vorrat |

## Angriff, Würfe, Sonstiges

Zuschläge und Vorteil auf Initiative stehen in `grants.initiative` (Aufmerksam, Attentat,
Bemerkenswerter Athlet, Fürchterlicher Lauerjäger), der erweiterte Bereich für kritische Treffer
in `grants.criticalHit`, Zuschläge und Vorteil auf Fertigkeitswürfe in `grants.checks`. Zusätzliche
Schadenswürfel stehen als `grants.attack` der Art `dice` unter der Angriffstabelle (Schreckliche
Schläge, Gleißende Schläge, Göttlicher Schlag, Urschlag, Brutaler Hieb, Mondgestalt,
Kolossschlächter, Fürchterlicher Lauerjäger), Wirkungen ohne Zahl als Art `note` (Schlagende Wurzeln
mit Filter auf Schwer/Vielseitig, Elementare Einstimmung). Offen: der Würfel des Hinterhältigen Angriffs steht in
der Klassentabelle, `dice` liest keine Spalte.

| Merkmal | Mechanik |
|---|---|
| `srd-2024_fighter_champion_survivor` | Vorteil auf Todesrettungswürfe, Regeneration |
| `srd-2024_fighter_champion_heroic-warrior` | Heldische Inspiration |
| `ranger_gloom-stalker_iron-mind` | ersatzweise INT- oder CHA-Rettungswurf, wenn WEI schon geübt |
| `bard_college-of-dance_dazzling-footwork` | waffenlose Angriffe mit GES + BI-Würfel (Vorteil auf Auftreten ist deklariert) |
| `monk_way-of-shadow_cloak-of-shadows` | unsichtbar, durch Kreaturen bewegen (aktiv) |
| `rogue_soulknife_psychic-blades` | manifestierte Waffe als eigener Angriff |
| `ranger_beast-master_primal-companion` | Begleiter-Werteblock |
| `fighter_eldritch-knight_war-bond` | Schutz vor Entwaffnen, Waffe herbeirufen |
| `srd-2024_rogue_thief_use-magic-device` | Einstimmungslimit 4 |
| `cleric_war-domain_war-gods-blessing` | ohne Konzentration, 1 Minute |
| `paladin_oath-of-the-ancients_undying-sentinel` | kein magisches Altern (reine Erzählung) |

## Talente

Talent-Keys ohne Präfix lesen sich als `phb-2024_<talent>`.

| Talent | Mechanik | Was fehlt |
|---|---|---|
| `boon-of-energy-resistance` | zwei Resistenzen, je Lange Rast tauschbar | flüchtig; dass beide verschieden sind, prüft niemand |
| `unarmed-fighting`, `tavern-brawler` | Schaden waffenloser Schläge | der waffenlose Schlag ist kein Bibliotheks-Gegenstand; ihn am Angriffsnamen zu erkennen wäre ein zweiter Matcher |
| `thrown-weapon-fighting` | Fernkampfangriff mit Wurfwaffe | Filter „Fernkampf UND Wurf“ |
| `poisoner` | Giftschaden ignoriert Resistenz | keine Senke für das Durchbrechen von Resistenzen |
| `polearm-master` | Schwer UND Reichweite | Eigenschaftsfilter ist ODER, die Waffen stehen deshalb einzeln da |
| `ritual-caster` | Rituale aus jeder Liste, Anzahl = Übungsbonus | heute `byLevel` als Behelf |
| `keen-mind`, `observant` | Expertise, falls schon geübt, sonst Übung | Bedingung nicht ausdrückbar |
| `elemental-adept` | gewählte Schadensart ignoriert Resistenz | Wahl hat keine Regelwirkung; Wiederholung mit anderer Art nicht erzwungen |
| `heavy-armor-master` | Schadensreduktion = Übungsbonus | keine Senke |
| `defensive-duelist` | RK + Übungsbonus als Reaktion | keine Senke |
| `great-weapon-master` | Schaden + Übungsbonus | `dice` kennt keinen Übungsbonus |
| `medium-armor-master` | GES-Obergrenze 3 | `armorClass` kennt kein Anheben der GES-Obergrenze |
| `inspiring-leader` | temporäre TP | keine Senke |
| `chef` | Leckerbissen, eine Stunde Zubereitung | keine Senke |
| `durable` | Vorteil auf Todesrettungswürfe | `savingThrow`-Vorteil kennt keinen Todesrettungswurf |
| `shield-master`, `speedy`, `spell-sniper` | Wirkung auf Gegner bzw. Zauberangriffe | keine Senke |

## Hintergründe und Völker

| Key | Mechanik | Was fehlt |
|---|---|---|
| `phb-2024_aasimar_celestial-revelation` | Zusatzschaden = Übungsbonus, Aura mit SG | keine Senke |
| `phb-2024_aasimar_healing-hands` | W4 je Übungsbonus | keine Senke |
| `srd-2024_halfling_luck` | 1 neu würfeln | keine Senke |

## Zauber

| Mechanik | Zauber | Was fehlt |
|---|---|---|
| zwei Schadensarten | Jallarzis Sturm des Lichtglanzes, Hunger Hadars, Zerstörerische Woge | `damage` hat eine Art |
| Schadensart beim Wirken gewählt | Elementare Waffe | keine Senke |
| bedingter Würfel (W8/W12) | Totenläuten | keine Senke |
| Wirkung auf den Wirker | Quell des Mondlichts | keine Senke |
| temporäre TP | Rüstung von Agathys | keine Senke |
| Heilung über Trefferwürfel | Arkane Vitalität | keine Senke |
| Werteblock der Herbeirufung | alle „… herbeirufen“ | kein Schemafeld, steht als Markdown in der Beschreibung |
| Ausströmung als Fläche | mehrere | `area_of_effect` kennt keine Ausströmung |
