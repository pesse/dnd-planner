/** Gerüste für neu angelegte Dokumente; Überschrift und Name setzt der Aufrufer davor. */
import act from './act.md?raw';
import campaign from './campaign.md?raw';
import session from './session.md?raw';
import world from './world.md?raw';
import gmNotes from './character.md?raw';

export const DOCUMENT_TEMPLATES: Partial<Record<string, string>> = { act, campaign, session, world };
export const GM_NOTES_TEMPLATE = gmNotes;
