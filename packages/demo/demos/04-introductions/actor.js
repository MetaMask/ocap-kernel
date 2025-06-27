import { E, Far } from '@endo/far';

export function buildRootObject(_, { name = 'anon' }) {
  let contact;

  const callMaybe = (prop) => (contact ? E(contact)[prop]() : 'No contact');

  return Far('root', {
    foo: async () => `${name}.foo ~> ${await callMaybe('bar')}`,
    bar: async () => `${name}.bar ~> ${await callMaybe('qux')}`,
    qux: async () => `${name}.qux ~> ${await callMaybe('zap')}`,
    zap: async () => `${name}.zap`,

    introduce: async (whom) => (contact = whom),
  });
}
