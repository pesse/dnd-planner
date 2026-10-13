#!/usr/bin/env bash
# Kopiert Rohbilder, die Codex nicht selbst in den Zielordner bekam, anhand seiner
# Zuordnung `<name>.png → C:\…\generated_images\…\exec-….png` (Zeilen in result.md).
#
# Nutzung: copy-raw.sh RESULT_MD ZIELORDNER [--force]
# Ohne --force bleibt eine vorhandene Datei stehen (der Nutzer arbeitet parallel).
set -uo pipefail
result="$1" target="$2" force="${3:-}"
grep -oE '[A-Za-z0-9_.-]+\.(png|jpg|webp)[^A-Za-z]*→ *`?[A-Za-z]:\\[^` |)]+' "$result" |
	sed -E 's/^([^ ]+)[^A-Za-z]*→ *`?(.*)$/\1\t\2/' |
	while IFS=$'\t' read -r name src; do
		raw="$(wslpath -u "$src")"
		if [[ ! -f "$raw" ]]; then echo "FEHLT:      $name ($src)"
		elif [[ -e "$target/$name" && "$force" != "--force" ]]; then echo "existiert:  $name"
		else cp "$raw" "$target/$name" && echo "kopiert:    $name"; fi
	done
