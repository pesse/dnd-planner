# source figure.sh — setzt für $fig (+$species, $look) base, identity, idx und gibt mit figure_head den Regelkopf aus
FIG_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
idx=$(awk -F'\t' -v f=$fig '$1==f{print NR-1}' $FIG_DIR/figures.tsv)
base=$(awk -F'\t' -v f=$fig '$1==f{print $2}' $FIG_DIR/figures.tsv)
identity=$(awk -F'\t' -v f=$fig '$1==f{print $3}' $FIG_DIR/figures.tsv)
case $species in
  aasimar) sp='Aasimar: human-like with ordinary human height and proportions; softly glowing eyes without visible pupils and a faint inner luminous sheen on the skin. No wings, no halo, no feathers.'
    # Subklassen sind ab Stufe 3, dann gibt es die Himmlische Offenbarung — Grund- und Wizard-Bilder bleiben dezent.
    [ -n "${REVELATION:-}" ] && sp='Aasimar in CELESTIAL REVELATION (Heavenly Wings): human-like with ordinary human height; two large spectral wings of translucent golden light spread from the shoulder blades, and the eyes blaze with radiant light. The wings are luminous and semi-transparent, never solid feathered bird wings, and never hide the face, hands or the action. No halo.' ;;
  dragonborn) sp='Dragonborn: tall draconic humanoid with a scaled reptilian head and short snout, no tail, no wings.' ;;
  dwarf) sp='Dwarf: 4–5 feet tall, stout and broad-shouldered with short legs.' ;;
  elf) sp='Elf: tall and slender with long pointed ears.' ;;
  fairy) sp='Fairy: small fey folk 3–4 feet tall with insect-like wings; uses flight naturally — hovers or flies in most scenes (shooting from the air, working while hovering).' ;;
  gnome) sp='Gnome: 3–4 feet tall, small and nimble, large expressive eyes, slightly pointed ears.' ;;
  goliath) sp='Goliath: 7–8 feet tall, massive giant-kin with grey stone-like skin and markings.' ;;
  halfling) sp='Halfling: about 3 feet tall, small and nimble, barefoot with hairy feet.' ;;
  human) sp='Human: average height.' ;;
  orc) sp='Orc: tall, broad and powerful with prominent lower tusks.' ;;
  tiefling) sp='Tiefling: human-like with horns, a long tail and solid-coloured eyes.' ;;
esac
extra=''
[ $look = androgynous ] && extra='
This person is ANDROGYNOUS: a viewer must not be able to tell whether they are a man or a woman. Image models drift toward a pretty feminine face — counter-steer. Add verbatim to every Subject block: "androgynous; no long eyelashes, no makeup look, no full or glossy lips, no high delicate cheekbones, no small pointed chin, no arched brows, no flowing glamorous hair, no hourglass figure; equally no beard, no stubble, no bulky muscle." Never use the words man, woman, he, she, male or female. Choose role clothing that is equally unisex.
'
figure_head() { sed -e "s|__IDENTITY__|$identity|" -e "s|__SPECIES__|$sp|" $FIG_DIR/head.md | awk -v e="$extra" '{ if ($0=="__EXTRA__") print e; else print }'; }
