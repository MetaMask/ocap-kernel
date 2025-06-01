import '@metamask/kernel-shims/endoify';
import { Logger } from '@metamask/logger';

import demos from '../src/demos/index.ts';

const logger = new Logger('DEMO');

// Get command line arguments
const args = process.argv.slice(2);
const demoNumber = parseInt(args[0] as string, 10);

if (isNaN(demoNumber)) {
  logger.error('Please provide a valid demo number as the first argument');
  process.exit(1);
}

// Run the demo with remaining arguments
const demo = demos.at(demoNumber);
if (!demo) {
  logger.error(`No demo found for number ${demoNumber}`);
  process.exit(1);
}

try {
  const result = await demo(args.slice(1));
  logger.log('Demo completed:', result);
  process.exit(0);
} catch (error) {
  logger.error(
    [
      `Demo ${demoNumber.toString().padStart(2, '0')} failed:`,
      (error as Error).message,
    ].join(' '),
  );
  process.exit(1);
}
