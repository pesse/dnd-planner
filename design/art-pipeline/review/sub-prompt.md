You are reviewing AI-painted fantasy illustrations for quality defects, so a human only has to look at the images you flag. Precision matters more than recall: flag what a careful viewer would clearly object to, not stylistic taste. Typical result: a handful of flags per figure, sometimes none.

Figure: __FIG__ (one recurring character; all images show the same person as different D&D subclasses).
Images: the 18 PNGs in /mnt/c/dev/privat/dnd-planner/design/art/figures-sub/__FIG__-sa, -sb and -sc. Each file name is the subclass slug (e.g. battle-master.png). Ignore the old/ subfolders.
The exact brief the painter received is /mnt/c/dev/privat/dnd-planner/design/art-pipeline/variants/subclasses/out/__FIG__-<part>/brief.md — read all three first: the per-image line (core, scene, pose, camera, setting) is what you check against. Every subclass has ONE fixed scene shared by all figures, so the composition itself is approved; check only that this image executes it cleanly.
Zoom for unclear details (hands, faces, eye lines, limb counts): `node /mnt/c/dev/privat/dnd-planner/design/art-pipeline/sharp/crop.mjs <in.png> <out.png> <x> <y> <w> <h>` (pixel box of the 1024x1536 original, written enlarged to 768 px wide; put outputs in /tmp/claude-1000/review-crops) — then Read the crop. Use it before flagging or dismissing a borderline case.

Look at EVERY image (Read tool on the PNG) and check:
- Hands and grips (the user flags this most often): each hand sits naturally on its own wrist and arm, fingers closed around grip/haft; weapons held the way they are really used (axe edge toward the target, held near the end of the haft; one-handed weapons in ONE hand as the brief says).
- Rigid objects straight and in one piece: no bent or kinked hafts, swords, staffs, bows or arrows; no doubled weapons, floating weapon heads, a second blade in the same hand.
- Anatomy: two arms and two legs each, all accounted for, arm lengths plausible, upper and lower body forming one coherent pose — for EVERY person in the image, side characters and opponents included. A tiefling has exactly one tail.
- Gaze: the line of sight ends on what the brief says (the opponent, the target, the spell, the work), never on the viewer or past a lower target into the distance.
- Expression fits the moment: no casual grin in combat, no blank stare.
- Scale: opponents and side characters have their normal size; fairies, gnomes, halflings reach a human's waist/chest; goliaths about 1.25× a human; the hero is never enlarged for emphasis; opponents at close range as briefed.
- Species: a fairy uses its wings where the brief says (e.g. flies the berserker charge); small peoples stay small.
- Odd details: objects ending in nowhere, motion streaks against the movement, nonsensical actions, side characters resembling recognizable film/book characters.

Examples of notes the human wrote for these images (match this style: short, German, concrete):
"abgeknickter Axtstiel", "Handhaltung passt nicht zum Arm", "hinterer Arm zu lang", "Schild wird komplett falsch gehalten, falsche Klinge", "Oberkörper passt nicht zu Schildarm", "eine Berserker-Fee würde fliegen", "blickrichtung".

Write your findings as a JSON array to /mnt/c/dev/privat/dnd-planner/design/art-pipeline/review/sub/__FIG__.json, one object per flagged image: {"role": "<slug>", "note": "<short German note>"} — an empty array if nothing is clearly wrong. Do not modify any other file. Reply with one line: how many images you checked and how many you flagged.
