import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for a vat that supports remote communication testing.
 * This vat can both send and receive remote messages through ocap URLs.
 *
 * @param {object} vatPowers - Special powers granted to this vat.
 * @param {object} vatPowers.logger - The logger object.
 * @param {object} parameters - Initialization parameters from the vat's config object.
 * @param {string} parameters.name - The name of the vat. Defaults to 'RemoteVat'.
 * @param {object} baggage - Root of vat's persistent state for storing services.
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject({ logger }, parameters, baggage) {
  const name = parameters?.name ?? 'RemoteVat';
  logger.log(`buildRootObject "${name}"`);

  // Restore services from baggage if they exist (after kernel restart)
  let issuerService = baggage.has('issuerService')
    ? baggage.get('issuerService')
    : undefined;
  let redeemerService = baggage.has('redeemerService')
    ? baggage.get('redeemerService')
    : undefined;

  if (issuerService) {
    logger.log(`${name} restored issuerService from baggage`);
  }
  if (redeemerService) {
    logger.log(`${name} restored redeemerService from baggage`);
  }

  let messageLog = [];
  let connectionState = issuerService ? 'ready' : 'disconnected';
  let queuedMessages = [];

  /**
   * Helper function for sending remote messages.
   * @param {string} remoteURL - The URL to send the message to.
   * @param {string} method - The method to call on the remote object.
   * @param {unknown[]} args - The arguments to pass to the method.
   * @returns {Promise<unknown>} The result of the method call.
   */
  async function sendRemoteMessageHelper(remoteURL, method, args = []) {
    logger.log(`${name} attempting to redeem URL: ${remoteURL}`);

    if (!redeemerService) {
      throw new Error('ocapURLRedemptionService not available');
    }

    try {
      connectionState = 'connecting';
      const remoteObject = await E(redeemerService).redeem(remoteURL);
      connectionState = 'connected';
      logger.log(`${name} redeemed URL successfully`);

      const result = await E(remoteObject)[method](...args);
      logger.log(`${name} got result:`, result);
      messageLog.push({ type: 'sent', method, args, result });
      return result;
    } catch (error) {
      connectionState = 'error';
      logger.log(`${name} error sending message:`, error.message);
      throw error;
    }
  }

  const remoteVat = makeDefaultExo('remoteVatRoot', {
    async bootstrap(_vats, services) {
      logger.log(`vat ${name} is bootstrap`);
      issuerService = services.ocapURLIssuerService;
      redeemerService = services.ocapURLRedemptionService;

      // Save services to baggage for persistence across kernel restarts
      if (issuerService && !baggage.has('issuerService')) {
        baggage.init('issuerService', issuerService);
        logger.log(`${name} saved issuerService to baggage`);
      }
      if (redeemerService && !baggage.has('redeemerService')) {
        baggage.init('redeemerService', redeemerService);
        logger.log(`${name} saved redeemerService to baggage`);
      }

      connectionState = 'ready';

      // Issue an ocap URL for this vat so others can connect to it
      if (issuerService) {
        const myUrl = await E(issuerService).issue(remoteVat);
        logger.log(`${name} issued ocap URL: ${myUrl}`);
        return myUrl;
      }

      return `${name} bootstrap complete`;
    },

    // Remote message handling methods
    async sendRemoteMessage(remoteURL, method, args = []) {
      return sendRemoteMessageHelper(remoteURL, method, args);
    },

    // Method that can be called remotely
    hello(from) {
      const message = `vat ${name} got "hello" from ${from}`;
      logger.log(message);
      messageLog.push({ type: 'received', from, message });
      return message;
    },

    // Method for testing message queueing
    async queueMessage(remoteURL, method, args = []) {
      const messageId = queuedMessages.length;
      queuedMessages.push({
        id: messageId,
        remoteURL,
        method,
        args,
        status: 'queued',
      });

      try {
        const result = await sendRemoteMessageHelper(remoteURL, method, args);
        // eslint-disable-next-line require-atomic-updates
        queuedMessages[messageId].status = 'sent';
        // eslint-disable-next-line require-atomic-updates
        queuedMessages[messageId].result = result;
        return { messageId, result };
      } catch (error) {
        queuedMessages[messageId].status = 'failed';
        queuedMessages[messageId].error = error.message;
        throw error;
      }
    },

    // Method for testing connection resilience
    async testConnection(remoteURL) {
      try {
        const result = await sendRemoteMessageHelper(remoteURL, 'ping', []);
        return { status: 'connected', result };
      } catch (error) {
        return { status: 'disconnected', error: error.message };
      }
    },

    // Method that can be called to test connectivity
    ping() {
      logger.log(`${name} received ping`);
      return `pong from ${name}`;
    },

    // Method for testing large messages
    async sendLargeMessage(remoteURL, size = 1024) {
      const largeData = 'x'.repeat(size);
      return sendRemoteMessageHelper(remoteURL, 'receiveLargeMessage', [
        largeData,
      ]);
    },

    receiveLargeMessage(data) {
      logger.log(`${name} received large message of size ${data.length}`);
      messageLog.push({ type: 'received', size: data.length });
      return `Received ${data.length} bytes`;
    },

    // Method for testing message ordering
    async sendSequence(remoteURL, count = 5) {
      const results = [];
      for (let i = 0; i < count; i++) {
        const result = await sendRemoteMessageHelper(
          remoteURL,
          'receiveSequence',
          [i],
        );
        results.push(result);
      }
      return results;
    },

    receiveSequence(seq) {
      logger.log(`${name} received sequence ${seq}`);
      messageLog.push({ type: 'sequence', seq });
      return `Sequence ${seq} received`;
    },

    // Method for testing error handling
    async triggerError() {
      throw new Error(`Intentional error from ${name}`);
    },

    // Method to get current state for debugging
    getState() {
      return {
        name,
        connectionState,
        messageCount: messageLog.length,
        queuedCount: queuedMessages.length,
        lastMessages: messageLog.slice(-5),
      };
    },

    // Method to reset state
    reset() {
      messageLog = [];
      queuedMessages = [];
      connectionState = 'ready';
      return `${name} state reset`;
    },

    // Advanced test method for remote execution
    async doRunRun(remoteURL) {
      logger.log(`${name} executing doRunRun with URL: ${remoteURL}`);

      if (!redeemerService) {
        throw new Error('ocapURLRedemptionService not available');
      }

      try {
        const remoteObject = await E(redeemerService).redeem(remoteURL);
        const result = await E(remoteObject).hello(`remote ${name}`);
        return result;
      } catch (error) {
        logger.log(`${name} doRunRun error:`, error.message);
        throw error;
      }
    },
  });

  return remoteVat;
}
