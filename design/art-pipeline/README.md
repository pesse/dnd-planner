# Bild-Pipeline der Wizard-Figuren

Malt die Figuren (`static/art/figures/<volk>-<äußeres>/`) per Codex und bessert markierte Bilder nach. Erwartet den Symlink `~/dnd-art-queue` auf diesen Ordner — die Skripte rechnen mit absoluten Pfaden. Einmalig `npm install` in `sharp/` (WSL).

| Schritt | Befehl (aus dem Repo-Root) |
|---|---|
| Werkbank zum Sichten und Markieren | `npm run artlab` → :8898, Markierungen in `design/art/figures/redo.json` |
| Alle Varianten malen (fehlende Rollen) | `xargs -P 6 -L 1 bash ~/dnd-art-queue/variants/all/job.sh < jobs.txt` mit Zeilen `<figur> <teil>` |
| Markierte Bilder einplanen | `cd ~/dnd-art-queue/redraw && node plan.mjs --apply` |
| Eingeplante neu malen | `xargs -P 10 -L 1 bash ~/dnd-art-queue/redraw/job3.sh < ~/dnd-art-queue/redraw/jobs.txt` |
| Subklassen malen (feste Szene je Subklasse, `variants/subclasses/scenes.mjs`) | `xargs -P 6 -L 1 bash ~/dnd-art-queue/variants/subclasses/job.sh < jobs.txt` mit Zeilen `<figur> <sa\|sb\|sc>` |
| Vergleichsblatt der Prüffiguren je Subklasse | `node design/art-pipeline/sharp/subsheet.mjs <zielordner> [slug,slug]` |
| KI-Review einer Figur | Subagent mit `review/prompt.md`, Ergebnis `review/<figur>.json` → `node review/post.mjs <figur>` |

Bildregeln stehen in `variants/all/head.md` (für alle), `variants/all/roles.mjs` (je Rolle, Szenen-Rotation, Gegner) und `variants/subclasses/scenes.mjs` (eine feste Szene je Subklasse — ein Fehler dort wird im Brief korrigiert, nicht mit einer anderen Szene umgangen). Figuren-Identität und Volksbeschreibung: `variants/all/figure.sh`. Eine Notiz mit „komplett neu“, „neu machen“ oder „andere Szene“ — oder drei verworfene Fassungen in `old/` — erzwingt eine neue Szene. Rohbilder liegen ungetrackt in `design/art/figures-var2/` und `design/art/figures-sub/`.
