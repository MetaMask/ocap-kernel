/**
 * Resolve whether to serve the dev-only RPC methods.
 *
 * Deliberately exact-match: a daemon that served arbitrary SQL because
 * someone wrote `OCAP_DEV_MODE=1` would be a nasty surprise. A set-but-
 * unrecognized value is warned about rather than ignored, since silently
 * treating it as "off" is the other way to surprise someone.
 *
 * Takes `env` and `warn` as parameters rather than reaching for
 * `process.env` and a module-scope logger, so the value table above can be
 * tested — `daemon-entry` calls `main()` at module load and cannot be
 * imported.
 *
 * @param options - Resolution options.
 * @param options.env - The environment to read `OCAP_DEV_MODE` from.
 * @param options.warn - Called with a message when the variable is set to
 * something other than `'true'`.
 * @returns Whether dev mode is enabled.
 */
export function resolveDevMode({
  env,
  warn,
}: {
  env: NodeJS.ProcessEnv;
  warn: (message: string) => void;
}): boolean {
  const raw = env.OCAP_DEV_MODE;
  if (raw === undefined || raw === 'true') {
    return raw === 'true';
  }
  warn(
    `OCAP_DEV_MODE is set to '${raw}', which is not 'true'; dev-only methods stay disabled.`,
  );
  return false;
}
