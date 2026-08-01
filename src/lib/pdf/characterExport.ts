/**
 * PDF-Export für Charaktere — Taendler v2.8.x Format.
 * Füllt die Blanko-Vorlage vault/templates/ataendler_v2.8.2.pdf per Form-Filling (pdf-lib).
 */
import { PDFDocument, PDFCheckBox, PDFTextField, PDFButton, PDFImage, PDFPage } from 'pdf-lib';
import type { CharacterJSON } from './characterFields';
import { SPELL_FIELDS_PER_LEVEL, withSpellValues } from './characterFields';
import { SKILL_DEFS } from '../domain/skills';
import type { SpellAccessValues } from '../services/spellAccess';
import { appendMarkdownPages } from './markdownPdf';
import { lineWeightKg, totalWeightKg, formatKg } from '../utils/inventoryWeight';

export interface PortraitInput {
  bytes: Uint8Array;
  format: 'png' | 'jpg';
}

export type PdfExportFormat = 'taendler_v2_8';

function setText(doc: PDFDocument, fieldName: string, value: string) {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFTextField) {
      field.setText(value ?? '');
    }
  } catch { /* Feld nicht vorhanden → ignorieren */ }
}

/**
 * Feste Schriftgröße nötig: das Taendler-PDF setzt /Sz 0 (Auto-Fit), und pdf-lib bäckt
 * beim Speichern Appearance-Streams ein — bei wenig Text im großen Feld riesig.
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
 * Bild als Seiteninhalt an die Position des Button-Feldes, dann den Button entfernen.
 * Nicht `PDFButton.setImage`: dessen Icon-Appearances rendern viele Viewer (Adobe,
 * Browser, Preview) nicht, gezeichneter Seiteninhalt dagegen immer — auch beim Flatten.
 */
function drawImageIntoButtonField(doc: PDFDocument, fieldName: string, image: PDFImage) {
  const form = doc.getForm();
  const field = form.getField(fieldName);
  if (!(field instanceof PDFButton)) return;
  const widget = field.acroField.getWidgets()[0];
  if (!widget) return;
  const rect = widget.getRectangle();
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
  const fit = image.scaleToFit(rect.width, rect.height);
  targetPage.drawImage(image, {
    x: rect.x + (rect.width - fit.width) / 2,
    y: rect.y + (rect.height - fit.height) / 2,
    width: fit.width,
    height: fit.height,
  });
  form.removeField(field); // nimmt den Platzhalter „Hier klicken um Bild auszuwählen" mit

}

/**
 * Feld 1 zuerst füllen, Rest nach Feld 2. `limit` ist die sichtbare Kapazität von Feld 1
 * in der Taendler-Vorlage; die Fallback-Kette verhindert, dass ein Block ohne Absätze
 * komplett in Feld 1 überläuft.
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
 * „Langschwert" → „Langschwert (Auslaugen)". Aufgelöst wird NICHT hier: der Aufrufer reicht
 * denselben Resolver herein, der die Pille auf dem Bogen zeichnet — so laufen PDF und Bogen
 * nicht auseinander und das Modul bleibt frei von Bibliotheks-Zugriffen.
 */
function withMasterySuffix(name: string, resolve?: (attackName: string) => string | undefined): string {
  const label = name.trim() ? resolve?.(name) : undefined;
  return label ? `${name} (${label})` : name;
}

/** Die drei Schreibarten eines Formularfeldes: Text, mehrzeiliger Text, Häkchen. */
interface FieldSink {
  t: (key: string, value: string | number) => void;
  m: (key: string, value: string, fontSize?: number) => void;
  c: (key: string, checked: boolean) => void;
}

function fieldSink(doc: PDFDocument): FieldSink {
  return {
    t: (key, value) => setText(doc, key, String(value ?? '')),
    m: (key, value, fontSize) => setMultilineText(doc, key, value ?? '', fontSize),
    c: (key, checked) => setCheck(doc, key, checked),
  };
}

function writeHead({ t }: FieldSink, ch: CharacterJSON) {
  t('Charaktername_page1', ch.name);
  t('Charaktername_page2', ch.name);
  t('KlasseUndStufe', ch.classLevel);
  t('Spielername', ch.playerName);
  t('Hintergrund', ch.background);
  t('Volk', ch.race);
  t('Erfahrungspunkte', ch.xp);
}

function writeAbilities({ t }: FieldSink, ch: CharacterJSON) {
  t('Str', ch.str); t('StrMod', ch.strMod);
  t('Ges', ch.ges); t('GesMod', ch.gesMod);
  t('Kon', ch.kon); t('KonMod', ch.konMod);
  t('Int', ch.int); t('IntMod', ch.intMod);
  t('Wei', ch.wei); t('WeiMod', ch.weiMod);
  t('Cha', ch.cha); t('ChaMod', ch.chaMod);
}

function writeCombat({ t }: FieldSink, ch: CharacterJSON) {
  t('Übungsbonus', ch.proficiencyBonus);
  t('Rüstungsklasse', ch.ac);
  t('Initiative', ch.initiative);
  t('Bewegungsrate', ch.speed);
  t('TrefferpunkteMaximum', ch.hpMax);
  t('AktTrefferpunkte', ch.hpCurrent);
  t('TempTrefferpunkte', ch.hpTemp);
  t('Trefferwürfel', ch.hitDice);
  t('PassiveWeisheit', ch.passivePerception);
}

/**
 * Häkchen UND gerechneter Wert — das PDF hat für den Rettungswurf beides. Erst alle sechs
 * Häkchen, dann alle sechs Werte: das ist die Feldreihenfolge des Originalbogens und darf
 * nicht zu einer Schleife zusammengezogen werden.
 */
function writeSaves({ t, c }: FieldSink, ch: CharacterJSON) {
  const pb = ch.proficiencyBonus;
  const rows = [
    ['Str', ch.strMod, ch.strSaveProf],
    ['Ges', ch.gesMod, ch.gesSaveProf],
    ['Kon', ch.konMod, ch.konSaveProf],
    ['Int', ch.intMod, ch.intSaveProf],
    ['Wei', ch.weiMod, ch.weiSaveProf],
    ['Cha', ch.chaMod, ch.chaSaveProf],
  ] as const;
  for (const [key, abilityMod, proficient] of rows) c(`${key}Prof`, proficient);
  for (const [key, abilityMod, proficient] of rows) t(`${key}RW`, abilityMod + (proficient ? pb : 0));
}

function writeSkills({ t, c }: FieldSink, ch: CharacterJSON) {
  c('Alleskoenner', ch.alleskoenner);
  for (const skill of SKILL_DEFS) {
    const entry = ch.skills?.[skill.key];
    if (!entry) continue;
    c(skill.profField, entry.prof);
    c(skill.expField, entry.exp);
    t(skill.valField, entry.value);
  }
}

/**
 * Die Meisterschaftseigenschaft hängt am Waffennamen: das Taendler-PDF hat keine
 * freie Spalte dafür. Der Import schneidet das Suffix wieder ab
 * (`stripMasterySuffix`), sonst wüchse es bei jedem Zyklus an.
 */
function writeAttacks({ t }: FieldSink, ch: CharacterJSON, masteryOf?: (attackName: string) => string | undefined) {
  for (let i = 0; i < 5; i++) {
    const atk = ch.attacks?.[i];
    t(`Angriff${i+1}`, withMasterySuffix(atk?.name ?? '', masteryOf));
    t(`Bonus${i+1}`, atk?.bonus ?? '');
    t(`Schaden${i+1}`, atk?.damage ?? '');
    t(`Schadentyp${i+1}`, atk?.type ?? '');
    t(`Reichweite${i+1}`, atk?.range ?? '');
  }
}

/**
 * Die Zauberwerte eines Merkmals-Zugangs hängen an der Notizzeile, weil das PDF nur EINEN
 * Zauberblock hat und der der Klasse gehört — eingesetzt VOR dem Trennen, sonst verschwindet
 * die Marke hinter Feld 2 statt am Überlauf teilzunehmen.
 */
function writeClassFeatures({ m }: FieldSink, ch: CharacterJSON, spellAccess: SpellAccessValues[]) {
  const [a, b] = splitClassFeatures(withSpellValues(ch.classFeatures ?? '', spellAccess));
  m('Klassenmerkmale1', a, 9);
  m('Klassenmerkmale2', b, 9);
}

function writePersonality({ m }: FieldSink, ch: CharacterJSON) {
  m('Persönlichkeitsmerkmale', ch.traits ?? '', 9);
  m('Ideale', ch.ideals ?? '', 9);
  m('Bindungen', ch.bonds ?? '', 9);
  m('Makel', ch.flaws ?? '', 9);
}

function writePersonal({ t, m }: FieldSink, ch: CharacterJSON) {
  const p = ch.personal;
  if (!p) return;
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

function writeProficiencies({ t, c }: FieldSink, ch: CharacterJSON) {
  const pr = ch.proficiencies;
  if (!pr) return;
  c('EinfachWaffenProf', pr.simpleWeapons);
  c('KriegswaffenProf', pr.martialWeapons);
  t('SonstigeWaffen', pr.otherWeapons ?? '');
  c('SonstigeWaffenProf', (pr.otherWeapons ?? '').trim() !== '');
  c('LeichteRüstungProf', pr.lightArmor);
  c('MittlereRüstungProf', pr.mediumArmor);
  c('SchwereRüstungProf', pr.heavyArmor);
  c('SchildeProf', pr.shields);
}

async function writePortrait(doc: PDFDocument, portrait?: PortraitInput) {
  if (!portrait) return;
  try {
    const image = portrait.format === 'png'
      ? await doc.embedPng(portrait.bytes)
      : await doc.embedJpg(portrait.bytes);
    drawImageIntoButtonField(doc, 'AussehenBild', image);
  } catch { /* Portrait-Embed fehlgeschlagen → ignorieren */ }
}

function writeLanguagesAndTools({ t }: FieldSink, ch: CharacterJSON) {
  for (let i = 0; i < 6; i++) {
    t(`Sprache${i+1}`, ch.languages?.[i] ?? '');
    t(`WerkzeugUndAndere${i+1}`, ch.tools?.[i] ?? '');
  }
}

/** Gesamtlast automatisch aus Anzahl × Gewicht/Stück (siehe inventoryWeight). */
function writeCurrency({ t }: FieldSink, ch: CharacterJSON) {
  t('KM', ch.currency?.km ?? '');
  t('SM', ch.currency?.sm ?? '');
  t('EM', ch.currency?.em ?? '');
  t('GM', ch.currency?.gm ?? '');
  t('PM', ch.currency?.pm ?? '');
  const gesamtlast = totalWeightKg(ch.inventory ?? []);
  t('Gesamtlast', gesamtlast > 0 ? formatKg(gesamtlast) : '');
}

function writeInventory({ t }: FieldSink, ch: CharacterJSON) {
  for (let i = 0; i < 55; i++) {
    const item = ch.inventory?.[i];
    const lineKg = item ? lineWeightKg(item) : 0;
    t(`Inventar${i+1}`, item?.name ?? '');
    t(`InventarAnz${i+1}`, item?.count ?? '');
    t(`InventarGew${i+1}`, lineKg > 0 ? formatKg(lineKg) : '');
  }
}

function writeSpells({ t, c }: FieldSink, ch: CharacterJSON) {
  const sp = ch.spells;
  if (!sp) return;
  t('Zauberklasse', sp.spellcastingClass);
  t('AttributZauberwirken', sp.spellcastingAbility);
  t('ZauberRettungswurfSG', sp.saveDC || '');
  t('ZauberAngriffsbonus', sp.attackBonus || '');

  for (let lvl = 1; lvl <= 9; lvl++) {
    const slot = sp.slots?.[lvl - 1];
    t(`ZauberplätzeGesamt${lvl}`, slot?.total ?? '');
    t(`ZauberplätzeVerbraucht${lvl}`, slot?.used ?? '');
  }

  for (let i = 0; i < 8; i++) t(`Zaubertrick${i+1}`, sp.cantrips?.[i]?.name ?? '');

  for (let lvl = 1; lvl <= 9; lvl++) {
    const spells = sp.byLevel?.[String(lvl)] ?? [];
    for (let i = 0; i < SPELL_FIELDS_PER_LEVEL[lvl]; i++) {
      const spell = spells[i];
      t(`Zauber${lvl}_${i+1}`, spell?.name ?? '');
      c(`ZauberActive${lvl}_${i+1}`, spell?.prepared ?? false);
    }
  }
}

async function appendFreitext(doc: PDFDocument, ch: CharacterJSON, freitext?: string) {
  if (freitext?.trim()) await appendMarkdownPages(doc, freitext, { title: ch.name });
}

/** Füllt die Blanko-Vorlage; jede Feldgruppe des Bogens ist eine Schreibfunktion. */
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
  const sink = fieldSink(pdf);

  writeHead(sink, character);
  writeAbilities(sink, character);
  writeCombat(sink, character);
  writeSaves(sink, character);
  writeSkills(sink, character);
  writeAttacks(sink, character, options.masteryOf);
  writeClassFeatures(sink, character, options.spellAccess ?? []);
  writePersonality(sink, character);
  writePersonal(sink, character);
  writeProficiencies(sink, character);
  await writePortrait(pdf, options.portrait);
  writeLanguagesAndTools(sink, character);
  writeCurrency(sink, character);
  writeInventory(sink, character);
  writeSpells(sink, character);
  await appendFreitext(pdf, character, options.freitext);

  return pdf.save();
}
