import type { Condition } from '../../schemas/vocabulary';

export const conditionIconUrl = (c: Condition): string => `/branding/conditions/${c}.webp`;
