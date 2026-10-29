/**
 * Die Zauberkarten im Charakterbogen. Sie brauchen ein randloses Seitenformat, das der Bogen
 * nicht hat — deshalb ein benannter `@page`. Und das Kartenwerk steht verschachtelt, sonst
 * schlagen `.card`, `.head`, `.desc` und `.md` in die Bogenseiten aus.
 */
import { CARD_BODY_CSS, CARD_GRID_CSS } from '$lib/utils/printCardCss';

/** Der Klassenname, unter dem das 3×3-Raster steht. */
export const CARDS_PAGE_CLASS = 'cards';

export const CARDS_CSS = `
@page cards { margin: 0; }
.cards {
  page: cards;
  break-before: page;
  ${CARD_GRID_CSS}
  ${CARD_BODY_CSS}
  .img-card::after { z-index: 1; }
  .img-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .img-cap {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 5mm 4mm 3mm;
    background: linear-gradient(transparent, rgba(30, 20, 8, 0.75));
    color: #fef8ec;
    font-size: 8pt;
    text-align: center;
  }
}
`;
