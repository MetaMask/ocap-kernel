import type { ConfigEnv } from 'vitest/config';

export declare function mergeConfig(
  args: ConfigEnv,
  ...rest: Parameters<typeof import('vitest/config').mergeConfig>
): ReturnType<typeof import('vitest/config').mergeConfig>;
