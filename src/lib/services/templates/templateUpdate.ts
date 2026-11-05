/**
 * Erkennt, dass ein Pack die Vorlage einer Kampagne seit deren Anlage geändert hat, und baut
 * die Kampagne auf Wunsch neu — an ihrer Stelle oder daneben.
 */
import { invoke } from '@tauri-apps/api/core';
import type { CampaignProgress } from '../../schemas/campaignProgress';
import { parseFrontmatter } from '../../utils/frontmatter';
import { readCampaignTemplate, readProgress, writeProgress } from './chapters';
import { buildCampaign, CAMPAIGNS_PATH, freeName, subdirs, templateFingerprint, type CampaignTemplateRef } from './templates';

export interface TemplateUpdate {
  template: CampaignTemplateRef;
  progress: CampaignProgress;
  fingerprint: string;
}

/**
 * `null`, solange die Vorlage unverändert oder ihr Pack nicht mehr installiert ist. Eine Kampagne
 * von vor dem Fingerabdruck bekommt den heutigen Stand als Ausgangspunkt — was sich davor
 * geändert hat, lässt sich nicht mehr feststellen.
 */
export async function pendingTemplateUpdate(slug: string): Promise<TemplateUpdate | null> {
  const progress = await readProgress(slug);
  const raw = progress && (await readCampaignTemplate(progress.template));
  if (!progress || !raw) return null;
  const template = { id: progress.template, ...raw };
  const fingerprint = await templateFingerprint(template);
  if (!progress.templateFingerprint) {
    await writeProgress(slug, { ...progress, templateFingerprint: fingerprint });
    return null;
  }
  return progress.templateFingerprint === fingerprint ? null : { template, progress, fingerprint };
}

/** Die Kampagne bleibt, wie sie ist; erst eine weitere Änderung der Vorlage meldet sich wieder. */
export async function dismissTemplateUpdate(slug: string, update: TemplateUpdate): Promise<void> {
  await writeProgress(slug, { ...update.progress, templateFingerprint: update.fingerprint });
}

/**
 * Baut die Kampagne aus der heutigen Vorlage neu und liefert ihren Ordnernamen. Charaktere und
 * abgeschlossene Abenteuer übernimmt sie; alles, was in der Kampagne selbst geschrieben wurde, nicht.
 * `replace` entfernt die alte erst, wenn die neue fertig ist.
 */
export async function rebuildFromTemplate(slug: string, update: TemplateUpdate, replace: boolean): Promise<string> {
  const md = await invoke<string>('read_file_content', { path: `${CAMPAIGNS_PATH}/${slug}/campaign.md` }).catch(() => '');
  const uids = parseFrontmatter(md).frontmatter.characters ?? [];
  const target = freeName(slug, new Set(await subdirs(CAMPAIGNS_PATH)));
  await buildCampaign(target, update.template, update.progress.completed, uids);
  if (!replace) return target;
  await invoke('delete_path', { path: `${CAMPAIGNS_PATH}/${slug}` });
  await moveDir(`${CAMPAIGNS_PATH}/${target}`, `${CAMPAIGNS_PATH}/${slug}`);
  return slug;
}

/** Windows verweigert das Umbenennen frisch kopierter Ordner, solange Virenscanner oder Indexer darin lesen. */
async function moveDir(from: string, to: string): Promise<void> {
  try {
    await invoke('rename_file', { oldPath: from, newPath: to });
  } catch {
    await invoke('copy_dir', { from, to });
    await invoke('delete_path', { path: from }).catch(() => {});
  }
}
