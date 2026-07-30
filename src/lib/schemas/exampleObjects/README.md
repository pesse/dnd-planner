# exampleObjects

Generiert aus den Zod-Schemas — `npm run schema:examples`. **Nicht von Hand editieren**,
Änderungen gehen beim nächsten Lauf verloren; `npm run schema:examples:check` meldet
veraltete Dateien.

Ein Beispiel-Objekt je exportiertem Schema (`featSchema` → `feat.json`), als scannbare
Sicht auf die Form. Die Werte sind gültige Platzhalter, keine echten Inhalte: Defaults wo
aussagekräftig, sonst `"string"` / `0` / `false`, bei Enums der erste Wert. Arrays zeigen
ein Element, `z.record()` einen `<key>`-Eintrag, Unions alle Varianten.
