import { Fail } from '@endo/errors';

type RefParts = {
  context: 'kernel' | 'vat' | 'remote';
  direction?: 'export' | 'import';
  isPromise: boolean;
  index: string;
};

/**
 * Parse an alleged ref string into its components.
 *
 * @param ref - The string to be parsed.
 *
 * @returns an object with all of the ref string components as individual properties.
 */
export function parseRef(ref: string): RefParts {
  let context;
  let typeIdx = 1;

  switch (ref[0]) {
    case 'k':
      context = 'kernel';
      break;
    case 'o':
    case 'p':
      typeIdx = 0;
      context = 'vat';
      break;
    case 'r':
      context = 'remote';
      break;
    case undefined:
    default:
      Fail`invalid reference context ${ref[0]}`;
  }
  if (ref[typeIdx] !== 'p' && ref[typeIdx] !== 'o') {
    Fail`invalid reference type ${ref[typeIdx]}`;
  }
  const isPromise = ref[typeIdx] === 'p';
  let direction;
  let index;
  if (context === 'kernel') {
    index = ref.slice(2);
  } else {
    const dirIdx = typeIdx + 1;
    if (ref[dirIdx] !== '+' && ref[dirIdx] !== '-') {
      Fail`invalid reference direction ${ref[dirIdx]}`;
    }
    direction = ref[dirIdx] === '+' ? 'export' : 'import';
    index = ref.slice(dirIdx + 1);
  }
  return {
    context,
    direction,
    isPromise,
    index,
  } as RefParts;
}
