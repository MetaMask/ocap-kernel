import { resolve } from 'node:path';
import type {
  Argv,
  CommandModule as YargsCommandModule,
  Arguments,
} from 'yargs';

import makeDemoLogger from './logger.ts';
import { runBundle } from './run-bundle.ts';
import { runCluster } from './run-cluster.ts';

export type RunBundleOptions = {
  bundlePath: string;
  bundleParams: string;
  methodName: string;
};

export type RunClusterOptions = {
  clusterPath: string;
};

type HandledCommand<Options> = YargsCommandModule<object, Options> & {
  command: string;
  handler: (args: Arguments<Options>) => Promise<void>;
};
export type CommandModule =
  | HandledCommand<RunBundleOptions>
  | HandledCommand<RunClusterOptions>;

/**
 * The yargs command for running a bundle.
 */
const runBundleCommand: CommandModule = {
  command: 'run-bundle',
  describe: 'Run a bundle.',
  builder: (argv: Argv<object>) => {
    argv
      .options({
        bundlePath: {
          alias: 'b',
          describe:
            'The path to the bundle file, relative to the demo directory.',
          type: 'string',
          requiresArg: true,
        },

        bundleParams: {
          alias: 'p',
          describe: 'The parameters to pass to the bundle.',
          type: 'string',
          requiresArg: true,
        },

        methodName: {
          alias: 'm',
          describe: 'The method to run in the bundle.',
          type: 'string',
          requiresArg: true,
        },
      })
      .coerce('bundlePath', (bundlePath) => resolve(process.cwd(), bundlePath))
      .example(
        '$0 -b foo.bundle -p \'{ "fizz": "buzz" }\' -m bar',
        'Run the "bar" method in the "foo.bundle" bundle with the parameters \'{ "fizz": "buzz" }\'.',
      )
      .check((args) => {
        if (!args.bundlePath || typeof args.bundlePath !== 'string') {
          throw new Error('Missing required argument: "bundlePath"');
        }

        if (!args.bundleParams || typeof args.bundleParams !== 'string') {
          throw new Error('Missing required argument: "bundleParams"');
        }

        try {
          JSON.parse(args.bundleParams);
        } catch {
          throw new Error(`Invalid JSON: ${args.bundleParams}`);
        }

        if (!args.methodName || typeof args.methodName !== 'string') {
          throw new Error('Missing required argument: "methodName"');
        }

        return true;
      });

    return argv as Argv<RunBundleOptions>;
  },
  handler: async (args: Arguments<RunBundleOptions>) =>
    await runBundleHandler(args),
};

const runClusterCommand: CommandModule = {
  command: 'run-cluster',
  describe: 'Run a cluster.',
  builder: (argv: Argv<object>) => {
    argv
      .options({
        clusterPath: {
          alias: 'c',
          describe: 'The path to the cluster config file.',
          type: 'string',
          requiresArg: true,
        },
      })
      .coerce('clusterPath', (clusterPath) =>
        resolve(process.cwd(), clusterPath),
      )
      .example(
        '$0 -c foo/cluster.json',
        'Run the cluster config in the "foo/cluster.json" file.',
      );
    return argv as Argv<RunClusterOptions>;
  },
  handler: async (args: Arguments<RunClusterOptions>) =>
    await runClusterHandler(args),
};

export const commands = [runBundleCommand, runClusterCommand];
export const commandMap = {
  runBundle: runBundleCommand,
  runCluster: runClusterCommand,
};

/**
 * Runs a bundle using the ocap kernel.
 *
 * @param args - The yargs arguments.
 */
export async function runBundleHandler(
  args: Arguments<RunBundleOptions>,
): Promise<void> {
  const { bundlePath, methodName, bundleParams } = args;
  const logger = makeDemoLogger(resolve(bundlePath, '..'));

  logger.log(`Attempting to run bundle "${bundlePath}"...`);

  try {
    const result = await runBundle(bundlePath, methodName, {
      bundleParameters: JSON.parse(bundleParams),
      logger,
    });
    logger.log('Result:', result);
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error('Failed:', error.message);
    } else {
      logger.error('Error:', error);
    }
  }
}

/**
 * Runs a cluster using the ocap kernel.
 *
 * @param args - The yargs arguments.
 */
export async function runClusterHandler(
  args: Arguments<RunClusterOptions>,
): Promise<void> {
  const { clusterPath } = args;
  const logger = makeDemoLogger(resolve(clusterPath, '..'));

  logger.log(`Attempting to run cluster "${clusterPath}"...`);

  try {
    const result = await runCluster(clusterPath, { logger });
    logger.log('Result:', result);
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error('Failed:', error.message);
    } else {
      logger.error('Error:', error);
    }
  }
}
