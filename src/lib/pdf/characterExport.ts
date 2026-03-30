/**
 * PDF-Export für Charaktere — Taendler v2.8.x Format.
 * Füllt die Blanko-Vorlage vault/templates/ataendler_v2.8.2.pdf per Form-Filling (pdf-lib).
 */
import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib';
import type { CharacterJSON } from './characterFields';
import { SKILL_DEFS } from './characterFields';

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

function setCheck(doc: PDFDocument, fieldName: string, checked: boolean) {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFCheckBox) {
      if (checked) field.check(); else field.uncheck();
    }
  } catch { /* Feld nicht vorhanden → ignorieren */ }
}

/**
 * Exportiert einen Charakter als ausgefülltes Taendler-PDF.
 * @param character  Der zu exportierende Charakter
 * @param templateBytes  Bytes der Blanko-Vorlage (ataendler_v2.8.2.pdf)
 */
export async function exportCharacterToPdf(
  character: CharacterJSON,
  templateBytes: Uint8Array,
  _format: PdfExportFormat = 'taendler_v2_8',
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);

  const t = (k: string, v: string | number) => setText(pdf, k, String(v ?? ''));
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

  // --- Rettungswürfe (Profizienzen + berechnete Werte) ---
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
  for (let i = 0; i < 5; i++) {
    const atk = character.attacks?.[i];
    t(`Angriff${i+1}`, atk?.name ?? '');
    t(`Bonus${i+1}`, atk?.bonus ?? '');
    t(`Schaden${i+1}`, atk?.damage ?? '');
    t(`Schadentyp${i+1}`, atk?.type ?? '');
    t(`Reichweite${i+1}`, atk?.range ?? '');
  }

  // --- Klassenmerkmale ---
  const features = character.classFeatures ?? '';
  const half = Math.ceil(features.length / 2);
  const splitIdx = features.indexOf('\n\n', half);
  if (splitIdx !== -1) {
    t('Klassenmerkmale1', features.slice(0, splitIdx).trim());
    t('Klassenmerkmale2', features.slice(splitIdx).trim());
  } else {
    t('Klassenmerkmale1', features);
  }

  // --- Persönlichkeit ---
  t('Persönlichkeitsmerkmale', character.traits);
  t('Ideale', character.ideals);
  t('Bindungen', character.bonds);
  t('Makel', character.flaws);

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
  t('Gesamtlast', character.totalWeight ?? '');
  t('SonstigeWaffen', character.inventoryNotes ?? '');

  // --- Inventar (55 Slots) ---
  for (let i = 0; i < 55; i++) {
    const item = character.inventory?.[i];
    t(`Inventar${i+1}`, item?.name ?? '');
    t(`InventarAnz${i+1}`, item?.count ?? '');
    t(`InventarGew${i+1}`, item?.weight ?? '');
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
      t(`Zaubertrick${i+1}`, sp.cantrips?.[i] ?? '');
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

  const bytes = await pdf.save();
  return bytes;
}
