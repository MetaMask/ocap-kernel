import type { Plugin as RolldownPlugin } from 'rolldown';

/**
 * A Rolldown plugin that inlines `process.env.NODE_ENV` as the literal
 * `"production"` in any module that references it.
 *
 * This replaces the former build-config `define` (issue #812). Libraries such
 * as immer branch on `process.env.NODE_ENV`, and vats have no `process` global
 * at runtime, so the reference must be resolved at bundle time. The plugin
 * auto-detects the need: modules without the reference are left untouched.
 *
 * This is a textual replacement (the same class of approach as the sibling
 * {@link removeDynamicImportsPlugin}) and handles the dotted
 * `process.env.NODE_ENV` form, consistent with the `define` it replaces.
 *
 * @returns A Rolldown plugin.
 */
export function replaceNodeEnvPlugin(): RolldownPlugin {
  return {
    name: 'ocap-kernel:replace-node-env',
    transform(code) {
      if (!code.includes('process.env.NODE_ENV')) {
        return null;
      }

      const transformed = code.replace(
        /\bprocess\.env\.NODE_ENV\b/gu,
        JSON.stringify('production'),
      );

      if (transformed === code) {
        return null;
      }

      return { code: transformed, map: null };
    },
  };
}
