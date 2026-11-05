/** Charaktervorlagen, die einer Kampagne gehören: Kopien der Pack-Figuren oder eigene, frei bearbeitbar. */
import { invoke } from '@tauri-apps/api/core';
import { CHARACTERS_PATH } from '../characterDirectory';
import { newUid } from '../../utils/uid';
import { slugToName } from '../../utils/text';
import { CHARACTER_TEMPLATES_SUBDIR, listCharacterTemplates, readCharacterTemplate, sortedTemplates, subdirs, type CharacterTemplateRef } from './templates';

const CAMPAIGNS_PATH = './vault/campaigns';

export const characterTemplatesDir = (campaign: string): string => `${CAMPAIGNS_PATH}/${campaign}/${CHARACTER_TEMPLATES_SUBDIR}`;

export async function listCampaignCharacterTemplates(campaign: string): Promise<CharacterTemplateRef[]> {
  const dir = characterTemplatesDir(campaign);
  const label = `Kampagne „${slugToName(campaign)}“`;
  return sortedTemplates(await Promise.all((await subdirs(dir)).map((id) => readCharacterTemplate(`${dir}/${id}`, id, label))));
}

/** Für „Neuer Charakter": erst die Vorlagen aller Kampagnen, dann die der Packs. */
export async function listOfferedCharacterTemplates(): Promise<CharacterTemplateRef[]> {
  const own = await Promise.all((await subdirs(CAMPAIGNS_PATH)).map(listCampaignCharacterTemplates));
  return [...own.flat(), ...(await listCharacterTemplates())];
}

/** Die Datei einer Stufe: Stufe 1 ist `character.json`, höhere liegen unter `levels/`. */
export const templateLevelPath = (ref: Pick<CharacterTemplateRef, 'dir'>, level: number): string =>
  level > 1 ? `${ref.dir}/levels/${level}.json` : `${ref.dir}/character.json`;

/** Ohne `uid`: die vergibt erst das Anlegen eines Charakters aus der Vorlage. */
export async function saveCharacterAsTemplate(campaign: string, uid: string): Promise<string> {
  const base = characterTemplatesDir(campaign);
  const taken = new Set(await subdirs(base));
  let id = newUid();
  while (taken.has(id)) id = newUid();
  const dir = `${base}/${id}`;
  await invoke('copy_dir', { from: `${CHARACTERS_PATH}/${uid}`, to: dir });
  const path = `${dir}/character.json`;
  const c = JSON.parse(await invoke<string>('read_file_content', { path }));
  await invoke('write_file_content', { path, content: JSON.stringify({ ...c, uid: '' }, null, 2) });
  return id;
}

export const deleteCharacterTemplate = (ref: Pick<CharacterTemplateRef, 'dir'>): Promise<void> => invoke('delete_path', { path: ref.dir });
