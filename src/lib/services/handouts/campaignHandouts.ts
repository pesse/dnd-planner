/** Die Handouts einer Kampagne, fertig zum Zeigen im Spielerfenster. */
import { invoke } from '@tauri-apps/api/core';
import { handoutSchema, type Handout } from '../../schemas/handout';
import { vaultFileUrl } from '../battleMap/mapFiles';

export interface CampaignHandout extends Handout {
  path: string;
  imageUrl: string;
}

/** Ein unlesbares Handout fehlt in der Liste, statt sie ganz zu verhindern. */
export async function loadCampaignHandouts(campaignDir: string): Promise<CampaignHandout[]> {
  const dir = `${campaignDir}/handouts`;
  const files = await invoke<string[]>('list_json_files', { path: dir }).catch(() => [] as string[]);
  const loaded = await Promise.all(
    files.map(async (file) => {
      const path = `${dir}/${file}`;
      try {
        const h = handoutSchema.parse(JSON.parse(await invoke<string>('read_file_content', { path })));
        const imageUrl = h.image ? await vaultFileUrl(`${dir}/${h.image}`) : '';
        return [{ ...h, path, imageUrl }];
      } catch {
        return [];
      }
    }),
  );
  return loaded.flat().sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
