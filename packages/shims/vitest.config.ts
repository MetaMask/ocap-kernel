// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { getDefaultConfig } from '../../vitest.config.packages.mjs';

const config = getDefaultConfig();
// @ts-expect-error We can and will delete this.
delete config.test.coverage.thresholds;
export default config;
