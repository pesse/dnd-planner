/**
 * PDF-Export für Charaktere — Taendler v2.8.x Format.
 * Füllt die Blanko-Vorlage vault/templates/ataendler_v2.8.2.pdf per Form-Filling (pdf-lib).
 */
import { PDFDocument, PDFCheckBox, PDFTextField, PDFButton, PDFImage, PDFPage } from 'pdf-lib';
import type { CharacterJSON } from './characterFields';
import { SKILL_DEFS, withSpellValues } from './characterFields';
import type { SpellAccessValues } from '../services/spellAccess';
import { appendMarkdownPages } from './markdownPdf';
import { lineWeightKg, totalWeightKg, formatKg } from '../utils/inventoryWeight';

export interface PortraitInput {
  bytes: Uint8Array;
  /** 'png' oder 'jpg' — entscheidet, welcher pdf-lib Embed-Aufruf genutzt wird */
  format: 'png' | 'jpg';
}

export type PdfExportFormat = 'taendler_v2_8';

// Anzahl Zauber-Textfelder pro Stufe in Taendler v2.8.x
const SPELL_COUNT: Record<number, number> = { 1:13, 2:13, 3:13, 4:13, 5:9, 6:9, 7:9, 8:7, 9:7 };

function setText(doc: PDFDocument, fieldName: string, value: string) {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFTextField) {
      field.setText(value ?? '');
    }
  } catch { /* Feld nicht vorhanden → ignorieren */ }
}

/**
 * Setzt Text in einem mehrzeiligen Feld mit fester Schriftgröße.
 * Das Taendler-PDF nutzt /Sz 0 (Auto-Fit). pdf-lib bäckt jedoch beim Speichern
 * Appearance-Streams ein und wählt bei wenig Text + großem Feld eine riesige
 * Schrift. Eine explizite Größe verhindert das.
 */
function setMultilineText(doc: PDFDocument, fieldName: string, value: string, fontSize = 9) {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFTextField) {
      field.setText(value ?? '');
      field.setFontSize(fontSize);
    }
  } catch { /* ignorieren */ }
}

function setCheck(doc: PDFDocument, fieldName: string, checked: boolean) {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFCheckBox) {
      if (checked) field.check(); else field.uncheck();
    }
  } catch { /* Feld nicht vorhanden → ignorieren */ }
}

/**
 * Zeichnet ein Bild direkt als Seiteninhalt an die Position eines Button-Feldes
 * (Seitenverhältnis erhalten, zentriert) und entfernt anschließend den Button.
 *
 * Robuster als PDFButton.setImage: Button-Icon-Appearances werden von vielen
 * Viewern (Adobe, Browser, Preview) nicht gerendert — direkt gezeichneter
 * Seiteninhalt dagegen immer, auch beim Drucken/Flatten.
 */
function drawImageIntoButtonField(doc: PDFDocument, fieldName: string, image: PDFImage) {
  const form = doc.getForm();
  const field = form.getField(fieldName);
  if (!(field instanceof PDFButton)) return;
  const widget = field.acroField.getWidgets()[0];
  if (!widget) return;
  const rect = widget.getRectangle();
  // Seite finden, auf der das Widget liegt
  const widgetDict = widget.dict;
  let targetPage: PDFPage | undefined;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      if (annots.lookup(i) === widgetDict) { targetPage = page; break; }
    }
    if (targetPage) break;
  }
  if (!targetPage) return;
  // In das Feld einpassen (Seitenverhältnis erhalten), zentriert
  const fit = image.scaleToFit(rect.width, rect.height);
  targetPage.drawImage(image, {
    x: rect.x + (rect.width - fit.width) / 2,
    y: rect.y + (rect.height - fit.height) / 2,
    width: fit.width,
    height: fit.height,
  });
  // Button (inkl. Platzhalter "Hier klicken um Bild auszuwählen") entfernen
  form.removeField(field);
}

/**
 * Splittet einen Text so, dass Feld 1 zuerst gefüllt wird (bis ~limit Zeichen
 * am nächsten Absatzumbruch); Rest landet in Feld 2.
 *
 * Das Limit entspricht der ungefähren sichtbaren Kapazität von Feld 1 in der
 * Taendler-Vorlage. Getrennt wird ab dem Limit an der nächsten Leerzeile
 * (auch mit Whitespace, z.B. "\n \n"); fehlt eine, wird auf einfachen
 * Zeilenumbruch bzw. Wortgrenze zurückgefallen, damit auch ein langer
 * Block ohne Absätze nicht komplett in Feld 1 überläuft.
 */
function splitClassFeatures(text: string, limit = 700): [string, string] {
  if (!text) return ['', ''];
  if (text.length <= limit) return [text, ''];
  const breakAt = (re: RegExp): number => {
    re.lastIndex = limit;
    const m = re.exec(text);
    return m ? m.index : -1;
  };
  let idx = breakAt(/\n[ \t]*\n/g);            // Leerzeile (Absatz, auch mit Whitespace)
  if (idx === -1) idx = breakAt(/\n/g);         // einfacher Zeilenumbruch
  if (idx === -1) idx = text.indexOf(' ', limit); // Wortgrenze
  if (idx === -1) return [text, ''];            // keine Trennstelle → alles in Feld 1
  return [text.slice(0, idx).trim(), text.slice(idx).trim()];
}

/**
 * „Langschwert" → „Langschwert (Auslaugen)", wenn die Waffe beherrscht wird.
 *
 * Aufgelöst wird NICHT hier: der Aufrufer übergibt denselben Resolver, der im
 * Charakterbogen die Pille zeichnet — so können PDF und Bogen nicht auseinanderlaufen,
 * und dieses Modul bleibt frei von Bibliotheks-Zugriffen.
 */
function withMasterySuffix(name: string, resolve?: (attackName: string) => string | undefined): string {
  const label = name.trim() ? resolve?.(name) : undefined;
  return label ? `${name} (${label})` : name;
}

/**
 * Exportiert einen Charakter als ausgefülltes Taendler-PDF.
 * @param character  Der zu exportierende Charakter
 * @param templateBytes  Bytes der Blanko-Vorlage (ataendler_v2.8.2.pdf)
 */
export async function exportCharacterToPdf(
  character: CharacterJSON,
  templateBytes: Uint8Array,
  options: {
    portrait?: PortraitInput;
    format?: PdfExportFormat;
    freitext?: string;
    /** Angriffsname → deutscher Name der Meisterschaftseigenschaft (leer = nicht beherrscht). */
    masteryOf?: (attackName: string) => string | undefined;
    /** Zauberwerte der Merkmals-Zugänge — dieselben Zeilen, die die Karte zeigt. */
    spellAccess?: SpellAccessValues[];
  } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);

  const t = (k: string, v: string | number) => setText(pdf, k, String(v ?? ''));
  const m = (k: string, v: string, size = 9) => setMultilineText(pdf, k, v ?? '', size);
  const c = (k: string, v: boolean) => setCheck(pdf, k, v);

  // --- Kopf ---
  t('Charaktername_page1', character.name);
  t('Charaktername_page2', character.name);
  t('KlasseUndStufe', character.classLevel);
  t('Spielername', character.playerName);
  t('Hintergrund', character.background);
  t('Volk', character.race);
  t('Erfahrungspunkte', character.xp);

  // --- Attribute ---
  t('Str', character.str); t('StrMod', character.strMod);
  t('Ges', character.ges); t('GesMod', character.gesMod);
  t('Kon', character.kon); t('KonMod', character.konMod);
  t('Int', character.int); t('IntMod', character.intMod);
  t('Wei', character.wei); t('WeiMod', character.weiMod);
  t('Cha', character.cha); t('ChaMod', character.chaMod);

  // --- Kampfwerte ---
  t('Übungsbonus', character.proficiencyBonus);
  t('Rüstungsklasse', character.ac);
  t('Initiative', character.initiative);
  t('Bewegungsrate', character.speed);
  t('TrefferpunkteMaximum', character.hpMax);
  t('AktTrefferpunkte', character.hpCurrent);
  t('TempTrefferpunkte', character.hpTemp);
  t('Trefferwürfel', character.hitDice);
  t('PassiveWeisheit', character.passivePerception);

  // --- Rettungswürfe (Übungen + berechnete Werte) ---
  c('StrProf', character.strSaveProf);
  c('GesProf', character.gesSaveProf);
  c('KonProf', character.konSaveProf);
  c('IntProf', character.intSaveProf);
  c('WeiProf', character.weiSaveProf);
  c('ChaProf', character.chaSaveProf);

  const pb = character.proficiencyBonus;
  t('StrRW', character.strMod + (character.strSaveProf ? pb : 0));
  t('GesRW', character.gesMod + (character.gesSaveProf ? pb : 0));
  t('KonRW', character.konMod + (character.konSaveProf ? pb : 0));
  t('IntRW', character.intMod + (character.intSaveProf ? pb : 0));
  t('WeiRW', character.weiMod + (character.weiSaveProf ? pb : 0));
  t('ChaRW', character.chaMod + (character.chaSaveProf ? pb : 0));

  // --- Fertigkeiten ---
  c('Alleskoenner', character.alleskoenner);
  for (const skill of SKILL_DEFS) {
    const entry = character.skills?.[skill.key];
    if (!entry) continue;
    c(skill.profField, entry.prof);
    c(skill.expField, entry.exp);
    t(skill.valField, entry.value);
  }

  // --- Angriffe ---
  // Die Meisterschaftseigenschaft hängt am Waffennamen: das Taendler-PDF hat keine
  // freie Spalte dafür. Der Import schneidet das Suffix wieder ab
  // (`stripMasterySuffix`), sonst wüchse es bei jedem Zyklus an.
  for (let i = 0; i < 5; i++) {
    const atk = character.attacks?.[i];
    t(`Angriff${i+1}`, withMasterySuffix(atk?.name ?? '', options.masteryOf));
    t(`Bonus${i+1}`, atk?.bonus ?? '');
    t(`Schaden${i+1}`, atk?.damage ?? '');
    t(`Schadentyp${i+1}`, atk?.type ?? '');
    t(`Reichweite${i+1}`, atk?.range ?? '');
  }

  // --- Klassenmerkmale (Feld 1 zuerst füllen, dann Feld 2 als Überlauf) ---
  // Die Zauberwerte eines Merkmals-Zugangs hängen sich an die Notizzeile, weil das PDF nur
  // EINEN Zauberblock hat und der der Klasse gehört. Vor dem Trennen, damit die Marke am
  // Überlauf teilnimmt statt hinter Feld 2 zu verschwinden.
  const klm = withSpellValues(character.classFeatures ?? '', options.spellAccess ?? []);
  const [klmA, klmB] = splitClassFeatures(klm);
  m('Klassenmerkmale1', klmA, 9);
  m('Klassenmerkmale2', klmB, 9);

  // --- Persönlichkeit ---
  m('Persönlichkeitsmerkmale', character.traits ?? '', 9);
  m('Ideale', character.ideals ?? '', 9);
  m('Bindungen', character.bonds ?? '', 9);
  m('Makel', character.flaws ?? '', 9);

  // --- Persönliches (Personalbogen-Block) ---
  const p = character.personal;
  if (p) {
    m('Rassenmerkmale', p.rassenmerkmale ?? '', 9);
    t('Alter', p.alter);
    t('Geschlecht', p.geschlecht);
    t('SizeCat', p.sizeCat);
    t('Gesinnung', p.gesinnung);
    t('Glaube', p.glaube);
    t('Lebensstil', p.lebensstil);
    t('TäglicheKosten', p.taeglicheKosten);
    t('Augenfarbe', p.augenfarbe);
    t('Haarfarbe', p.haarfarbe);
    t('Hautfarbe', p.hautfarbe);
    t('Gewicht', p.gewicht);
    t('Körpergrösse', p.koerpergroesse);
    m('Aussehen', p.aussehen ?? '', 9);
  }

  // --- Waffenübungen & Rüstungsausbildung ---
  const pr = character.proficiencies;
  if (pr) {
    c('EinfachWaffenProf', pr.simpleWeapons);
    c('KriegswaffenProf', pr.martialWeapons);
    t('SonstigeWaffen', pr.otherWeapons ?? '');
    c('SonstigeWaffenProf', (pr.otherWeapons ?? '').trim() !== '');
    c('LeichteRüstungProf', pr.lightArmor);
    c('MittlereRüstungProf', pr.mediumArmor);
    c('SchwereRüstungProf', pr.heavyArmor);
    c('SchildeProf', pr.shields);
  }

  // --- Portrait (AussehenBild) ---
  // Bild direkt als Seiteninhalt an die Feld-Position zeichnen (statt als
  // Button-Icon, das viele Viewer nicht anzeigen) und den Button entfernen.
  if (options.portrait) {
    try {
      const image = options.portrait.format === 'png'
        ? await pdf.embedPng(options.portrait.bytes)
        : await pdf.embedJpg(options.portrait.bytes);
      drawImageIntoButtonField(pdf, 'AussehenBild', image);
    } catch { /* Portrait-Embed fehlgeschlagen → ignorieren */ }
  }

  // --- Sprachen & Werkzeuge ---
  for (let i = 0; i < 6; i++) {
    t(`Sprache${i+1}`, character.languages?.[i] ?? '');
    t(`WerkzeugUndAndere${i+1}`, character.tools?.[i] ?? '');
  }

  // --- Währung ---
  t('KM', character.currency?.km ?? '');
  t('SM', character.currency?.sm ?? '');
  t('EM', character.currency?.em ?? '');
  t('GM', character.currency?.gm ?? '');
  t('PM', character.currency?.pm ?? '');
  // Gesamtlast automatisch aus Anzahl × Gewicht/Stück (siehe inventoryWeight).
  const gesamtlast = totalWeightKg(character.inventory ?? []);
  t('Gesamtlast', gesamtlast > 0 ? formatKg(gesamtlast) : '');

  // --- Inventar (55 Slots) ---
  for (let i = 0; i < 55; i++) {
    const item = character.inventory?.[i];
    const lineKg = item ? lineWeightKg(item) : 0;
    t(`Inventar${i+1}`, item?.name ?? '');
    t(`InventarAnz${i+1}`, item?.count ?? '');
    t(`InventarGew${i+1}`, lineKg > 0 ? formatKg(lineKg) : '');
  }

  // --- Zauber ---
  const sp = character.spells;
  if (sp) {
    t('Zauberklasse', sp.spellcastingClass);
    t('AttributZauberwirken', sp.spellcastingAbility);
    t('ZauberRettungswurfSG', sp.saveDC || '');
    t('ZauberAngriffsbonus', sp.attackBonus || '');

    for (let lvl = 1; lvl <= 9; lvl++) {
      const slot = sp.slots?.[lvl - 1];
      t(`ZauberplätzeGesamt${lvl}`, slot?.total ?? '');
      t(`ZauberplätzeVerbraucht${lvl}`, slot?.used ?? '');
    }

    for (let i = 0; i < 8; i++) {
      t(`Zaubertrick${i+1}`, sp.cantrips?.[i]?.name ?? '');
    }

    for (let lvl = 1; lvl <= 9; lvl++) {
      const spells = sp.byLevel?.[String(lvl)] ?? [];
      const count = SPELL_COUNT[lvl];
      for (let i = 0; i < count; i++) {
        const spell = spells[i];
        t(`Zauber${lvl}_${i+1}`, spell?.name ?? '');
        c(`ZauberActive${lvl}_${i+1}`, spell?.prepared ?? false);
      }
    }
  }

  // --- Freitext als zusätzliche Seite(n) anhängen ---
  if (options.freitext?.trim()) {
    await appendMarkdownPages(pdf, options.freitext, { title: character.name });
  }

  const bytes = await pdf.save();
  return bytes;
}
