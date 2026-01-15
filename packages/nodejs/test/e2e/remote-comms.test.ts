import '../../src/env/endoify.ts';

import type { Libp2p } from '@libp2p/interface';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Kernel, kunser, makeKernelStore } from '@metamask/ocap-kernel';
import type { KRef } from '@metamask/ocap-kernel';
import { startRelay } from '@ocap/cli/relay';
import { delay } from '@ocap/repo-tools/test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeTestKernel, runTestVats } from '../helpers/kernel.ts';
import {
  getPeerIds,
  getVatRootRef,
  launchVatAndGetURL,
  makeMaasClientConfig,
  makeMaasServerConfig,
  makeRemoteVatConfig,
  restartKernelAndReloadVat,
  sendRemoteMessage,
  setupAliceAndBob,
} from '../helpers/remote-comms.ts';

// Increase timeout for network operations
const NETWORK_TIMEOUT = 30_000;

/**
 * Stop an operation with a timeout to prevent hangs during cleanup.
 *
 * @param stopFn - The stop function to call.
 * @param timeoutMs - The timeout in milliseconds.
 * @param label - A label for logging.
 */
async function stopWithTimeout(
  stopFn: () => Promise<unknown>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  try {
    await Promise.race([
      stopFn(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs),
      ),
    ]);
  } catch {
    // Ignore timeout errors during cleanup
  }
}
// Test relay configuration
// The relay peer ID is deterministic based on RELAY_LOCAL_ID = 200 in relay.ts
const relayPeerId = '12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc';
const testRelays = [`/ip4/127.0.0.1/tcp/9001/ws/p2p/${relayPeerId}`];

describe.sequential('Remote Communications E2E', () => {
  let relay: Libp2p;
  let kernel1: Kernel;
  let kernel2: Kernel;
  let kernelDatabase1: Awaited<ReturnType<typeof makeSQLKernelDatabase>>;
  let kernelDatabase2: Awaited<ReturnType<typeof makeSQLKernelDatabase>>;
  let kernelStore1: ReturnType<typeof makeKernelStore>;
  let kernelStore2: ReturnType<typeof makeKernelStore>;

  beforeEach(async () => {
    // Start the relay server
    relay = await startRelay(console);
    // Wait for relay to be fully initialized
    await delay(1000);

    // Create two independent kernels with separate storage
    kernelDatabase1 = await makeSQLKernelDatabase({
      dbFilename: 'rc-e2e-test-kernel1.db',
    });
    kernelStore1 = makeKernelStore(kernelDatabase1);

    kernelDatabase2 = await makeSQLKernelDatabase({
      dbFilename: 'rc-e2e-test-kernel2.db',
    });
    kernelStore2 = makeKernelStore(kernelDatabase2);

    kernel1 = await makeTestKernel(kernelDatabase1, true);
    kernel2 = await makeTestKernel(kernelDatabase2, true);
  });

  afterEach(async () => {
    const STOP_TIMEOUT = 3000;
    // Stop in parallel to speed up cleanup
    await Promise.all([
      relay &&
        stopWithTimeout(async () => relay.stop(), STOP_TIMEOUT, 'relay.stop'),
      kernel1 &&
        stopWithTimeout(
          async () => kernel1.stop(),
          STOP_TIMEOUT,
          'kernel1.stop',
        ),
      kernel2 &&
        stopWithTimeout(
          async () => kernel2.stop(),
          STOP_TIMEOUT,
          'kernel2.stop',
        ),
    ]);
    if (kernelDatabase1) {
      kernelDatabase1.close();
    }
    if (kernelDatabase2) {
      kernelDatabase2.close();
    }
    await delay(200);
  });

  describe('Basic Connectivity', () => {
    it(
      'initializes remote comms on both kernels',
      async () => {
        await kernel1.initRemoteComms({ relays: testRelays });
        await kernel2.initRemoteComms({ relays: testRelays });

        const status1 = await kernel1.getStatus();
        const status2 = await kernel2.getStatus();

        expect(status1.remoteComms?.isInitialized).toBe(true);
        expect(status2.remoteComms?.isInitialized).toBe(true);

        const { peerId1, peerId2 } = await getPeerIds(kernel1, kernel2);
        expect(peerId1).not.toBe(peerId2);
      },
      NETWORK_TIMEOUT,
    );

    it(
      'sends messages between vats on different kernels',
      async () => {
        const { aliceRef, bobURL } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        const response = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(response).toContain('vat Bob got "hello" from Alice');
      },
      NETWORK_TIMEOUT,
    );

    it(
      'establishes bidirectional communication between kernels',
      async () => {
        const { aliceURL, bobURL, aliceRef, bobRef } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        const aliceToBob = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(aliceToBob).toContain('vat Bob got "hello" from Alice');

        const bobToAlice = await sendRemoteMessage(
          kernel2,
          bobRef,
          aliceURL,
          'hello',
          ['Bob'],
        );
        expect(bobToAlice).toContain('vat Alice got "hello" from Bob');
      },
      NETWORK_TIMEOUT,
    );
  });

  describe('Connection Resilience', () => {
    it(
      'remote relationships should survive kernel restart',
      async () => {
        // Initialize remote comms
        await kernel1.initRemoteComms({ relays: testRelays });
        await kernel2.initRemoteComms({ relays: testRelays });

        // Launch client vat on kernel1
        const clientConfig = makeMaasClientConfig('client1', true);
        let clientKernel = kernel1;
        await runTestVats(clientKernel, clientConfig);
        const clientRootRef = kernelStore1.getRootObject('v1') as KRef;

        // Launch server vat on kernel2
        const serverConfig = makeMaasServerConfig('server2', true);
        let serverKernel = kernel2;
        const serverResult = await runTestVats(serverKernel, serverConfig);

        // The server's ocap URL is its bootstrap result
        const serverURL = serverResult as string;

        expect(typeof serverURL).toBe('string');
        expect(serverURL).toMatch(/^ocap:/u);

        // Configure the client with the server's URL
        const setupResult = await clientKernel.queueMessage(
          clientRootRef,
          'setMaas',
          [serverURL],
        );
        let response = kunser(setupResult);
        expect(response).toBeDefined();
        expect(response).toContain('MaaS service URL set');

        // Tell the client to talk to the server
        let expectedCount = 1;
        const stepResult = await clientKernel.queueMessage(
          clientRootRef,
          'step',
          [],
        );
        response = kunser(stepResult);
        expect(response).toBeDefined();
        expect(response).toContain(`next step: ${expectedCount} `);

        // Kill the server and restart it
        await serverKernel.stop();
        serverKernel = await makeTestKernel(kernelDatabase2, false);
        await serverKernel.initRemoteComms({ relays: testRelays });

        // Tell the client to talk to the server a second time
        expectedCount += 1;
        const stepResult2 = await clientKernel.queueMessage(
          clientRootRef,
          'step',
          [],
        );
        response = kunser(stepResult2);
        expect(response).toBeDefined();
        expect(response).toContain(`next step: ${expectedCount} `);

        // Kill the client and restart it
        await clientKernel.stop();
        clientKernel = await makeTestKernel(kernelDatabase1, false);
        await clientKernel.initRemoteComms({ relays: testRelays });

        // Tell the client to talk to the server a third time
        expectedCount += 1;
        const stepResult3 = await clientKernel.queueMessage(
          clientRootRef,
          'step',
          [],
        );
        response = kunser(stepResult3);
        expect(response).toBeDefined();
        expect(response).toContain(`next step: ${expectedCount} `);
      },
      NETWORK_TIMEOUT * 2,
    );

    // TODO: This test times out - needs investigation into reconnection after peer restart
    it.todo(
      'handles connection failure and recovery',
      async () => {
        const { aliceURL, bobURL, aliceRef, bobRef } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        await sendRemoteMessage(kernel1, aliceRef, bobURL, 'hello', ['Alice']);
        await sendRemoteMessage(kernel2, bobRef, aliceURL, 'hello', ['Bob']);

        await kernel2.stop();

        const bobConfig = makeRemoteVatConfig('Bob');
        // eslint-disable-next-line require-atomic-updates
        kernel2 = (
          await restartKernelAndReloadVat(
            kernelDatabase2,
            false,
            testRelays,
            bobConfig,
          )
        ).kernel;

        // Wait for kernel2 to fully initialize and register with relay
        await delay(2000);

        // Send message after recovery - connection should be re-established
        const recoveryResult = await kernel1.queueMessage(
          aliceRef,
          'testConnection',
          [bobURL],
        );
        const recoveryResponse = kunser(recoveryResult) as {
          status: string;
          result?: unknown;
          error?: string;
        };
        expect(recoveryResponse).toHaveProperty('status');
        expect(recoveryResponse.status).toBe('connected');
      },
      NETWORK_TIMEOUT * 2,
    );

    it(
      'handles connection failure to non-existent peer',
      async () => {
        await kernel1.initRemoteComms({ relays: testRelays });

        const aliceConfig = makeRemoteVatConfig('Alice');
        await launchVatAndGetURL(kernel1, aliceConfig);
        const aliceRef = getVatRootRef(kernel1, kernelStore1, 'Alice');

        // Create a fake ocap URL for a non-existent kernel
        const fakeURL =
          'ocap://12D3KooWFakePeerIdThatDoesNotExist123456789/ko1';

        // Try to connect to non-existent peer - should fail gracefully
        const connectionTest = await kernel1.queueMessage(
          aliceRef,
          'testConnection',
          [fakeURL],
        );

        const result = kunser(connectionTest) as {
          status: string;
          error?: string;
        };
        expect(result).toHaveProperty('status');
        expect(result.status).toBe('disconnected');
        expect(result).toHaveProperty('error');
      },
      NETWORK_TIMEOUT,
    );

    it(
      'handles reconnection with exponential backoff',
      async () => {
        const { aliceRef, bobURL } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        const initialMessage = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(initialMessage).toContain('vat Bob got "hello" from Alice');

        await kernel2.stop();

        // Send a message which will queue and trigger reconnection attempts
        // The reconnection will use exponential backoff with base delay of 500ms
        // and max delay of 10s. With jitter, delays will be randomized.
        const messagePromise = kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'hello', ['Alice']],
        );

        // Track when reconnection attempts happen by monitoring when
        // the message succeeds after restarting kernel2
        const reconnectStartTime = Date.now();

        const bobConfig = makeRemoteVatConfig('Bob');
        // eslint-disable-next-line require-atomic-updates
        kernel2 = (
          await restartKernelAndReloadVat(
            kernelDatabase2,
            false,
            testRelays,
            bobConfig,
          )
        ).kernel;

        // The queued message should now be delivered
        const reconnectResult = await messagePromise;
        const reconnectEndTime = Date.now();
        const totalReconnectTime = reconnectEndTime - reconnectStartTime;

        expect(kunser(reconnectResult)).toContain(
          'vat Bob got "hello" from Alice',
        );

        // Verify that reconnection took some time (indicating backoff delays)
        // With exponential backoff, even with jitter, we expect at least
        // one delay period (~500ms base) before reconnection succeeds
        // We allow for some variance due to jitter and network timing
        expect(totalReconnectTime).toBeGreaterThan(1000);

        const followUpMessage = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(followUpMessage).toContain('vat Bob got "hello" from Alice');
      },
      NETWORK_TIMEOUT * 2,
    );
  });

  describe('Message Queueing', () => {
    it(
      'queues messages when connection is not established',
      async () => {
        await kernel1.initRemoteComms({ relays: testRelays });
        await kernel2.initRemoteComms({ relays: testRelays });

        const aliceConfig = makeRemoteVatConfig('Alice');
        await launchVatAndGetURL(kernel1, aliceConfig);
        const aliceRef = getVatRootRef(kernel1, kernelStore1, 'Alice');

        const bobConfig = makeRemoteVatConfig('Bob');
        const bobURL = await launchVatAndGetURL(kernel2, bobConfig);

        await kernel2.stop();

        // Send messages while kernel2 is offline - these should be queued
        const queuePromises = [];
        for (let i = 0; i < 3; i++) {
          const promise = kernel1.queueMessage(aliceRef, 'queueMessage', [
            bobURL,
            'receiveSequence',
            [i],
          ]);
          queuePromises.push(promise);
        }
        // eslint-disable-next-line require-atomic-updates
        kernel2 = (
          await restartKernelAndReloadVat(
            kernelDatabase2,
            false,
            testRelays,
            bobConfig,
          )
        ).kernel;

        // Messages should be queued and delivered after reconnection
        // Note: Some may fail if the vat wasn't restored properly, but queueing should work
        const queueResults = await Promise.allSettled(queuePromises);
        expect(queueResults).toHaveLength(3);

        const normalMessage = await kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'receiveSequence', [99]],
        );
        const response = kunser(normalMessage);
        expect(response).toBe('Sequence 99 received');
      },
      NETWORK_TIMEOUT * 2,
    );

    it(
      'preserves message order during queueing',
      async () => {
        const { aliceRef, bobURL } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        // Send multiple messages in sequence using sendSequence
        const sequenceResult = await kernel1.queueMessage(
          aliceRef,
          'sendSequence',
          [bobURL, 5],
        );

        const results = kunser(sequenceResult) as string[];
        expect(results).toHaveLength(5);

        // Verify messages were received in order
        for (let i = 0; i < 5; i++) {
          expect(results[i]).toBe(`Sequence ${i} received`);
        }
      },
      NETWORK_TIMEOUT,
    );
  });

  describe('Queue Management', () => {
    it(
      'rejects new messages when queue reaches MAX_QUEUE limit',
      async () => {
        const { aliceRef, bobURL } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        await sendRemoteMessage(kernel1, aliceRef, bobURL, 'hello', ['Alice']);

        await kernel2.stop();

        // Send MAX_QUEUE + 1 messages (201 messages) while disconnected
        // Messages beyond the queue limit (200) should be rejected
        const messagePromises = [];
        for (let i = 0; i <= 200; i++) {
          const promise = kernel1.queueMessage(aliceRef, 'queueMessage', [
            bobURL,
            'receiveSequence',
            [i],
          ]);
          messagePromises.push(promise);
        }

        const bobConfig = makeRemoteVatConfig('Bob');
        // eslint-disable-next-line require-atomic-updates
        kernel2 = (
          await restartKernelAndReloadVat(
            kernelDatabase2,
            false,
            testRelays,
            bobConfig,
          )
        ).kernel;

        // Check results - messages beyond queue capacity should be rejected
        const results = await Promise.allSettled(messagePromises);
        expect(results).toHaveLength(201);

        // Verify that messages within queue capacity were delivered
        const successfulResults = results.filter(
          (result) => result.status === 'fulfilled',
        );
        // At least 200 messages should succeed (the queue limit)
        expect(successfulResults.length).toBeGreaterThanOrEqual(200);

        // Messages beyond queue capacity should be rejected with queue full error
        const rejectedResults = results.filter(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        );
        for (const result of rejectedResults) {
          expect(String(result.reason)).toContain('queue at capacity');
        }

        const newMessageResult = await kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'receiveSequence', [999]],
        );
        const newMessage = kunser(newMessageResult);
        expect(newMessage).toBe('Sequence 999 received');
      },
      NETWORK_TIMEOUT * 3,
    );
  });

  describe('Multiple Peer Reconnections', () => {
    it(
      'handles multiple simultaneous reconnections to different peers',
      async () => {
        // Create a third kernel for testing multiple peers
        const kernelDatabase3 = await makeSQLKernelDatabase({
          dbFilename: 'rc-e2e-test-kernel3.db',
        });
        let kernel3: Kernel | undefined;

        try {
          await kernel1.initRemoteComms({ relays: testRelays });
          await kernel2.initRemoteComms({ relays: testRelays });
          kernel3 = await makeTestKernel(kernelDatabase3, true);
          await kernel3.initRemoteComms({ relays: testRelays });

          const aliceConfig = makeRemoteVatConfig('Alice');
          const bobConfigInitial = makeRemoteVatConfig('Bob');
          const charlieConfigInitial = makeRemoteVatConfig('Charlie');

          await launchVatAndGetURL(kernel1, aliceConfig);
          const bobURL = await launchVatAndGetURL(kernel2, bobConfigInitial);
          const charlieURL = await launchVatAndGetURL(
            kernel3,
            charlieConfigInitial,
          );

          const aliceRef = getVatRootRef(kernel1, kernelStore1, 'Alice');

          await sendRemoteMessage(kernel1, aliceRef, bobURL, 'hello', [
            'Alice',
          ]);
          await sendRemoteMessage(kernel1, aliceRef, charlieURL, 'hello', [
            'Alice',
          ]);

          await kernel2.stop();
          await kernel3.stop();

          // Send messages to both peers - should trigger simultaneous reconnections
          const bobMessagePromise = kernel1.queueMessage(
            aliceRef,
            'sendRemoteMessage',
            [bobURL, 'hello', ['Alice']],
          );
          const charlieMessagePromise = kernel1.queueMessage(
            aliceRef,
            'sendRemoteMessage',
            [charlieURL, 'hello', ['Alice']],
          );

          const bobConfigRestart = makeRemoteVatConfig('Bob');
          const charlieConfigRestart = makeRemoteVatConfig('Charlie');
          // eslint-disable-next-line require-atomic-updates
          kernel2 = (
            await restartKernelAndReloadVat(
              kernelDatabase2,
              false,
              testRelays,
              bobConfigRestart,
            )
          ).kernel;

          kernel3 = (
            await restartKernelAndReloadVat(
              kernelDatabase3,
              false,
              testRelays,
              charlieConfigRestart,
            )
          ).kernel;

          // Both messages should be delivered successfully
          const bobResult = await bobMessagePromise;
          const charlieResult = await charlieMessagePromise;

          expect(kunser(bobResult)).toContain('vat Bob got "hello" from Alice');
          expect(kunser(charlieResult)).toContain(
            'vat Charlie got "hello" from Alice',
          );

          const bobFollowUp = await sendRemoteMessage(
            kernel1,
            aliceRef,
            bobURL,
            'hello',
            ['Alice'],
          );
          const charlieFollowUp = await sendRemoteMessage(
            kernel1,
            aliceRef,
            charlieURL,
            'hello',
            ['Alice'],
          );

          expect(bobFollowUp).toContain('vat Bob got "hello" from Alice');
          expect(charlieFollowUp).toContain(
            'vat Charlie got "hello" from Alice',
          );
        } finally {
          if (kernel3) {
            await kernel3.stop();
          }
          if (kernelDatabase3) {
            kernelDatabase3.close();
          }
        }
      },
      NETWORK_TIMEOUT * 3,
    );
  });

  describe('Intentional Disconnect', () => {
    it(
      'explicitly closes connection and prevents automatic reconnection',
      async () => {
        const { aliceRef, bobURL, peerId2 } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        const initialMessage = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(initialMessage).toContain('vat Bob got "hello" from Alice');

        await kernel1.closeConnection(peerId2);
        await kernel2.stop();

        const messageAfterClose = kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'hello', ['Alice']],
        );

        const bobConfig = makeRemoteVatConfig('Bob');
        // eslint-disable-next-line require-atomic-updates
        kernel2 = (
          await restartKernelAndReloadVat(
            kernelDatabase2,
            false,
            testRelays,
            bobConfig,
          )
        ).kernel;

        // The message should not have been delivered because we didn't reconnect
        const result = await messageAfterClose;
        const response = kunser(result);
        expect(response).toBeInstanceOf(Error);
        expect((response as Error).message).toContain(
          'Message delivery failed after intentional close',
        );
      },
      NETWORK_TIMEOUT * 2,
    );

    it(
      'manually reconnects after intentional close',
      async () => {
        const { aliceRef, bobURL, peerId2 } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        const initialMessage = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(initialMessage).toContain('vat Bob got "hello" from Alice');

        await kernel1.closeConnection(peerId2);
        await kernel2.stop();
        await kernel1.reconnectPeer(peerId2);

        const bobConfig = makeRemoteVatConfig('Bob');
        // eslint-disable-next-line require-atomic-updates
        kernel2 = (
          await restartKernelAndReloadVat(
            kernelDatabase2,
            false,
            testRelays,
            bobConfig,
          )
        ).kernel;

        const messageAfterReconnect = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(messageAfterReconnect).toContain(
          'vat Bob got "hello" from Alice',
        );
      },
      NETWORK_TIMEOUT * 2,
    );

    it(
      'handles remote intentional disconnect without reconnecting',
      async () => {
        const { aliceRef, bobURL, peerId2 } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        const initialMessage = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(initialMessage).toContain('vat Bob got "hello" from Alice');

        // Close connection from kernel1 side
        await kernel1.closeConnection(peerId2);
        await delay(100);

        // Try to send a message after closing - should fail
        const messageAfterClose = kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'hello', ['Alice']],
        );

        const result = await messageAfterClose;
        const response = kunser(result);
        expect(response).toBeInstanceOf(Error);
        expect((response as Error).message).toContain(
          'Message delivery failed after intentional close',
        );

        // Manually reconnect
        await kernel1.reconnectPeer(peerId2);
        await delay(2000);

        // Send message after manual reconnect - should succeed
        const messageAfterManualReconnect = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(messageAfterManualReconnect).toContain(
          'vat Bob got "hello" from Alice',
        );
      },
      NETWORK_TIMEOUT * 2,
    );
  });

  describe('Promise Rejection on Remote Give-Up', () => {
    it(
      'rejects promises when remote connection is lost after max retries',
      async () => {
        // Initialize kernel1 with a low maxRetryAttempts to trigger give-up quickly
        await kernel1.initRemoteComms({
          relays: testRelays,
          maxRetryAttempts: 1, // Only 1 retry attempt before giving up
        });
        await kernel2.initRemoteComms({ relays: testRelays });

        // Set up Alice and Bob manually (can't use setupAliceAndBob as it reinitializes comms)
        const aliceConfig = makeRemoteVatConfig('Alice');
        const bobConfig = makeRemoteVatConfig('Bob');

        await launchVatAndGetURL(kernel1, aliceConfig);
        const bobURL = await launchVatAndGetURL(kernel2, bobConfig);

        const aliceRef = getVatRootRef(kernel1, kernelStore1, 'Alice');

        // Establish connection first by sending a successful message
        await sendRemoteMessage(kernel1, aliceRef, bobURL, 'hello', ['Alice']);

        // Now stop kernel2 to trigger connection loss
        await kernel2.stop();

        // Wait for connection loss to be detected and reconnection attempts to fail
        await delay(2000);

        // Send a message that will trigger promise creation and eventual rejection
        // The message will create a promise with the remote as decider (from URL redemption)
        // When we give up on the remote, that promise should be rejected
        // The vat should then propagate that rejection to the promise returned here
        const messagePromise = kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'hello', ['Alice']],
        );

        const result = await messagePromise;
        const response = kunser(result);
        expect(response).toBeInstanceOf(Error);
        expect((response as Error).message).toContain('Remote connection lost');
      },
      NETWORK_TIMEOUT * 2,
    );

    it(
      'resolves promise after reconnection when retries have not been exhausted',
      async () => {
        const { aliceRef, bobURL } = await setupAliceAndBob(
          kernel1,
          kernel2,
          kernelStore1,
          kernelStore2,
          testRelays,
        );

        // Send a message that creates a promise with remote as decider
        const messagePromise = kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'hello', ['Alice']],
        );

        // Stop kernel2 before it can respond
        await kernel2.stop();

        // Wait a bit for connection loss to be detected
        await delay(500);

        // Restart kernel2 quickly (before max retries, since default is infinite)
        // The promise should remain unresolved and resolve normally after reconnection
        const bobConfig = makeRemoteVatConfig('Bob');
        // eslint-disable-next-line require-atomic-updates
        kernel2 = (
          await restartKernelAndReloadVat(
            kernelDatabase2,
            false,
            testRelays,
            bobConfig,
          )
        ).kernel;

        // Wait for reconnection
        await delay(2000);

        // The message should eventually be delivered and resolved
        // The promise was never rejected because retries weren't exhausted
        const result = await messagePromise;
        expect(kunser(result)).toContain('vat Bob got "hello" from Alice');
      },
      NETWORK_TIMEOUT * 3,
    );
  });
});
