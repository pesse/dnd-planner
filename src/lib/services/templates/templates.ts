/**
 * Vorlagen aus Packs. Eine Vorlage wird kopiert, nie selbst bespielt: so trifft ein
 * Pack-Update keinen Spielstand, und dieselbe Kampagne lässt sich mehrfach starten.
 */
import { invoke } from '@tauri-apps/api/core';
import { campaignTemplateSchema, type CampaignTemplate } from '../../schemas/template';
import { CHARACTERS_PATH, freshCharacterUid } from '../characterDirectory';
import { replaceFrontmatterCharacters } from '../../utils/frontmatter';

const TEMPLATES_PATH = './vault/templates';
const CAMPAIGN_TEMPLATES = `${TEMPLATES_PATH}/campaigns`;
const CHARACTER_TEMPLATES = `${TEMPLATES_PATH}/characters`;
const CAMPAIGNS_PATH = './vault/campaigns';
const MANIFEST = 'template.json';

export interface CampaignTemplateRef extends CampaignTemplate {
  id: string;
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

/** Ordner ohne lesbares `template.json` sind keine Vorlage und fehlen in der Liste. */
export async function listCampaignTemplates(): Promise<CampaignTemplateRef[]> {
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

/** Kopiert eine Charakter-Vorlage in einen neuen UID-Ordner und liefert die UID. */
export async function instantiateCharacterTemplate(id: string): Promise<string> {
  const uid = await freshCharacterUid();
  const dir = `${CHARACTERS_PATH}/${uid}`;
  await invoke('copy_dir', { from: `${CHARACTER_TEMPLATES}/${id}`, to: dir });
  const path = `${dir}/character.json`;
  const json = JSON.parse(await invoke<string>('read_file_content', { path }));
  await invoke('write_file_content', { path, content: JSON.stringify({ ...json, uid }, null, 2) });
  return uid;
}

/** `hellfire-club`, sonst `hellfire-club-2`, `-3` … */
export function freeName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Legt die Kampagne an und liefert ihren Ordnernamen. */
export async function instantiateCampaignTemplate(template: CampaignTemplateRef, withCharacters: boolean): Promise<string> {
  const slug = freeName(template.id, new Set(await subdirs(CAMPAIGNS_PATH)));
  const dir = `${CAMPAIGNS_PATH}/${slug}`;
  await invoke('copy_dir', { from: `${CAMPAIGN_TEMPLATES}/${template.id}`, to: dir });
  await invoke('delete_path', { path: `${dir}/${MANIFEST}` });

  const uids = withCharacters ? await Promise.all(template.characters.map(instantiateCharacterTemplate)) : [];
  const campaignMd = `${dir}/campaign.md`;
  const md = await invoke<string>('read_file_content', { path: campaignMd });
  await invoke('write_file_content', { path: campaignMd, content: replaceFrontmatterCharacters(md, uids) });
  return slug;
}
