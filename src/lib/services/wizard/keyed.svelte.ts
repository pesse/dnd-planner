/**
 * Ein Wert je Grundwahl: wer die Klasse wechselt und zurückkommt, findet seine Wahl wieder,
 * und keine Wahl einer anderen Klasse gelangt in den Charakter.
 */
export class Keyed<T> {
  #by = $state<Record<string, T>>({});
  /** Leerwert je Schlüssel stabil halten: ein Aufrufer, der ihn mutiert und zurückschreibt, verlöre sonst die Mutation. */
  #blank = new Map<string, T>();
  #keyOf: () => string;
  #empty: () => T;

  constructor(keyOf: () => string, empty: () => T) {
    this.#keyOf = keyOf;
    this.#empty = empty;
  }

  get value(): T {
    const key = this.#keyOf();
    if (key in this.#by) return this.#by[key];
    let blank = this.#blank.get(key);
    if (!blank) {
      blank = this.#empty();
      this.#blank.set(key, blank);
    }
    return blank;
  }

  set value(v: T) {
    this.#by[this.#keyOf()] = v;
  }
}
