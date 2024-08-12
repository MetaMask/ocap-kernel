// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { mergeConfig } from 'vitest/config';

import { getDefaultConfig } from '../../vitest.config.packages.js';
import viteConfig from './vite.config.ts';

const defaultConfig = getDefaultConfig();
// @ts-expect-error We can and will delete this.
delete defaultConfig.test.coverage.thresholds;

export default mergeConfig(viteConfig, defaultConfig);
