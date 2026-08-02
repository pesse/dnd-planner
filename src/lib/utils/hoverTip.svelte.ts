/**
 * Sichtbarkeit und Mausposition eines Schwebe-Tooltips. Was angezeigt wird, gehört dem
 * Aufrufer — die Datenbeschaffung sitzt darüber (`itemHover`, `spellHover`) oder daneben.
 */
const OFFSET = 14;

export interface HoverTip<T> {
  data: T | null;
  readonly x: number;
  readonly y: number;
  /** `null` lässt einen bereits sichtbaren Tooltip unverändert stehen. */
  show(e: MouseEvent, value: T | null): void;
  /** Nur die Position, ohne die Sichtbarkeit anzufassen. */
  at(e: MouseEvent): void;
  move(e: MouseEvent): void;
  hide(): void;
}

export function createHoverTip<T>(): HoverTip<T> {
  let data = $state<T | null>(null);
  let x = $state(0);
  let y = $state(0);

  const at = (e: MouseEvent) => {
    x = e.clientX + OFFSET;
    y = e.clientY + OFFSET;
  };

  return {
    get data() {
      return data;
    },
    set data(value: T | null) {
      data = value;
    },
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    at,
    show(e: MouseEvent, value: T | null) {
      if (value == null) return;
      data = value;
      at(e);
    },
    move(e: MouseEvent) {
      if (data == null) return;
      at(e);
    },
    hide() {
      data = null;
    },
  };
}
