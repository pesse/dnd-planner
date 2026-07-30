/**
 * Inventur der Klassenmerkmale, die den Spieler ZAUBER wählen lassen — OHNE LLM.
 *
 * Zweck: die spell-pick-Regel im Analyse-Prompt hat Kunden, und dieser Test benennt sie.
 * Fällt ein neues Merkmal durch einen Re-Import herein, bricht er und erzwingt eine
 * Einordnung, statt die Regel stillschweigend über- oder unterdeckt zu lassen.
 * Begründung der Einordnungen: `docs/plan-zauberwirker-vereinfachung.md` (Stufe 2).
 *
 *   npm run eval -- --eval spellChoiceCoverage
 */
import { describe, expect, it } from 'vitest';
import { getClasses } from '../src/lib/classLibrary';
import { getProgressionByKey } from '../src/lib/services/classProgression';
import type { ClassFeature } from '../src/lib/schemas/classProgression';
import { isFlowOwnedChoiceFeature } from '../src/lib/services/levelUp';
import { withoutSpellGrantFeatures } from '../src/lib/services/grantedSpells';
import { isSpellAccessFeature } from '../src/lib/services/spellAccess';

/**
 * Weites Netz: irgendein Wähl-Verb in der Nähe von „spell"/„cantrip". Bewusst großzügig —
 * es soll Kandidaten FINDEN, die Einordnung darunter trifft die Entscheidung.
 */
const MENTIONS_SPELL_CHOICE = (desc: string): boolean =>
  /\b(choose|choosing|select|replace)\b[^.]{0,120}\b(spell|cantrip)/i.test(desc) ||
  /\b(spell|cantrip)s?\b[^.]{0,80}\b(of your choice|you choose)/i.test(desc);

/**
 * Einordnung jedes Fundes. Nur `pick` ist eine Aufbau-Wahl, die auf den Bogen gehört und
 * damit Kundschaft der spell-pick-Regel; alles andere fällt am Tisch oder ist keine Zauberwahl.
 */
type Verdict =
  /** Aufbau-Wahl: N Zauber dauerhaft, gehört auf den Bogen → braucht die Prompt-Regel. */
  | 'pick'
  /** Wahl im Moment des Wirkens — nichts wird gespeichert (Regel K1: nicht ins Manifest). */
  | 'cast-time'
  /** Es geht um Zauberplätze, nicht um Zauber. */
  | 'slots'
  /** Tausch bei einer Rast/Stufe, kein neuer Zauber. */
  | 'swap'
  /** Der Flow führt die Wahl selbst (`grantsChoice`), sie erreicht die KI nie. */
  | 'flow-owned'
  /** Erweitert nur die Liste, aus der die KLASSE ihre Zauber vorbereitet — kein eigenes Kontingent. */
  | 'list-widening'
  /** Wählt etwas anderes als Zauber. */
  | 'not-spells';

const VERDICTS: Record<string, Verdict> = {
  // ── Aufbau-Wahlen: die sechs Kunden der Prompt-Regel ──────────────────────────
  'srd-2024_college-of-lore_magical-discoveries': 'pick', // 2 Zauber aus Kleriker/Druide/Magier
  'srd-2024_warlock_mystic-arcanum': 'pick', // 1 Hexenmeister-Zauber, Grad 6/7/8/9 je Stufe
  'srd-2024_wizard_evoker_evocation-savant': 'pick', // 2 Magier-Zauber der Schule Hervorrufung
  'srd-2024_wizard_signature-spells': 'pick', // 2 Grad-3-Zauber AUS DEM ZAUBERBUCH
  'srd-2024_wizard_spell-mastery': 'pick', // je 1 Zauber Grad 1 und 2 aus dem Zauberbuch
  'srd-2024_bard_magical-secrets': 'list-widening', // kein Kontingent, nur mehr zulässige Listen

  // ── Am Tisch, nicht beim Aufstieg ─────────────────────────────────────────────
  'srd-2024_cleric_divine-intervention': 'cast-time',
  'srd-2024_cleric_greater-divine-intervention': 'cast-time',
  'srd-2024_wizard_evoker_sculpt-spells': 'cast-time', // wählt Kreaturen, nicht Zauber
  'srd-2024_druid_circle-of-the-land_natural-recovery': 'slots',
  'srd-2024_druid_circle-of-the-land_natures-sanctuary': 'slots',
  'srd-2024_wizard_arcane-recovery': 'slots',
  'srd-2024_druid_archdruid': 'slots',
  'srd-2024_wizard_memorize-spell': 'swap',

  // ── Keine Zauberwahl / vom Flow geführt ───────────────────────────────────────
  'srd-2024_sorcerer_metamagic': 'not-spells', // Metamagie-Optionen
  'srd-2024_bard_spellcasting': 'flow-owned',
  'srd-2024_cleric_spellcasting': 'flow-owned',
  'srd-2024_druid_spellcasting': 'flow-owned',
  'srd-2024_paladin_spellcasting': 'flow-owned',
  'srd-2024_ranger_spellcasting': 'flow-owned',
  'srd-2024_sorcerer_spellcasting': 'flow-owned',
  'srd-2024_wizard_spellcasting': 'flow-owned',
  'srd-2024_warlock_pact-magic': 'flow-owned',
  'srd-2024_paladin_fighting-style': 'flow-owned',
  'srd-2024_ranger_fighting-style': 'flow-owned',
};

/** Alle Merkmale aller Vault-Klassen, mit ihrem Klassen-Key. */
async function allFeatures(): Promise<{ classKey: string; f: ClassFeature }[]> {
  const out: { classKey: string; f: ClassFeature }[] = [];
  for (const c of await getClasses()) {
    if (!c.key) continue;
    const prog = await getProgressionByKey(c.key);
    for (const f of prog?.features ?? []) out.push({ classKey: c.key, f });
  }
  return out;
}

const label = (classKey: string, f: ClassFeature) => `${classKey} :: ${f.name}`;

describe('Zauber-Wahlen im Klassen-Bestand (Stufe-2-Inventur)', () => {
  it('ordnet jeden Fund ein — ein neues Merkmal bricht hier, nicht still im Prompt', async () => {
    const all = await allFeatures();
    expect(all.length, 'Vault-Shim aktiv?').toBeGreaterThan(100);

    const unclassified = all
      .filter(({ f }) => MENTIONS_SPELL_CHOICE(f.desc ?? ''))
      .filter(({ f }) => !(f.key && f.key in VERDICTS))
      .map(({ classKey, f }) => `${label(classKey, f)} (key=${f.key})`);

    expect(unclassified).toEqual([]);
  });

  it('kennt genau fünf Aufbau-Wahlen, und keine davon ist deklariert', async () => {
    const all = await allFeatures();
    const picks = all.filter(({ f }) => f.key && VERDICTS[f.key] === 'pick');

    expect(picks.map(({ classKey, f }) => label(classKey, f)).sort()).toEqual([
      'srd-2024_college-of-lore :: Magical Discoveries',
      'srd-2024_evoker :: Evocation Savant',
      'srd-2024_warlock :: Mystic Arcanum',
      'srd-2024_wizard :: Signature Spells',
      'srd-2024_wizard :: Spell Mastery',
    ]);

    // Deklarieren würde sie STILL VERLIEREN: `isFlowOwnedChoiceFeature` wirft jedes Merkmal
    // mit `grantsChoice` aus dem KI-Eingang, und für Klassenmerkmale fragt niemand den
    // Zugang ab (nur der Talent-Pfad tut das). Erst ein Verbraucher, dann die Deklaration.
    for (const { classKey, f } of picks) {
      expect(f.grantsChoice, label(classKey, f)).toBeUndefined();
      expect(isSpellAccessFeature(f), label(classKey, f)).toBe(false);
    }
  });

  it('lässt alle fünf durch die Filter bis in den KI-Eingang', async () => {
    const all = await allFeatures();
    const picks = all.filter(({ f }) => f.key && VERDICTS[f.key] === 'pick');

    for (const { classKey, f } of picks) {
      const l = label(classKey, f);
      // Genau die zwei Filter, die `gainedFeaturesFor` vor die Deutung setzt.
      expect(isFlowOwnedChoiceFeature(f), `${l}: flow-owned?`).toBe(false);
      expect(withoutSpellGrantFeatures([f]), `${l}: als Zauberliste erkannt?`).toHaveLength(1);
    }
  });
});
