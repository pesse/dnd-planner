import { describe, expect, it } from 'vitest';
import { mergeReleaseNotes, type GithubRelease } from '$lib/services/releaseNotes';

const rel = (tag: string, body: string, extra: Partial<GithubRelease> = {}): GithubRelease => ({
  tag_name: tag, name: `${tag} — Titel`, body, draft: false, prerelease: false, ...extra,
});

describe('mergeReleaseNotes', () => {
  const releases = [
    rel('v0.33.2', 'zwei'),
    rel('v0.33.1', 'eins'),
    rel('v0.33.0', 'null'),
    rel('v0.32.10', 'zehn'),
    rel('v0.32.9', 'neun'),
    rel('v0.34.0', 'Entwurf', { draft: true }),
    rel('nightly', 'kein Versions-Tag'),
  ];

  it('sammelt alle Releases nach der installierten bis einschließlich der neuen, neueste zuerst', () => {
    expect(mergeReleaseNotes(releases, '0.32.9', '0.33.1')).toBe(
      '### v0.33.1 — Titel\n\neins\n\n### v0.33.0 — Titel\n\nnull\n\n### v0.32.10 — Titel\n\nzehn',
    );
  });

  it('lässt Entwürfe und Tags ohne Version aus', () => {
    const notes = mergeReleaseNotes(releases, '0.33.2', '0.34.0');
    expect(notes).toBeNull();
  });

  it('liefert null bei unlesbarer Version', () => {
    expect(mergeReleaseNotes(releases, 'dev', '0.33.2')).toBeNull();
  });
});
