import { Far } from '@endo/far';

export function buildRootObject() {
  let value = 0;
  return Far('root', {
    get: () => value,
    inc: () => value++,
    reset: () => (value = 0),
  });
}
