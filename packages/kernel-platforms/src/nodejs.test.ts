import { makePlatform } from './nodejs.ts';
import { createPlatformTestSuite } from './platform-test.ts';

createPlatformTestSuite(makePlatform, 'nodejs');
