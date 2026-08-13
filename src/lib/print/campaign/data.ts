/**
 * Was von einer Kampagne aufs Papier kann: die Kampagnenseite und ihre Akte in der
 * Reihenfolge aus `acts/order.json`.
 */
import { invoke } from '@tauri-apps/api/core';
import { listActDirs } from '../../services/actOrder';
import { extractActTitle } from '../../utils/actExtract';

export interface CampaignPrintAct {
  dir: string;
  title: string;
  markdown: string;
}

export interface CampaignPrintData {
  campaignName: string;
  intro: string;
  acts: CampaignPrintAct[];
}

const campaignDir = (campaignPath: string): string => `./vault/campaigns/${campaignPath}`;

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await invoke<string>('read_file_content', { path });
  } catch {
    return '';
  }
}

export async function loadCampaignPrintData(
  campaignPath: string,
  campaignName: string,
): Promise<CampaignPrintData> {
  const base = campaignDir(campaignPath);
  const intro = await readOrEmpty(`${base}/campaign.md`);

  let dirs: string[] = [];
  try {
    dirs = await listActDirs(`${base}/acts`);
  } catch { /* Kampagne ohne acts-Verzeichnis */ }

  const acts = await Promise.all(
    dirs.map(async (dir) => {
      const markdown = await readOrEmpty(`${base}/acts/${dir}/index.md`);
      return { dir, title: extractActTitle(markdown, dir), markdown };
    }),
  );

  return { campaignName, intro, acts };
}
