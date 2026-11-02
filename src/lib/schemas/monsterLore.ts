/**
 * Beschreibung einer Monsterfamilie (ein Kapitel des Monster Manual) als Ergänzung zu den
 * Monsterdateien: die Statblöcke bleiben, wo sie sind, die Familie verweist auf sie.
 */
import { z } from 'zod';
import { sourceField } from './source';

export const monsterLoreEntrySchema = z.object({
  slug: z.string().describe('Dateiname des Monsters ohne `.json` — seine Identität im Vault.'),
  intro: z.string().default('').describe('Einleitung des einzelnen Statblocks (Markdown, englisch).'),
  introDe: z.string().optional(),
});

export const monsterLoreSchema = z.object({
  key: z.string().describe('{source}_{slug(name)}, z.B. "mm-2024_animated-objects".'),
  source: sourceField(),
  name: z.string().describe('Englischer Kapitelname.'),
  nameDe: z.string().optional(),
  tagline: z.string().default(''),
  taglineDe: z.string().optional(),
  habitat: z.string().default(''),
  habitatDe: z.string().optional(),
  treasure: z.string().default(''),
  treasureDe: z.string().optional(),
  intro: z.string().default('').describe('Familientext samt Tabellen, Zitaten und Hort-Abschnitten (Markdown, englisch).'),
  introDe: z.string().optional(),
  monsters: z.array(monsterLoreEntrySchema).default([]),
});

export type MonsterLore = z.infer<typeof monsterLoreSchema>;
export type MonsterLoreEntry = z.infer<typeof monsterLoreEntrySchema>;
