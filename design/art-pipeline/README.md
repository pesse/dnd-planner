# Bild-Pipeline der Wizard-Figuren

Malt die Figuren (`static/art/figures/<volk>-<äußeres>/`) per Codex und bessert markierte Bilder nach. Erwartet den Symlink `~/dnd-art-queue` auf diesen Ordner — die Skripte rechnen mit absoluten Pfaden. Einmalig `npm install` in `sharp/` (WSL).

| Schritt | Befehl (aus dem Repo-Root) |
|---|---|
| Werkbank zum Sichten und Markieren | `npm run artlab` → :8898, Markierungen in `design/art/figures/redo.json` |
| Alle Varianten malen (fehlende Rollen) | `xargs -P 6 -L 1 bash ~/dnd-art-queue/variants/all/job.sh < jobs.txt` mit Zeilen `<figur> <teil>` |
| Markierte Bilder einplanen | `cd ~/dnd-art-queue/redraw && node plan.mjs --apply` |
| Eingeplante neu malen | `xargs -P 10 -L 1 bash ~/dnd-art-queue/redraw/job3.sh < ~/dnd-art-queue/redraw/jobs.txt` |
| KI-Review einer Figur | Subagent mit `review/prompt.md`, Ergebnis `review/<figur>.json` → `node review/post.mjs <figur>` |

Bildregeln stehen in `variants/all/head.md` (für alle) und `variants/all/roles.mjs` (je Rolle, Szenen-Rotation, Gegner). Eine Notiz mit „komplett neu“, „neu machen“ oder „andere Szene“ — oder drei verworfene Fassungen in `old/` — erzwingt eine neue Szene. Rohbilder liegen ungetrackt in `design/art/figures-var2/`.
