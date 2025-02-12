import { promises } from "fs";

/**
 * Double a thing.
 * 
 * @param {*} x - The thing to double.
 * @returns Twice the input.
 */
export default function double(x) {
  return x + x;
}
