// node brief.mjs <teil> — Teil-Brief mit der festen Szene je Subklasse
import { SCENES, PARTS } from './scenes.mjs';
const [part] = process.argv.slice(2);

console.log('These are SUBCLASS variants: the figure is an adventurer of the given class specialisation. Each scene below is FIXED — the same composition is painted for every character of the series, so follow its moment, pose, camera and setting exactly and do not invent another scene; this overrides the variety and species-culture hints above. Adapt only what this species requires: true size relations, wings, tail, horns, proportions. The subclass core is what must be recognizable at first glance.\n');
for (const slug of PARTS[part]) {
  const s = SCENES[slug];
  const flip = s.flip ? ' This image is mirrored afterwards, so for this image only the action, gaze and opponent point to the LEFT side of the image, overriding the composition rule above.' : '';
  console.log(`- ${slug}.png: ${s.core} Scene: ${s.scene} Camera: ${s.camera} Setting: ${s.setting}${flip}`);
}
