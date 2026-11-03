/**
 * Vorlagen aus Packs. Eine Vorlage wird kopiert, nie selbst bespielt: so trifft ein
 * Pack-Update keinen Spielstand, und dieselbe Kampagne lässt sich mehrfach starten.
 */
import { invoke } from '@tauri-apps/api/core';
import { campaignTemplateSchema, type CampaignTemplate } from '../../schemas/template';
import { CHARACTERS_PATH, freshCharacterUid } from '../characterDirectory';
import { replaceFrontmatterCharacters } from '../../utils/frontmatter';
import { characterAssetSrc } from '../characterSideFiles.svelte';
import type { CampaignProgress } from '../../schemas/campaignProgress';
import { setChapterCompleted, writeProgress } from './chapters';

const TEMPLATES_PATH = './vault/templates';
const CAMPAIGN_TEMPLATES = `${TEMPLATES_PATH}/campaigns`;
const CHARACTER_TEMPLATES = `${TEMPLATES_PATH}/characters`;
const CAMPAIGNS_PATH = './vault/campaigns';
const MANIFEST = 'template.json';
const LEVELS = 'levels';

export interface CampaignTemplateRef extends CampaignTemplate {
  id: string;
  /** Spoilerfreie Ausgabe für Spieler, falls die Vorlage eine mitbringt. */
  player?: CampaignTemplateRef;
}

interface EntryInfo {
  name: string;
  is_dir: boolean;
}

async function subdirs(path: string): Promise<string[]> {
  try {
    const entries = await invoke<EntryInfo[]>('list_entries', { path });
    return entries.filter((e) => e.is_dir).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Ordner ohne lesbares `template.json` sind keine Vorlage und fehlen in der Liste. Eine
 * Spieler-Ausgabe hängt an ihrer Spielleiter-Vorlage; fehlt die, steht sie für sich.
 */
export async function listCampaignTemplates(): Promise<CampaignTemplateRef[]> {
  const all = await readCampaignTemplates();
  const byId = new Map(all.map((t) => [t.id, t]));
  const attached = new Set<string>();
  for (const t of all) {
    const gm = t.playerEditionOf ? byId.get(t.playerEditionOf) : undefined;
    if (gm && !gm.playerEditionOf) {
      gm.player = t;
      attached.add(t.id);
    }
  }
  return all.filter((t) => !attached.has(t.id));
}

async function readCampaignTemplates(): Promise<CampaignTemplateRef[]> {
  const refs = await Promise.all(
    (await subdirs(CAMPAIGN_TEMPLATES)).map(async (id) => {
      try {
        const raw = await invoke<string>('read_file_content', { path: `${CAMPAIGN_TEMPLATES}/${id}/${MANIFEST}` });
        return { id, ...campaignTemplateSchema.parse(JSON.parse(raw)) };
      } catch {
        return null;
      }
    }),
  );
  return refs.filter((r): r is CampaignTemplateRef => r !== null).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export interface TemplateLevel {
  level: number;
  classLevel: string;
}

export interface CharacterTemplateRef {
  id: string;
  name: string;
  classLevel: string;
  /** Aufsteigend, beginnt immer mit Stufe 1 aus `character.json`. */
  levels: TemplateLevel[];
  species: string;
  /** Leer ohne Porträt. */
  portraitSrc: string;
  /** Titel der Kampagnen-Vorlage, die den Charakter mitbringt; leer für lose Vorlagen. */
  campaign: string;
}

/** Sortiert nach Kampagne, dann Name; eine unlesbare Vorlage fehlt in der Liste. */
export async function listCharacterTemplates(): Promise<CharacterTemplateRef[]> {
  const campaignOf = new Map<string, string>();
  for (const t of await listCampaignTemplates()) for (const id of t.characters) campaignOf.set(id, t.name);
  const refs = await Promise.all(
    (await subdirs(CHARACTER_TEMPLATES)).map(async (id): Promise<CharacterTemplateRef | null> => {
      const dir = `${CHARACTER_TEMPLATES}/${id}`;
      try {
        const c = JSON.parse(await invoke<string>('read_file_content', { path: `${dir}/character.json` }));
        const classLevel = String(c.classLevel ?? '');
        return {
          id,
          name: String(c.name ?? id),
          classLevel,
          levels: [{ level: 1, classLevel }, ...(await higherLevels(dir))],
          species: String(c.species?.name ?? c.race ?? ''),
          portraitSrc: c.portraitFile ? await characterAssetSrc(dir, c.portraitFile) : '',
          campaign: campaignOf.get(id) ?? '',
        };
      } catch {
        return null;
      }
    }),
  );
  return refs
    .filter((r): r is CharacterTemplateRef => r !== null)
    .sort((a, b) => a.campaign.localeCompare(b.campaign, 'de') || a.name.localeCompare(b.name, 'de'));
}

async function higherLevels(dir: string): Promise<TemplateLevel[]> {
  let entries: EntryInfo[];
  try {
    entries = await invoke<EntryInfo[]>('list_json_entries', { path: `${dir}/${LEVELS}` });
  } catch {
    return [];
  }
  const levels = await Promise.all(
    entries.map(async (e): Promise<TemplateLevel | null> => {
      const level = Number(/^(\d+)\.json$/.exec(e.name)?.[1]);
      if (e.is_dir || !(level > 1)) return null;
      try {
        const c = JSON.parse(await invoke<string>('read_file_content', { path: `${dir}/${LEVELS}/${e.name}` }));
        return { level, classLevel: String(c.classLevel ?? '') };
      } catch {
        return null;
      }
    }),
  );
  return levels.filter((l): l is TemplateLevel => l !== null).sort((a, b) => a.level - b.level);
}

/**
 * Kopiert eine Charakter-Vorlage in einen neuen UID-Ordner und liefert die UID. Eine Stufe über 1
 * nimmt `levels/<stufe>.json`, sofern die Vorlage sie führt — sonst bleibt es bei Stufe 1.
 */
export async function instantiateCharacterTemplate(id: string, level = 1): Promise<string> {
  const uid = await freshCharacterUid();
  const dir = `${CHARACTERS_PATH}/${uid}`;
  await invoke('copy_dir', { from: `${CHARACTER_TEMPLATES}/${id}`, to: dir });
  const path = `${dir}/character.json`;
  const read = (p: string) => invoke<string>('read_file_content', { path: p });
  const raw = level > 1 ? await read(`${dir}/${LEVELS}/${level}.json`).catch(() => read(path)) : await read(path);
  await invoke('write_file_content', { path, content: JSON.stringify({ ...JSON.parse(raw), uid }, null, 2) });
  await invoke('delete_path', { path: `${dir}/${LEVELS}` }).catch(() => {});
  return uid;
}

/** `hellfire-club`, sonst `hellfire-club-2`, `-3` … */
export function freeName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export interface CampaignTemplateOptions {
  /** Charakter-Vorlagen, in der Reihenfolge, in der sie in der Kampagne stehen sollen. */
  characters: string[];
  /**
   * `id` des Abenteuers, mit dem die Gruppe einsteigt: Es bestimmt die Stufe der Figuren, und
   * die Abenteuer davor gelten als abgeschlossen. Fehlt es, beginnt sie beim ersten.
   */
  startChapter?: string;
}

/** Legt die Kampagne an und liefert ihren Ordnernamen. */
export async function instantiateCampaignTemplate(template: CampaignTemplateRef, options: CampaignTemplateOptions): Promise<string> {
  const slug = freeName(template.id, new Set(await subdirs(CAMPAIGNS_PATH)));
  const dir = `${CAMPAIGNS_PATH}/${slug}`;
  await invoke('copy_dir', { from: `${CAMPAIGN_TEMPLATES}/${template.id}`, to: dir });
  await invoke('delete_path', { path: `${dir}/${MANIFEST}` });

  const start = Math.max(0, template.chapters.findIndex((c) => c.id === options.startChapter));
  const level = template.chapters[start]?.level ?? 1;
  if (template.chapters.length) {
    let progress: CampaignProgress = { template: template.id, completed: [] };
    await writeProgress(slug, progress);
    for (const chapter of template.chapters.slice(0, start)) progress = await setChapterCompleted(slug, progress, chapter.id, true);
  }

  const uids = await Promise.all(options.characters.map((id) => instantiateCharacterTemplate(id, level)));
  const campaignMd = `${dir}/campaign.md`;
  const md = await invoke<string>('read_file_content', { path: campaignMd });
  await invoke('write_file_content', { path: campaignMd, content: replaceFrontmatterCharacters(md, uids) });
  return slug;
}
