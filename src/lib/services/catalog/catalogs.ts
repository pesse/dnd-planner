import { featCatalog } from './featCatalog';
import { itemCatalog } from './itemCatalog';
import { monsterCatalog } from './monsterCatalog';
import type { CatalogKind, CatalogSpec } from './catalogTypes';

export const CATALOGS: Record<CatalogKind, CatalogSpec> = { monster: monsterCatalog, item: itemCatalog, feat: featCatalog };
