/** SHA-256 der Bilddatei hinter einer URL; null, wenn sie nicht (mehr) lesbar ist. */
export async function imageFingerprint(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const digest = await crypto.subtle.digest('SHA-256', await res.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
