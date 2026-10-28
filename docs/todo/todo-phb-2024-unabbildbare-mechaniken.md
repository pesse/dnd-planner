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
