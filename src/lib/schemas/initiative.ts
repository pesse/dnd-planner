/** Wirkung auf den eigenen Initiativewurf. */
import { z } from 'zod';
import { saveBonusValueSchema } from './savingThrow';

export const initiativeEffectSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('bonus'), value: saveBonusValueSchema })
    .describe('Zuschlag (Aufmerksam: Übungsbonus; Fürchterlicher Lauerjäger: WEI-Modifikator).'),
  z.object({ kind: z.literal('advantage') }).describe('Vorteil auf Initiative (Attentat).'),
]);
export type InitiativeEffect = z.infer<typeof initiativeEffectSchema>;
