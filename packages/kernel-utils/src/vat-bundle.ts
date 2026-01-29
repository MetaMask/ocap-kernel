import type { Infer } from '@metamask/superstruct';
import { array, is, literal, object, string } from '@metamask/superstruct';

/**
 * A bundle produced by the vat bundler.
 *
 * Contains the bundled code as an IIFE that assigns exports to `__vatExports__`,
 * along with metadata about the bundle's exports and external dependencies.
 */
export const VatBundleStruct = object({
  moduleFormat: literal('iife'),
  code: string(),
  exports: array(string()),
  external: array(string()),
});

export type VatBundle = Infer<typeof VatBundleStruct>;

/**
 * Type guard to check if a value is a VatBundle.
 *
 * @param value - The value to check.
 * @returns True if the value is a VatBundle.
 */
export const isVatBundle = (value: unknown): value is VatBundle =>
  is(value, VatBundleStruct);
