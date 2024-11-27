import { Baggage } from './baggage';

/**
 * Provide an object from the baggage.
 *
 * @param baggage - The baggage to provide the object from.
 * @param name - The name of the object to provide.
 * @param initial - The initial value of the object.
 * @returns The provided object.
 */
export async function provideObject<Value extends Record<string, unknown>>(
  baggage: Baggage,
  name: string,
  initial: Value,
): Promise<Value> {
  const existing = await baggage.get(name);
  if (existing) {
    return existing as Value;
  }
  await baggage.set(name, initial);
  return initial;
}

export type ProvideObject = typeof provideObject;
