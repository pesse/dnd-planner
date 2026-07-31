/**
 * `ClassInfo.key` / `SpeciesInfo.key` sind optional, weil ein Eintrag ohne Bibliotheks-Link
 * (Altbestand, Homebrew-Datei) im UI weiterhin anzeigbar sein muss. Für die Strecken hier ist
 * ein fehlender Key aber kein Testfall, sondern ein Vault-Defekt — und stilles Überspringen
 * wäre die schlechteste Reaktion: eine Abdeckungsprobe über „den ganzen Vault" bliebe grün,
 * obwohl sie den Eintrag nie gesehen hat.
 */
export function libraryKey(info: { key?: string; name: string }): string {
  if (!info.key) throw new Error(`[eval] Bibliothekseintrag ohne Key: ${info.name}`);
  return info.key;
}
