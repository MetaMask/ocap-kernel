type LoadBundleOptions = {
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
  const parsed: unknown = JSON.parse(content);
  const { endowments = {}, inescapableGlobalProperties = {} } = options;

  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Invalid bundle: must be an object');
  }

  const bundle = parsed as Record<string, unknown>;

  if (bundle.moduleFormat !== 'iife') {
    throw new Error(`Unknown bundle format: ${String(bundle.moduleFormat)}`);
  }

  if (bundle.code === undefined) {
    throw new Error('Invalid bundle: missing code');
  }

  if (typeof bundle.code !== 'string') {
    throw new Error('Invalid bundle: code must be a string');
  }

  const compartment = new Compartment({
    // SES globals that may be used by bundled code
    harden: globalThis.harden,
    // Rolldown adds `Object.defineProperty(exports, Symbol.toStringTag, ...)` to
    // IIFE bundles for modules with no named exports. Provide an empty object so
    // that call does not throw in the Compartment.
    exports: {},
    ...endowments,
    ...inescapableGlobalProperties,
  });
  // Rolldown-generated CJS helpers use `var localThis = globalThis`, and
  // some bundled libraries (e.g. lodash) detect the global via
  // `typeof global == "object" && global` or `Function("return this")()`.
  // None of these work in a SES Compartment out of the box:
  //   - `global` / `self` are not compartment bindings
  //   - `Function("return this")()` returns `undefined` in strict mode
  // Inject these properties on the compartment's own global so that both
  // patterns resolve to the compartment's global (which has all the intrinsics).
  const cg = compartment.globalThis as Record<string, unknown>;
  cg.globalThis = compartment.globalThis;
  cg.global = compartment.globalThis;
  // The code declares `var __vatExports__ = (function(){...})({});`
  // We wrap it in an IIFE to capture and return the result.
  const vatExports = compartment.evaluate(
    `(function() { ${bundle.code}; return __vatExports__; })()`,
  );
  return vatExports as Record<string, unknown>;
}
