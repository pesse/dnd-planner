/** Was das Detailfenster der Karte zeigt, mit eigenem Zurück — Links verlassen die Karte nicht. */
import { OVERVIEW_ONLY, forgetToken, popDetail, pushDetail, type DetailStack, type MapDetail } from './detailStack';

export class DetailHistory {
  #stack = $state<DetailStack>(OVERVIEW_ONLY);

  get current(): MapDetail {
    return this.#stack[this.#stack.length - 1];
  }

  get canBack(): boolean {
    return this.#stack.length > 1;
  }

  show(detail: MapDetail): void {
    this.#stack = pushDetail(this.#stack, detail);
  }

  back(): void {
    this.#stack = popDetail(this.#stack);
  }

  forget(tokenId: string): void {
    this.#stack = forgetToken(this.#stack, tokenId);
  }

  tokenIds(): string[] {
    return this.#stack.flatMap((d) => (d.kind === 'token' ? [d.id] : []));
  }

  reset(): void {
    this.#stack = OVERVIEW_ONLY;
  }
}
