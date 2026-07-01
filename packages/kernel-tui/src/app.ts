import '@metamask/kernel-shims/endoify-node';
import { getSocketPath } from '@metamask/kernel-node-runtime/daemon';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { makeDaemonKernelApi } from './hooks/use-kernel.ts';
import { runModal } from './modal.tsx';
import { startTui } from './start-tui.ts';

const yargsInstance = yargs(hideBin(process.argv))
  .scriptName('ocap-tui')
  .usage('$0 <command> [options]')
  .demandCommand(1)
  .strict()
  .command(
    'tui',
    'Open the full interactive kernel TUI (connected to the daemon)',
    (_yargs) =>
      _yargs.option('socket-path', {
        type: 'string',
        describe: 'Daemon socket path (defaults to standard path)',
        default: getSocketPath(),
      }),
    async (args) => {
      const kernelApi = makeDaemonKernelApi(args['socket-path']);
      await startTui({ cwd: process.cwd(), kernelApi });
    },
  )
  .command(
    'modal <ocap-url>',
    'Open an interactive TUI for a modal channel',
    (_yargs) =>
      _yargs.positional('ocap-url', {
        type: 'string',
        demandOption: true,
        describe: 'OCAP URL of the channel (from `ocap session create`)',
      }),
    async (args) => {
      await runModal(args['ocap-url']);
    },
  );

await yargsInstance.help('help').parse();
