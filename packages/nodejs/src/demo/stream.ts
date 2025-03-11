import { E } from "@endo/eventual-send";
import { makePipe, type Reader, type Writer } from "@endo/stream";

/**
 * Type representing a remote vat that exposes stream methods
 */
type RemoteStreamVat<Read = unknown> = {
  streamReadNext: (id: number) => Promise<Read>,
  streamReadThrow: (id: number, error: Error) => Promise<undefined>,
  streamReadReturn: (id: number) => Promise<undefined>,
};

/**
 * Creates a local stream reader that forwards operations to a remote vat's stream
 * @param vat - The remote vat that manages the actual stream
 * @returns A hardened stream reader that implements the async iterator protocol
 */
export const makeVatStreamReader = (vat: RemoteStreamVat) =>
  (streamId: number) => {
    const streamReader = {
      async next() {
        return E(vat).streamReadNext(streamId);
      },
      async throw(error: Error) {
        return E(vat).streamReadThrow(streamId, error);
      },
      async return() {
        return E(vat).streamReadReturn(streamId);
      },
      [Symbol.asyncIterator]() { 
        return this;
      },
    };
    return streamReader;
  }

type Stream = { 
  id: number;
  reader: Reader<unknown>;
  writer: Writer<unknown>;
};

/**
 * Creates a stream manager for the remote vat that maintains stream references
 * and exposes methods to create and access streams
 * @returns A hardened object with methods to create and access streams
 */
export const makeStreamMaker = () => {
  let counter = 0;
  const streams = new Map<number, Stream>();

  /**
   * Creates a new stream and returns its ID
   * @returns The ID of the newly created stream
   */
  const makeStream = (): Stream => {
    const [reader, writer] = makePipe();
    const id = counter;
    counter += 1;
    const stream = harden({ id, reader, writer });
    streams.set(id, stream);
    return stream;
  };

  /**
   * Retrieves a stream by its ID and returns a Far reference to its reader
   * @param id - The ID of the stream to retrieve
   * @returns A Far reference to the stream reader
   * @throws If no stream exists with the given ID
   */
  const getStream = (id: number) => {
    const stream = streams.get(id);
    if (!stream) {
      throw new Error(`No stream with id ${id}`);
    }
    return stream;
  }

  const streamReadNext = async (id: number) => {
    const stream = getStream(id);
    return await stream.reader.next(undefined);
  }
  const streamReadThrow = async (id: number, error: Error) => {
    const stream = getStream(id);
    return await stream.reader.throw(error);
  }
  const streamReadReturn = async (id: number) => {
    const stream = getStream(id);
    return await stream.reader.return(undefined);
  }

  /**
   * Removes a stream from the manager
   * @param id - The ID of the stream to remove
   */
  const removeStream = (id: number): void => {
    streams.delete(id);
  };

  return harden({
    makeStream,
    readStreamFacet: {
      streamReadNext,
      streamReadThrow,
      streamReadReturn,
    },
    removeStream,
  });
};
