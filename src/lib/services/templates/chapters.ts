/**
 * Abenteuer einer Vorlage, die eine Kampagne abschließt. Ein abgeschlossenes Abenteuer liefert
 * aus `templates/chapters/<vorlage>/<abenteuer>/` nach, was die Spieler jetzt wissen dürfen.
 */
import { invoke } from '@tauri-apps/api/core';
import { campaignProgressSchema, type CampaignProgress } from '../../schemas/campaignProgress';
import { campaignTemplateSchema, type CampaignTemplate } from '../../schemas/template';

const CAMPAIGNS_PATH = './vault/campaigns';
const CAMPAIGN_TEMPLATES = './vault/templates/campaigns';
const CHAPTERS_PATH = './vault/templates/chapters';
const PROGRESS = 'progress.json';

interface EntryInfo {
  name: string;
  is_dir: boolean;
}

const progressPath = (slug: string) => `${CAMPAIGNS_PATH}/${slug}/${PROGRESS}`;

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await invoke<string>('read_file_content', { path }));
  } catch {
    return null;
  }
}

/** `null` für Kampagnen, die nicht aus einer Vorlage stammen. */
export async function readProgress(slug: string): Promise<CampaignProgress | null> {
  const r = campaignProgressSchema.safeParse(await readJson(progressPath(slug)));
  return r.success ? r.data : null;
}

export async function writeProgress(slug: string, progress: CampaignProgress): Promise<void> {
  await invoke('write_file_content', { path: progressPath(slug), content: JSON.stringify(progress, null, 2) + '\n' });
}

/** `null`, wenn das Pack der Vorlage nicht (mehr) installiert ist. */
export async function readCampaignTemplate(id: string): Promise<CampaignTemplate | null> {
  const r = campaignTemplateSchema.safeParse(await readJson(`${CAMPAIGN_TEMPLATES}/${id}/template.json`));
  return r.success ? r.data : null;
}

async function filesUnder(dir: string, prefix = ''): Promise<string[]> {
  let entries: EntryInfo[];
  try {
    entries = await invoke<EntryInfo[]>('list_entries', { path: dir });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map((e) => (e.is_dir ? filesUnder(`${dir}/${e.name}`, `${prefix}${e.name}/`) : Promise.resolve([`${prefix}${e.name}`]))),
  );
  return nested.flat();
}

/**
 * Kopiert die Spieler-Infos eines Abenteuers in die Kampagne und liefert die Zahl neuer Dateien.
 * Additiv, nie überschreibend: die Spieler legen NSCs und Orte oft schon selbst an.
 */
export async function unlockChapter(slug: string, template: string, chapter: string): Promise<number> {
  const from = `${CHAPTERS_PATH}/${template}/${chapter}`;
  let added = 0;
  for (const rel of await filesUnder(from)) {
    const to = `${CAMPAIGNS_PATH}/${slug}/${rel}`;
    if (await exists(to)) continue;
    await invoke('write_file_content', { path: to, content: await invoke<string>('read_file_content', { path: `${from}/${rel}` }) });
    added++;
  }
  return added;
}

async function exists(path: string): Promise<boolean> {
  try {
    await invoke<string>('read_file_content', { path });
    return true;
  } catch {
    return false;
  }
}

/** Ein zurückgenommener Haken löscht nichts: was nachgeliefert wurde, gehört jetzt der Kampagne. */
export async function setChapterCompleted(slug: string, progress: CampaignProgress, chapter: string, done: boolean): Promise<CampaignProgress> {
  const completed = done ? [...new Set([...progress.completed, chapter])] : progress.completed.filter((c) => c !== chapter);
  const next = { ...progress, completed };
  if (done) await unlockChapter(slug, progress.template, chapter);
  await writeProgress(slug, next);
  return next;
}
