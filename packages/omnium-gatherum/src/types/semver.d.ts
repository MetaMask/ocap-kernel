declare module 'semver/functions/valid' {
  function valid(
    version: string | null | undefined,
    optionsOrLoose?: boolean | { loose?: boolean; includePrerelease?: boolean },
  ): string | null;
  export default valid;
}
