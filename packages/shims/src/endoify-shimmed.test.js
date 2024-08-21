import '@ocap/shims/endoify';
import test from "ava";

test('endoify calls lockdown', (t) => {
  t.assert(Object.isFrozen(Array.prototype)); // Due to `lockdown()`, and therefore `ses`
});

test('endoify loads eventual-send', (t) => {
  t.assert(typeof HandledPromise !== 'undefined'); // Due to eventual send
});
