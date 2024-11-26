import { Baggage } from './baggage';
import { Collection } from './collections';
import { WeakCollection } from './weak-collections';

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

/**
 * Provide a collection from the baggage.
 *
 * @param baggage - The baggage to provide the collection from.
 * @param name - The name of the collection to provide.
 * @returns The provided collection.
 */
export async function provideCollection<Value>(
  baggage: Baggage,
  name: string,
): Promise<Collection<string, Value>> {
  const existing = await baggage.get(name);
  if (existing) {
    return existing as Collection<string, Value>;
  }

  // Create new collection with proper ID
  const collection = await baggage.createCollection<Value>(name);
  await baggage.set(name, collection);
  return collection;
}

/**
 * Provide a weak collection from the baggage.
 *
 * @param baggage - The baggage to provide the weak collection from.
 * @param name - The name of the weak collection to provide.
 * @returns The provided weak collection.
 */
export async function provideWeakCollection<Value extends object>(
  baggage: Baggage,
  name: string,
): Promise<WeakCollection<string, Value>> {
  const existing = await baggage.get(name);
  if (existing) {
    return existing as WeakCollection<string, Value>;
  }

  const collection = await baggage.createWeakCollection<Value>(name);
  await baggage.set(name, collection);
  return collection;
}
