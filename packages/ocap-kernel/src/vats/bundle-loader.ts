import type { VatBundle } from '@metamask/kernel-utils';

export type LoadBundleOptions = {
  endowments?: object;
  inescapableGlobalProperties?: object;
};

/**
 * Load an iife bundle and return its namespace.
 *
 * @param content - The bundle content as a JSON string.
 * @param options - Options for loading the bundle.
 * @returns The namespace exported by the bundle.
 */
export function loadBundle(
  content: string,
  options: LoadBundleOptions = {},
): Record<string, unknown> {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const { endowments = {}, inescapableGlobalProperties = {} } = options;

  if (parsed.moduleFormat !== 'iife') {
    throw new Error(`Unknown bundle format: ${String(parsed.moduleFormat)}`);
  }

  if (parsed.code === undefined) {
    throw new Error('Invalid bundle: missing code');
  }

  if (typeof parsed.code !== 'string') {
    throw new Error('Invalid bundle: code must be a string');
  }

  const bundle = parsed as unknown as VatBundle;

  const compartment = new Compartment({
    // SES globals that may be used by bundled code
    harden: globalThis.harden,
    ...endowments,
    ...inescapableGlobalProperties,
  });
  // The code declares `var __vatExports__ = (function(){...})({});`
  // We wrap it in an IIFE to capture and return the result.
  const vatExports = compartment.evaluate(
    `(function() { ${bundle.code}; return __vatExports__; })()`,
  );
  return vatExports as Record<string, unknown>;
}
