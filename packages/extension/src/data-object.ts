/**
 * Transcribed with care from @chipmorningstar's "Notes on the Design of an Ocap Kernel"
 */
import { isObject } from '@metamask/utils';

import type { ObjectReference, SlotReference } from './reference.js';
import { isObjectReference, isSlotReference } from './reference.js';

type Primitive = boolean | number | string | null;

const isPrimitive = (value: unknown): value is Primitive =>
  ['boolean', 'number', 'string', 'null'].includes(typeof value);

const isArray = <Element>(
  value: unknown,
  isElement: (ele: unknown) => ele is Element,
): value is Element[] => value instanceof Array && value.every(isElement);

// A la python's dict
const isDict = <Value>(
  value: unknown,
  isValue: (val: unknown) => val is Value,
): value is { [prop: string]: Value } =>
  isObject(value) && Array.from(Object(value).values()).every(isValue);

/**
 * A ReferencedDataObject is essentially JSON with ObjectReferences.
 * The generic Reference could be either a bona fide ObjectReference
 * or a pointer to a slot containing an ObjectReference.
 */
type ReferencedDataObject<Reference extends ObjectReference | SlotReference> =
  | Primitive
  | Reference
  | ReferencedDataObject<Reference>[]
  | { [key: string]: ReferencedDataObject<Reference> };

const isReferencedDataObject = <
  Reference extends ObjectReference | SlotReference,
>(
  value: unknown,
  isReference: (value: unknown) => value is Reference,
): value is ReferencedDataObject<Reference> =>
  isPrimitive(value) ||
  isReference(value) ||
  isArray<ReferencedDataObject<Reference>>(value, (ele) =>
    isReferencedDataObject<Reference>(ele, isReference),
  ) ||
  isDict<ReferencedDataObject<Reference>>(value, (val) =>
    isReferencedDataObject<Reference>(val, isReference),
  );

export type MarshalledDataObject = {
  slots: ObjectReference[];
  body: ReferencedDataObject<SlotReference>;
};

/**
 * A type guard for MarshalledDataObjects.
 *
 * By separating the ObjectReferences from the structure of the object,
 * we can do reference resolution just once and then unmarshal instead
 * of walking the DataObject and resolving references as we go.
 *
 * @param value - The value to check.
 * @returns The unknown value, typed as a MarshalledDataObject.
 */
export const isMarshalledDataObject = (
  value: unknown,
): value is MarshalledDataObject =>
  isObject(value) &&
  typeof value.slots !== 'undefined' &&
  typeof value.body !== 'undefined' &&
  isArray<ObjectReference>(value.slots, isObjectReference) &&
  isReferencedDataObject<SlotReference>(value.body, isSlotReference);

export type DataObject =
  | ReferencedDataObject<ObjectReference>
  | MarshalledDataObject;

export const isDataObject = (value: unknown): value is DataObject =>
  isMarshalledDataObject(value) ||
  isReferencedDataObject<ObjectReference>(value, isObjectReference);
