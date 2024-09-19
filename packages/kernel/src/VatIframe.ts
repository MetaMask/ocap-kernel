import { getHtmlId } from './utils/getHtmlId.ts';
import type { VatBaseProps } from './VatBase.ts';
import { VatBase } from './VatBase.ts';

export class VatIframe extends VatBase {
  readonly iframeId: string;

  constructor({ id }: VatBaseProps) {
    super({ id });

    this.iframeId = getHtmlId(id);
  }

  /**
   * Terminates the vat.
   */
  terminate(): void {
    super.terminate();

    const iframe = document.getElementById(this.iframeId);
    /* v8 ignore next 6: Not known to be possible. */
    if (iframe === null) {
      console.error(
        `iframe of vat with id "${this.id}" already removed from DOM`,
      );
      return;
    }
    iframe.remove();
  }
}
