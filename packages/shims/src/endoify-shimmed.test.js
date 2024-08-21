// eslint-disable-next-line import-x/no-unassigned-import, import-x/no-unresolved
import '@ocap/shims/endoify';
// eslint-disable-next-line import-x/no-unresolved
import test from 'ava';

/* eslint-disable id-length */

test('endoify calls lockdown', (t) => {
  t.assert(Object.isFrozen(Array.prototype)); // Due to `lockdown()`, and therefore `ses`
});

test('endoify loads eventual-send', (t) => {
  t.assert(typeof HandledPromise !== 'undefined'); // Due to eventual send
});

/* eslint-enable id-length */
