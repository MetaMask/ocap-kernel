import test from "ava";

test('lockdown not called', (t) => {
  t.assert(!Object.isFrozen(Array.prototype)); // Due to `lockdown()`, and therefore `ses`
});

test('eventual-send not loaded', (t) => {
  t.assert(typeof HandledPromise === 'undefined'); // Due to eventual send
});
