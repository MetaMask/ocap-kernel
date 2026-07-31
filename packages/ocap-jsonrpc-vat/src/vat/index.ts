/**
 * Ocap JSON-RPC vat.
 *
 * Serves a line-delimited JSON-RPC 2.0 interface on a Unix-domain-socket
 * `IOService` endowment named `socket`. External processes connect and
 * call `redeemURL(url)` and `send(target, method, args)` — see the
 * package README for the wire protocol.
 *
 * The vat's authority is exactly:
 *   - the `ocapURLRedemptionService` endowment (for `redeemURL`),
 *   - whatever references the URLs happen to redeem to,
 *   - and whatever those references introduce as return values.
 *
 * The vat has no other public facet: the socket is the sole interface.
 */

import { E } from '@endo/eventual-send';
import { passStyleOf } from '@endo/pass-style';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage, OcapURLRedemptionService } from '@metamask/ocap-kernel';

import { makeBridge } from '../bridge.ts';
import { BridgeRpcError, JSON_RPC_ERROR } from '../json-rpc.ts';
import type { JsonRpcResponse } from '../json-rpc.ts';

/**
 * The vat-facing shape of an `IOService`. The kernel-side implementation
 * lives in `packages/ocap-kernel/src/io/io-service.ts` and is wired via
 * the cluster config's `io` block.
 */
type IOService = {
  read: () => Promise<string | null>;
  write: (data: string) => Promise<void>;
};

type Services = {
  ocapURLRedemptionService: OcapURLRedemptionService;
  socket: IOService;
};

/**
 * Build the vat's root object.
 *
 * The `@@o<n>` name table lives in ordinary closure state and is
 * intentionally non-durable — each re-incarnation begins with an
 * empty table. The services endowments delivered to `bootstrap` are
 * stashed in baggage so that on re-incarnation `buildRootObject` can
 * restart the socket serve loop without bootstrap having to run
 * again (bootstrap only runs once per subcluster lifetime, not on
 * every daemon restart).
 *
 * @param _vatPowers - Unused.
 * @param _parameters - Unused.
 * @param baggage - Vat baggage. Used to persist the services endowment
 * bag so the serve loop can be resumed on re-incarnation.
 * @returns The vat root exo.
 */
export function buildRootObject(
  _vatPowers: unknown,
  _parameters: unknown,
  baggage: Baggage,
): unknown {
  const log = (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    console.log('[ocap-jsonrpc-vat]', ...args);
  };

  const isRemotable = (value: unknown): boolean => {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    try {
      const style: string = passStyleOf(value as never);
      return style === 'remotable';
    } catch {
      return false;
    }
  };

  /**
   * Read one request line, dispatch it, and write the response. Never
   * throws to its caller — decoding, dispatch, and encoding errors are
   * either logged and swallowed (when we can't recover an id to reply
   * on) or packaged as JSON-RPC error responses.
   *
   * @param socket - The socket IOService.
   * @param dispatch - The bridge's dispatch function.
   * @returns 'ok' after processing a request, 'disconnect' if the socket
   * signalled end-of-stream, and 'closed' if the socket itself is gone.
   */
  async function processOne(
    socket: IOService,
    dispatch: (request: unknown) => Promise<JsonRpcResponse>,
  ): Promise<'ok' | 'disconnect' | 'closed'> {
    let line: string | null;
    try {
      line = await E(socket).read();
    } catch (error) {
      log('socket read failed:', error);
      return 'closed';
    }
    if (line === null) {
      return 'disconnect';
    }
    let request: unknown;
    try {
      request = JSON.parse(line);
    } catch (error) {
      log('failed to parse request line as JSON; dropping:', error);
      return 'ok';
    }
    const response = await dispatch(request);
    try {
      await E(socket).write(JSON.stringify(response));
    } catch (error) {
      log('failed to write response:', error);
      return 'closed';
    }
    return 'ok';
  }

  /**
   * Serve one socket connection lifetime: build a bridge, drive the
   * request loop, reset on disconnect, and repeat until the socket
   * itself goes away.
   *
   * @param services - The endowments delivered by bootstrap.
   */
  async function serveLoop(services: Services): Promise<void> {
    const bridge = makeBridge({
      redeem: async (url) => E(services.ocapURLRedemptionService).redeem(url),
      invoke: async (target, method, args) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        E(target as any)[method](...args),
      isRemotable,
    });
    for (;;) {
      const outcome = await processOne(services.socket, bridge.dispatch);
      if (outcome === 'closed') {
        log('socket closed; ending serve loop');
        return;
      }
      if (outcome === 'disconnect') {
        log('client disconnected; resetting session');
        bridge.resetSession();
      }
    }
  }

  /**
   * Kick off the socket loop as a background task. Any crash inside
   * it is logged; the vat itself remains alive so it can be
   * introspected.
   *
   * @param services - The endowments to serve against.
   */
  const startServeLoop = (services: Services): void => {
    serveLoop(services).catch((error) => log('serve loop crashed:', error));
  };

  // On re-incarnation (e.g. after `daemon stop`/`daemon start`),
  // bootstrap is not re-run — but this `buildRootObject` is. Read the
  // previously-stashed services out of baggage and resume the loop.
  // Deferred to a microtask so vat init completes and the vat is
  // fully connected to kernel dispatch before we start issuing E()
  // calls on the restored service refs.
  if (baggage.has('services')) {
    const restored = baggage.get('services') as Services;
    Promise.resolve()
      .then(() => {
        startServeLoop(restored);
        log('vat re-incarnated; serve loop resumed');
        return undefined;
      })
      .catch((error) =>
        log('failed to resume serve loop on re-incarnation:', error),
      );
  }

  return makeDefaultExo('ocapJsonrpcVatRoot', {
    async bootstrap(_vats: Record<string, unknown>, incoming: Services) {
      if (!incoming?.ocapURLRedemptionService) {
        throw new BridgeRpcError(
          JSON_RPC_ERROR.INTERNAL_ERROR,
          'ocapURLRedemptionService is required',
        );
      }
      if (!incoming.socket) {
        throw new BridgeRpcError(
          JSON_RPC_ERROR.INTERNAL_ERROR,
          'socket IOService is required (configure it in the cluster config under `io.socket`)',
        );
      }
      if (baggage.has('services')) {
        baggage.set('services', incoming);
      } else {
        baggage.init('services', incoming);
      }
      startServeLoop(incoming);
      log('vat bootstrap complete');
      return harden({});
    },
  });
}
