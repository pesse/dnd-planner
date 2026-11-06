// Release-Notes aller übersprungenen Versionen für den Update-Dialog; latest.json trägt nur die des neuesten Releases.
import { httpFetch } from './httpFetch';

const RELEASES_URL = 'https://api.github.com/repos/pesse/dnd-planner/releases';

export interface GithubRelease {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  draft: boolean;
  prerelease: boolean;
}

function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** Neueste zuerst, je Release eine Überschrift; `null`, wenn kein Release im Bereich (installed, target] liegt. */
export function mergeReleaseNotes(releases: GithubRelease[], installed: string, target: string): string | null {
  const from = parseVersion(installed);
  const to = parseVersion(target);
  if (!from || !to) return null;
  const sections = releases
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => ({ release: r, version: parseVersion(r.tag_name) }))
    .filter((e): e is { release: GithubRelease; version: [number, number, number] } =>
      e.version !== null && compareVersions(e.version, from) > 0 && compareVersions(e.version, to) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
    .map(({ release }) => `### ${release.name?.trim() || release.tag_name}\n\n${release.body?.trim() ?? ''}`);
  return sections.length ? sections.join('\n\n') : null;
}

/** `null` bei Netz- oder API-Fehlern — der Aufrufer fällt dann auf die Notes aus latest.json zurück. */
export async function fetchReleaseNotesSince(installed: string, target: string): Promise<string | null> {
  try {
    const res = await httpFetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    return mergeReleaseNotes((await res.json()) as GithubRelease[], installed, target);
  } catch (e) {
    console.warn('Release-Notes konnten nicht geladen werden:', e);
    return null;
  }
}
