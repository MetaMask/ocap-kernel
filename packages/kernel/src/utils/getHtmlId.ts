import type { VatId } from 'src/types.ts';

/**
 * Get a DOM id for our iframes, for greater collision resistance.
 *
 * @param id - The vat id to base the DOM id on.
 * @returns The DOM id.
 */
export const getHtmlId = (id: VatId): string => `ocap-iframe-${id}`;
