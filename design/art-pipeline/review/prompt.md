You are reviewing AI-painted fantasy illustrations for quality defects, so a human only has to look at the images you flag. Precision matters more than recall: flag what a careful viewer would clearly object to, not stylistic taste. Typical result: a handful of flags per figure, sometimes none.

Figure: __FIG__ (one recurring character; all images show the same person in different roles).
Images: the PNGs in /mnt/c/dev/privat/dnd-planner/design/art/figures-var2/__FIG__-ca, -cb (classes) and -ba, -bb (backgrounds). Each file name is the role slug (e.g. barbarian.png, merchant.png).
Zoom for unclear details (hands, faces, eye lines, limb counts): `node /home/sani/dnd-art-queue/sharp/crop.mjs <in.png> <out.png> <x> <y> <w> <h>` (pixel box of the 1024x1536 original, written enlarged to 768 px wide; put outputs in /tmp) — then Read the crop. Use it before flagging or dismissing a borderline case.
For each of those four folders, the exact brief the painter received is /home/sani/dnd-art-queue/variants/all/out2/__FIG__-<part>/brief.md — read it first: its rule paragraph and the per-image line (role, moment, setting) are what you check against. If a brief file is missing, use the rules below.

Look at EVERY image (Read tool on the PNG) and check:
- Hands and grips: hands closed around grip/haft, plausible wrists; weapons held the way they are really used (axe/hammer blade or head toward the target, held by the end of the haft; shield on the forearm facing the enemy; bow drawn properly; a fiddle bow must be held).
- Rigid objects straight and in one piece: no curved hafts, bent swords/daggers, crooked staffs, walking sticks or candlesticks, no doubled bows, floating weapon heads.
- Anatomy: two arms and two legs each, all accounted for, upper and lower body forming one coherent pose — for EVERY person in the image, side characters included.
- Gaze (the user flags this most often — be strict): follow the line of sight; it must END on the opponent's face/weapon or the work. A head held level while the target is lower (small foe, crouching enemy, low corner of the frame) so the eyes pass over it into the distance is a defect, as is looking at the viewer.
- Expression fits the moment: no casual grin in combat, no exaggerated rage at a peaceful job, no blank stare; performers and festive moments must look lively and joyful, a dour entertainer is a defect.
- Scale (the user flags this often): opponents and side characters have their normal size (no giant humans); fairies, gnomes, halflings reach a human's waist/chest; orcs barely taller than humans, goliaths about 1.25× a human, a human clearly taller than a dwarf; the hero is never enlarged for emphasis; opponents fight at close range, not far in the background. Paladins and clerics fight undead. A criminal works alone and the loot goes into their bag. Axe: the cutting edge faces the enemy. Morningstar: short one-handed haft + one spiked ball. Arrows normal length. Paladin: the sword never shoots beams. Background crowds/comrades of mixed peoples.
- Role readability: the activity itself shows the profession (an entertainer performing, not just carrying gear). Side characters must not resemble recognizable film/book characters.
- Role readable: the class/background is recognisable from the activity (a sailor sails, a merchant trades); the assigned role gear is right (e.g. cleric with a morningstar, paladin with a longsword, fighter without a bow, ranger with a bow as main weapon, bard without a fiddle).
- Temper: civilian backgrounds peaceful; only guard/soldier martial; criminal tense but not violent.
- Species: a fairy should use its wings/flight where natural; small peoples stay small.
- Odd details: motion streaks against the movement, ropes ending in nowhere, nonsensical actions (pouring gold into water), tiny comical opponents.
- Identity: clearly the same person as in /mnt/c/dev/privat/dnd-planner/static/art/figures/__FIG__/species.avif is NOT checkable by you if the image does not load — skip identity then.

Examples of notes the human wrote (match this style: short, German, concrete):
"axt falsch herum", "krummer stock", "zwei geigenbögen", "blickrichtung", "ober/unterkörper passt nicht", "wo ist das rechte Bein?", "Grinsen passt nicht zur Situation", "keine Tänzerin – Seemann", "Händler: warum Streit? Friedlich.", "bogen ist für Kämpfer nicht typisch", "lebhafter, fröhlich" (dour entertainer just walking), "warum ist da Frodo im Hintergrund??", "schild wird falsch gehalten".

Write your findings as a JSON array to /home/sani/dnd-art-queue/review/__FIG__.json, one object per flagged image: {"role": "<slug>", "note": "<short German note>"} — an empty array if nothing is clearly wrong. Do not modify any other file. Reply with one line: how many images you checked and how many you flagged.
