/**
 * Der eine Weg, alle Lese-Indizes zu verwerfen: für Änderungen AM STÜCK (Bibliotheks-
 * Installation, Vault-Import, KI-Artefakte), nach denen niemand weiß, welche Ordner es traf.
 *
 * Wer eine einzelne Datei speichert, ruft stattdessen die Invalidierung seiner Bibliothek —
 * sonst liest der nächste Charakterbogen alles neu, was gerade erst geladen wurde.
 */
import { invalidateSpellLibrary } from '../../spellLibrary';
import { invalidateClassCache } from '../../classLibrary';
import { invalidateSpeciesCache } from '../../speciesLibrary';
import { invalidateFeatsCache } from '../../featsLibrary';
import { invalidateBackgroundsCache } from '../../backgroundsLibrary';
import { invalidateItemCache } from '../../itemLibrary';
import { invalidateMonsterPaths } from '../contextLoad';
import { invalidateVault } from '../../stores/campaign';

/** `invalidateVault` weckt zusätzlich die Sidebar-Listen. */
export function invalidateLibraryCaches(): void {
  invalidateSpellLibrary();
  invalidateClassCache();
  invalidateSpeciesCache();
  invalidateFeatsCache();
  invalidateBackgroundsCache();
  invalidateItemCache();
  invalidateMonsterPaths();
  invalidateVault();
}
