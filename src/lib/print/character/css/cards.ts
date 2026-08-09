/**
 * Die Zauberkarten im Charakterbogen. Sie brauchen ein randloses Seitenformat, das der Bogen
 * nicht hat — deshalb ein benannter `@page`. Und das Kartenwerk steht verschachtelt, sonst
 * schlagen `.card`, `.head`, `.desc` und `.md` in die Bogenseiten aus.
 */
import { CARD_BODY_CSS, CARD_GRID_CSS } from '$lib/utils/printSpellCss';

export const CARDS_CSS = `
@page cards { margin: 0; }
.cards {
  page: cards;
  break-before: page;
  ${CARD_GRID_CSS}
  ${CARD_BODY_CSS}
}
`;
