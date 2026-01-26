import { isObject, hasProperty } from '@metamask/utils';

/**
 * A bundle produced by the vat bundler.
 *
 * Contains the bundled code as an IIFE that assigns exports to `__vatExports__`,
 * along with metadata about the bundle's exports and modules.
 */
export type VatBundle = {
  moduleFormat: 'iife';
  code: string;
  exports: string[];
  modules: Record<
    string,
    { renderedExports: string[]; removedExports: string[] }
  >;
};

/**
 * Type guard to check if a value is a VatBundle.
 *
 * @param value - The value to check.
 * @returns True if the value is a VatBundle.
 */
export const isVatBundle = (value: unknown): value is VatBundle =>
  isObject(value) &&
  hasProperty(value, 'moduleFormat') &&
  value.moduleFormat === 'iife' &&
  hasProperty(value, 'code') &&
  typeof value.code === 'string' &&
  hasProperty(value, 'exports') &&
  Array.isArray(value.exports) &&
  hasProperty(value, 'modules') &&
  typeof value.modules === 'object' &&
  value.modules !== null;
