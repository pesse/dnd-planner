/**
 * Was ein Charakter am Zauberwirken SPEICHERT: geteilte Ressourcen und je Quelle die
 * Entscheidungen des Spielers. Kontingente, Pools, Slots und SG entstehen beim Laden
 * (`services/spellcasting/`).
 */
import { z } from 'zod';

/** Ein Zauber wird über `spell.key` verlinkt, nie über den Namen. */
const spellKeySchema = z.string().min(1);

/** Nicht pro Quelle: im Multiclass speisen alle Klassen denselben Pool. */
export const spellcastingPoolsSchema = z.object({
  standard: z
    .object({ used: z.array(z.number().int().min(0)).default([]).describe('Index 0 = Grad 1.') })
    .default({ used: [] }),
  pact: z.object({ used: z.number().int().min(0).default(0) }).default({ used: 0 }),
});

/**
 * Quellenbesitz, geschlüsselt nach `CastingSource.id`. Verwaiste Blöcke bleiben stehen: eine
 * beim Laden nicht auflösbare Bibliothek löschte sonst die Auswahl.
 *
 * Zauberattribut und Zauberliste stehen NICHT hier, sondern als Antwort im Merkmals-Ledger
 * (`character.features`): sie sind Wahlen des Merkmals, und `spellcasting/resolve.ts` verengt
 * die Quelle damit. Ein zweiter Ort dafür lief auseinander — siehe Upgrade-Schritt 7.
 */
export const castingSourceStateSchema = z.object({
  picks: z.record(z.string(), z.array(spellKeySchema)).default({}).describe('Zauber-Keys je Quota-Id.'),
  uses: z.record(z.string(), z.number().int().min(0)).default({}).describe('Verbrauchte freie Wirkungen je Quota-Id.'),
});

export const characterSpellcastingSchema = z.object({
  pools: spellcastingPoolsSchema.default({ standard: { used: [] }, pact: { used: 0 } }),
  sources: z.record(z.string(), castingSourceStateSchema).default({}),
  /** Ausweg für Homebrew-Klassen ohne Progression im Vault. */
  manual: z
    .object({
      slotTotals: z.array(z.number().int().min(0)).default([]),
      extra: z.array(spellKeySchema).default([]).describe('Zauber ohne Quelle, als Keys.'),
    })
    .optional(),
});

/** FUNKTIONS-Default: eine Literal-Vorgabe wäre EIN Objekt für alle geparsten Charaktere. */
export const emptyCharacterSpellcasting = (): CharacterSpellcasting => ({
  pools: { standard: { used: [] }, pact: { used: 0 } },
  sources: {},
});

export type CastingSourceState = z.infer<typeof castingSourceStateSchema>;
export type CharacterSpellcasting = z.infer<typeof characterSpellcastingSchema>;
