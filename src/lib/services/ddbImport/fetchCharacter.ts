/** Lädt einen öffentlichen Charakter vom inoffiziellen D&D-Beyond-Character-Service. */
import { ddbCharacterJsonSchema, ddbCharacterResponseSchema, type DdbCharacterJson } from '$lib/schemas/ddbCharacterJson';
import { httpFetch } from '../httpFetch';

export const DDB_CHARACTER_SERVICE = 'https://character-service.dndbeyond.com/character/v5/character/';

/** `https://www.dndbeyond.com/characters/12345678/AbCd`, `ddb.ac/characters/12345678` oder nur die Zahl. */
export function ddbCharacterId(input: string): string | null {
  const t = input.trim();
  if (/^\d{4,}$/.test(t)) return t;
  return t.match(/characters?\/(\d{4,})/i)?.[1] ?? null;
}

export class DdbFetchError extends Error {}

export async function fetchDdbCharacter(id: string): Promise<DdbCharacterJson> {
  let res: Response;
  try {
    res = await httpFetch(DDB_CHARACTER_SERVICE + id, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new DdbFetchError(`D&D Beyond ist nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new DdbFetchError('Der Charakter ist nicht öffentlich. In D&D Beyond unter „Character Settings → Character Privacy" auf „Public" stellen und erneut laden.');
  }
  if (res.status === 404) throw new DdbFetchError(`Kein Charakter mit der ID ${id} gefunden.`);
  if (!res.ok) throw new DdbFetchError(`D&D Beyond antwortet mit HTTP ${res.status}.`);

  const envelope = ddbCharacterResponseSchema.safeParse(await res.json().catch(() => null));
  if (!envelope.success || envelope.data.success === false) {
    throw new DdbFetchError(`D&D Beyond liefert keinen Charakter${envelope.success && envelope.data.message ? `: ${envelope.data.message}` : '.'}`);
  }
  const character = ddbCharacterJsonSchema.safeParse(envelope.data.data);
  if (!character.success) {
    console.error('D&D-Beyond-JSON unerwartet:', character.error.issues);
    throw new DdbFetchError('Die Antwort von D&D Beyond hat ein unerwartetes Format — der inoffizielle Endpunkt hat sich vermutlich geändert.');
  }
  return character.data;
}
