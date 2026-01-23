/**
 * Console forwarding prelude script.
 *
 * This script MUST run BEFORE the main bundle to capture all console output,
 * including logs during module imports and initialization.
 *
 * It wraps console methods to forward messages to the background service worker
 * via chrome.runtime.sendMessage, which is available immediately without needing
 * to wait for stream setup.
 */
(function () {
  'use strict';

  // Only run in extension context with chrome.runtime available
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return;
  }

  const originalConsole = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  const methods = ['log', 'debug', 'info', 'warn', 'error'];

  /**
   * Serialize an argument for transmission.
   *
   * @param {unknown} arg - The argument to serialize.
   * @returns {string} The serialized argument.
   */
  function serialize(arg) {
    if (typeof arg === 'string') {
      return arg;
    }
    if (typeof arg === 'number' || typeof arg === 'boolean') {
      return String(arg);
    }
    if (arg === null) {
      return 'null';
    }
    if (arg === undefined) {
      return 'undefined';
    }
    try {
      return JSON.stringify(arg);
    } catch (_error) {
      return '[unserializable]';
    }
  }

  methods.forEach(function (method) {
    /**
     *
     */
    console[method] = function () {
      // Call original console method for local output
      originalConsole[method].apply(console, arguments);

      // Serialize arguments for transmission
      const args = [];
      for (let i = 0; i < arguments.length; i++) {
        args.push(serialize(arguments[i]));
      }

      // Forward to background via chrome.runtime.sendMessage
      try {
        chrome.runtime.sendMessage({
          type: 'console-forward-prelude',
          method,
          args,
        });
      } catch (_error) {
        // Ignore errors - background may not be ready yet
      }
    };
  });
})();
