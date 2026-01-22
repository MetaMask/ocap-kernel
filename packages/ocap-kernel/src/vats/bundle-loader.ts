import { importBundle } from '@endo/import-bundle';

type EndoBundle = {
  moduleFormat: 'endoZipBase64';
  endoZipBase64: string;
  endoZipBase64Sha512: string;
};

type ViteBundle = {
  moduleFormat: 'vite-iife';
  code: string;
  exports: string[];
  modules: Record<
    string,
    { renderedExports: string[]; removedExports: string[] }
  >;
};

type Bundle = EndoBundle | ViteBundle;

export type LoadBundleOptions = {
  filePrefix?: string;
  endowments?: object;
  inescapableGlobalProperties?: object;
};

/**
 * Load a bundle and return its namespace.
 *
 * Supports two bundle formats:
 * - `endoZipBase64`: Legacy format using `importBundle()`
 * - `vite-iife`: New format using `Compartment.evaluate()`
 *
 * @param content - The bundle content as a JSON string.
 * @param options - Options for loading the bundle.
 * @returns The namespace exported by the bundle.
 */
export async function loadBundle(
  content: string,
  options: LoadBundleOptions = {},
): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(content) as Bundle;
  const { endowments = {}, inescapableGlobalProperties = {} } = options;

  if (parsed.moduleFormat === 'endoZipBase64') {
    return await importBundle(parsed, {
      filePrefix: options.filePrefix,
      endowments,
      inescapableGlobalProperties,
    });
  }

  if (parsed.moduleFormat === 'vite-iife') {
    const compartment = new Compartment({
      // SES globals that may be used by bundled code
      harden: globalThis.harden,
      assert: globalThis.assert,
      ...endowments,
      ...inescapableGlobalProperties,
    });
    // The code declares `var __vatExports__ = (function(){...})({});`
    // We wrap it in an IIFE to capture and return the result.
    const vatExports = compartment.evaluate(
      `(function() { ${parsed.code}; return __vatExports__; })()`,
    );
    return vatExports as Record<string, unknown>;
  }

  throw new Error(
    `Unknown bundle format: ${(parsed as { moduleFormat: string }).moduleFormat}`,
  );
}
