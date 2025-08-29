import { makePlatform } from './browser.ts';
import { createPlatformTestSuite } from './platform-test.ts';

createPlatformTestSuite(makePlatform, 'browser');
