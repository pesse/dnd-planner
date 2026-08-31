/**
 * Der Dokumentbau: Hülle, Auswahl, Entwertung — und die Übungs-Senke, die zuvor über die
 * Taendler-Felder geprüft wurde (`characterProficienciesPdf`, mit derselben Fixture).
 *
 *   npm run test -- characterSheetHtml
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { buildCharacterSheetHtml } from '../../src/lib/print/character/document';
import { defaultSelection, sheetSections } from '../../src/lib/print/character/sections';
import type { CharacterPrintData } from '../../src/lib/print/character/data';
import type { SpellQuotaGroup } from '../../src/lib/services/spellcasting/grouped';
import { allProficienciesCharacter } from '../fixtures/character-all-proficiencies';

const dataFor = (character: CharacterPrintData['character']): CharacterPrintData => ({
  character,
  portraitUrl: '',
  companionImageUrl: '',
  freetext: '',
  attacks: [],
  features: { speciesGroups: [], classGroups: [], backgroundGroups: [], featEntries: [], orphanChoices: [] },
  grouped: { sources: [], resources: [], extra: [], issues: [] },
  mastery: { allowance: 0, className: '', meleeOnly: false, weapons: [] },
  pools: [],
  resources: [],
  values: [],
  spellCards: '',
});

const build = (d: CharacterPrintData, over: Record<string, boolean> = {}): string =>
  buildCharacterSheetHtml(d, { ...defaultSelection(sheetSections(d)), ...over });

const full = () => build(dataFor(allProficienciesCharacter));

/** Auf den Blocktitel prüfen, nicht auf das blanke Wort — das steht auch im Stylesheet. */
const title = (label: string) => `<span class="btitle">${label}</span>`;

const quota = (over: Partial<SpellQuotaGroup>): SpellQuotaGroup => ({
  sourceId: 'cls:wizard', quotaId: 'q', label: 'Vorbereitet', cast: [], castNote: '', swapNote: '',
  levels: [], lists: [], schools: [], from: null, into: null,
  count: 0, tier: 'prepared', fixed: false, spells: [], open: 0, ...over,
});

const wizardSource = (quotas: SpellQuotaGroup[]) => ({
  id: 'cls:wizard', label: 'Magier', featureDe: '', abilityDe: 'Intelligenz',
  abilityOptions: [], saveDC: 13, attackBonus: 5, quotas,
});

describe('HTML-Charakterbogen', () => {
  it('liefert genau ein A4-Dokument', () => {
    const html = full();

    expect(html.match(/<!DOCTYPE html>/g)).toHaveLength(1);
    expect(html.match(/@page \{ size: A4 portrait/g)).toHaveLength(1);
    expect(html).toContain('<title>Miriel Sturmklinge – Charakterbogen</title>');
  });

  it('bringt jede Übungsquelle auf den Bogen: Kategorien als Ringe, Einzelwaffe und Freitext als Text', () => {
    const html = full();

    expect(html).toContain('<i class="pm on"></i>Einfache Waffen');
    expect(html).toContain('<i class="pm on"></i>Kriegswaffen');
    expect(html).toContain('<i class="pm on"></i>Schilde');
    expect(html).toContain('<span class="o-plbl">Sonstige Waffen</span>Kurzschwert, Kriegswaffen mit Finesse');
  });

  it('lässt die Waffenzeile ganz weg, wenn weder Einzelwaffe noch Freitext da ist', () => {
    const bare = characterSchema.parse({
      ...allProficienciesCharacter,
      proficiencies: { individualWeapons: [], otherWeapons: '   ' },
      tools: [], languages: [],
    });
    const html = build(dataFor(bare));

    // Der Druck ist Ausgabe: ohne Wert keine Beschriftung, kein Feld.
    expect(html).not.toContain('<span class="o-plbl">Sonstige Waffen</span>');
    expect(html).not.toContain('Kriegswaffen mit Finesse');
  });

  it('nimmt eine abgewählte Sektion aus dem Dokument', () => {
    const d = dataFor(allProficienciesCharacter);

    expect(build(d)).toContain(title('Ausrüstung &amp; Geldmittel'));
    expect(build(d, { inventory: false })).not.toContain(title('Ausrüstung &amp; Geldmittel'));
  });

  it('lässt eine Seite ganz weg, für die nichts gewählt ist', () => {
    const d = dataFor(allProficienciesCharacter);
    const onlyOverview = Object.fromEntries(sheetSections(d).map((s) => [s.id, s.page === 'overview']));
    const withoutOverview = Object.fromEntries(sheetSections(d).map((s) => [s.id, s.page !== 'overview']));

    expect(buildCharacterSheetHtml(d, onlyOverview)).not.toContain('<div class="page">');
    expect(buildCharacterSheetHtml(d, withoutOverview)).not.toContain('<section class="sheet">');
    expect(buildCharacterSheetHtml(d, withoutOverview).match(/<div class="page">/g)).toHaveLength(1);
  });

  it('entwertet Zeichen, die sonst Markup wären', () => {
    const tricky = characterSchema.parse({ ...allProficienciesCharacter, name: 'Bob & <script>' });

    const html = build(dataFor(tricky));
    expect(html).toContain('Bob &amp; &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('zählt den Vorrat als Kästchen und den Hinterhältigen Angriff als Wert', () => {
    const d = dataFor(allProficienciesCharacter);
    d.resources = [{
      id: 'srd-2024_sorcerer_font-of-magic/points', featureKey: 'srd-2024_sorcerer_font-of-magic',
      labelDe: 'Zauberpunkte', origin: 'class', classKey: 'srd-2024_sorcerer', recharge: 'long-rest',
      shared: '', kind: 'points', max: [3], additions: [],
    }];
    d.values = [{
      className: 'Schurke',
      tracks: [{ column: 'Sneak Attack', label: 'Hinterhältiger Angriff', text: '2d6' }],
    }];
    const html = build(d);
    // Alle Vorräte stehen am Kopf des Zauberblatts; davor liegen die Kästchen der Übersicht.
    const top = html.split('class="sp-top"')[1];

    expect(top).toContain(title('Zauberpunkte'));
    expect(top).toContain('Lange Rast');
    expect(top.match(/<i class="tick"><\/i>/g)).toHaveLength(3);
    expect(top).toContain(title('Werte'));
    expect(top).toContain('<span class="res-value">2d6</span>');
  });

  it('stellt die Zauberliste als `sp-list` direkt hinter den Vorrat', () => {
    const d = dataFor(allProficienciesCharacter);
    d.resources = [{
      id: 'srd-2024_wizard_spellcasting/slots', featureKey: 'srd-2024_wizard_spellcasting',
      labelDe: 'Zauberplätze', origin: 'class', classKey: 'srd-2024_wizard', recharge: 'long-rest',
      shared: '', kind: 'points', max: [2], additions: [],
    }];
    d.grouped = {
      sources: [wizardSource([quota({ spells: [{ key: 'shield', label: 'Schild', level: 1, ritual: false }] })])],
      resources: [], extra: [], issues: [],
    };
    const html = build(d);

    // Diese Nachbarschaft trägt `.sp-top + .sp-list { break-before: avoid }`: bricht das Blatt,
    // dann vor dem Vorrat statt zwischen ihm und der Liste.
    expect(html).toMatch(/<\/div><section class="block sp-list/);
  });

  it('füllt das Häkchen für vorbereitete Zauber und lässt das Zauberbuch leer', () => {
    const bolt = { key: 'magic-missile', label: 'Magisches Geschoss', level: 1, ritual: false };
    const shield = { key: 'shield', label: 'Schild', level: 1, ritual: false };
    const d = dataFor(allProficienciesCharacter);
    d.grouped = {
      sources: [wizardSource([
        quota({ quotaId: 'book', label: 'Zauberbuch', tier: 'known', spells: [bolt, shield] }),
        quota({ quotaId: 'prepared', tier: 'prepared', spells: [bolt] }),
      ])],
      resources: [], extra: [], issues: [],
    };
    const html = build(d);

    expect(html).toContain('<i class="cbox on"></i><span class="sname">Magisches Geschoss</span>');
    expect(html).toContain('<i class="cbox"></i><span class="sname">Schild</span>');
  });

  it('führt einen Zauber je Quelle einmal, mit dem Hinweis, der etwas sagt', () => {
    const bolt = { key: 'fire-bolt', label: 'Feuerpfeil', level: 0, ritual: false };
    const bolt2 = { key: 'magic-missile', label: 'Magisches Geschoss', level: 1, ritual: false };
    const d = dataFor(allProficienciesCharacter);
    d.grouped = {
      sources: [wizardSource([
        quota({ quotaId: 'book', label: 'Zauberbuch', spells: [bolt, bolt2] }),
        quota({
          quotaId: 'prepared', cast: [{ kind: 'slots', pool: 'standard' }], castNote: 'über Zauberplätze',
          from: { quotas: [{ sourceId: 'cls:wizard', quotaId: 'book' }], label: 'Zauberbuch', spells: [] },
          spells: [bolt2],
        }),
        quota({
          quotaId: 'mastery', label: 'Gewährt', fixed: true, spells: [bolt2],
          cast: [{ kind: 'uses', per: 'long-rest', count: 1 }], castNote: '1× ohne Zauberplatz pro Lange Rast',
        }),
      ])],
      resources: [], extra: [], issues: [],
    };
    const html = build(d);

    expect(html.match(/Magisches Geschoss/g)).toHaveLength(1);
    expect(html).toContain('<span class="spell-note">1× ohne Zauberplatz pro Lange Rast</span>');
    // Der Normalweg bleibt stumm: das Zauberbuch speist „vorbereitet", die Plätze stehen als Kasten.
    expect(html).not.toContain('über Zauberplätze');
    // Die Herkunft des Kontingents ist keine Tischinformation, nur der Wirkweg.
    expect(html).not.toContain('Gewährt');
  });

  it('druckt nur, was eingetragen ist — Zeilen zum Nachtragen gibt es nur für offene Wahlen', () => {
    const d = dataFor(allProficienciesCharacter);
    d.attacks = [{ name: 'Kurzschwert', bonus: '5', damage: '1W6+3', type: 'Stich', range: '1,5 m', note: '' }];
    d.grouped = {
      ...d.grouped,
      sources: [wizardSource([
        quota({ spells: [{ key: 'fire-bolt', label: 'Feuerpfeil', level: 0, ritual: false }] }),
        quota({ quotaId: 'offen', label: 'Zaubertricks', open: 2 }),
      ])],
    };
    const html = build(d);

    // Angriffe: der eine eingetragene, dazu leere Zeilen zum Nachtragen, keine Beschreibungsfläche.
    const attacks = html.split('<table class="o-atk">')[1].split('</table>')[0];
    // Zwanzig Zeilen im Kasten: die Kopfzeile, der eingetragene Angriff, der Rest zum Nachtragen.
    expect(attacks.match(/<tr>/g)).toHaveLength(1 + 20);
    expect(attacks.match(/<span class="wcell"><\/span>/g)).toHaveLength(19);
    expect(attacks).not.toContain('Beschreibung');
    // Zauber: eine Zeile je gewähltem Zauber, plus eine je offener Wahl.
    expect(html.match(/<span class="sname write"><\/span>/g)).toHaveLength(2);
  });

  it('hängt die Angriffsnotiz unter den Namen und rechnet sie als zweite Linie', () => {
    const d = dataFor(allProficienciesCharacter);
    d.attacks = [{
      name: 'Flammenzunge', bonus: '8', damage: '1W8+5', type: 'Hieb', range: 'Nah',
      note: '+1W6 jede lange Rast',
    }];
    const attacks = build(d).split('<table class="o-atk">')[1].split('</table>')[0];

    expect(attacks).toContain('<span class="anote">+1W6 jede lange Rast</span>');
    expect(attacks).toContain('<tr class="has-note">');
    // Der Kasten hält seine zwanzig Linien: die Notiz belegt eine davon.
    expect(attacks.match(/<span class="wcell"><\/span>/g)).toHaveLength(18);
  });

  it('druckt keinen beschrifteten Kasten ohne Wert', () => {
    const bare = characterSchema.parse({
      ...allProficienciesCharacter,
      ac: '', initiative: '', speed: '', hitDice: '', passivePerception: '',
      playerName: '', xp: '', classFeatures: '',
    });
    const html = build(dataFor(bare));

    for (const label of ['Passive Wahrnehmung', 'Spieler*in', 'Erfahrungspunkte',
      'Klassenmerkmale']) {
      expect(html, label).not.toContain(`>${label}<`);
    }
    // Was sich im Spiel ändert, steht auch leer — der Kasten ist dann die Schreibfläche.
    for (const label of ['Rüstungsklasse', 'Initiative', 'Bewegungsrate']) {
      expect(html, label).toContain(`>${label}<`);
    }
    // Was im Spiel abgestrichen wird, bleibt: die Trefferpunkt-Fläche und die Todesretter.
    expect(html).toContain('>Aktuelle Trefferpunkte<');
    expect(html).toContain('>Rettungswürfe gegen Tod<');
    // Ohne Gesamtwert bleibt der Trefferwürfel-Kasten, aber ohne seine Kopfzeile.
    expect(html).toContain('>Trefferwürfel<');
    expect(html).not.toContain('>Gesamt<');
  });

  it('bricht Freitext in Absätze, auch mit CRLF, und macht Gliederungszeilen zu Zwischentiteln', () => {
    const text = '[Klassenmerkmale]\r\nErster Absatz.\r\n\r\n[Eigenschaften]\r\nZweiter Absatz.';
    const d = dataFor(characterSchema.parse({ ...allProficienciesCharacter, classFeatures: text }));
    const html = build(d);

    // Die führende Zeile wiederholt den Kastentitel und fällt weg, die spätere gliedert.
    expect(html).toContain('<p>Erster Absatz.</p>');
    expect(html).toContain('<b class="phead">Eigenschaften</b><br>Zweiter Absatz.');
    expect(html).not.toContain('[Klassenmerkmale]');
    expect(html).not.toContain('[Eigenschaften]');
  });

  it('hält im Ausrüstungskasten Platz frei und stellt alle fünf Münzsorten an seinen rechten Rand', () => {
    const money = (html: string) => html.split('class="inv-money"')[1].split('</section>')[0];
    const html = full();

    // Je Spalte vier Zeilen zum Nachtragen — der Kasten hat kein eigenes Notizfeld.
    const inventory = html.split('class="block wide long inv"')[1].split('</section>')[0];
    expect(inventory.match(/<span class="wcell"><\/span>/g)).toHaveLength(3 * 4);
    expect(inventory).not.toContain('>Notizen<');
    for (const coin of ['KM', 'SM', 'EM', 'GM', 'PM']) {
      expect(money(html), coin).toContain(coin);
    }

    // Auch ohne Gegenstand und ohne Münze bleibt der Kasten: er ist die Schreibfläche.
    const bare = characterSchema.parse({
      ...allProficienciesCharacter, inventory: [], inventoryNotes: '',
      currency: { km: '', sm: '', em: '', gm: '', pm: '' },
    });
    expect(build(dataFor(bare))).toContain(title('Ausrüstung &amp; Geldmittel'));
  });

  it('hängt gepinnte Merkmale an und lässt sie auf Wunsch weg', () => {
    const d = dataFor(characterSchema.parse({
      ...allProficienciesCharacter,
      pinnedFeatures: ['srd-2024_druid_wild-shape'],
    }));
    d.features = {
      ...d.features,
      classGroups: [{
        title: 'Druide 3', sourceKey: 'srd-2024_druid', unresolved: false,
        features: [{
          name: 'Wildgestalt', desc: 'Du verwandelst dich in ein Tier.',
          gainedAt: 2, key: 'srd-2024_druid_wild-shape',
        }],
      }],
    };

    expect(build(d)).toContain(title('Gepinnte Merkmale'));
    expect(build(d)).toContain('Du verwandelst dich in ein Tier.');
    expect(build(d, { featuresPinned: false })).not.toContain(title('Gepinnte Merkmale'));
  });

  it('nimmt Karten und Karten-Stylesheet nur ins Dokument, wenn sie gewählt sind', () => {
    const d = dataFor(allProficienciesCharacter);
    d.grouped = { ...d.grouped, extra: [{ key: 'fire-bolt', label: 'Feuerpfeil', level: 0, ritual: false }] };
    d.spellCards = '<div class="cards">EINE KARTE</div>';

    expect(build(d)).not.toContain('EINE KARTE');
    expect(build(d, { spellCards: true })).toContain('EINE KARTE');
    expect(build(d, { spellCards: true })).toContain('@page cards');
  });
});
