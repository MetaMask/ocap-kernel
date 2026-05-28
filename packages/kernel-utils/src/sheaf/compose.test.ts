import { describe, it, expect, vi } from 'vitest';

import { fallthrough, proxyLift, withFilter, withRanking } from './compose.ts';
import type { EvaluatedSection, Lift, LiftContext } from './types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Meta = { id: string; cost: number };
type G = EvaluatedSection<Partial<Meta>>;

const makeGerm = (id: string, cost = 0): G => ({
  exo: {} as G['exo'],
  metadata: { id, cost },
});

const ctx: LiftContext<Meta> = {
  method: 'transfer',
  args: ['alice', 100n],
  constraints: {},
};

/**
 * Drive a lift to exhaustion, simulating a failure after each yielded
 * candidate. Returns all yielded germs in order and the error arrays
 * the generator received.
 *
 * @param lift - The lift to drive.
 * @param germs - The germs to pass to the lift.
 * @param context - The lift context.
 * @returns Yielded germs and error snapshots received by the generator.
 */
const driveToExhaustion = async (
  lift: Lift<Meta>,
  germs: G[],
  context: LiftContext<Meta> = ctx,
): Promise<{ yielded: G[]; receivedErrors: unknown[][] }> => {
  const yielded: G[] = [];
  const receivedErrors: unknown[][] = [];
  const errors: unknown[] = [];
  const gen = lift(germs, context);
  let next = await gen.next([...errors]);
  while (!next.done) {
    yielded.push(next.value);
    errors.push(new Error(`attempt ${errors.length + 1} failed`));
    receivedErrors.push([...errors]);
    next = await gen.next([...errors]);
  }
  return { yielded, receivedErrors };
};

/**
 * Drive a lift, succeeding on the nth candidate (1-based).
 * Returns the winning germ.
 *
 * @param lift - The lift to drive.
 * @param germs - The germs to pass to the lift.
 * @param successOn - Which attempt number (1-based) should succeed.
 * @param context - The lift context.
 * @returns The germ that won on attempt `successOn`.
 */
const driveWithSuccessOn = async (
  lift: Lift<Meta>,
  germs: G[],
  successOn: number,
  context: LiftContext<Meta> = ctx,
): Promise<G> => {
  const errors: unknown[] = [];
  const gen = lift(germs, context);
  let attempt = 0;
  let next = await gen.next([...errors]);
  while (!next.done) {
    attempt += 1;
    if (attempt === successOn) {
      await gen.return(undefined);
      return next.value;
    }
    errors.push(new Error(`attempt ${attempt} failed`));
    next = await gen.next([...errors]);
  }
  throw new Error('generator exhausted before success');
};

// ---------------------------------------------------------------------------
// proxyLift
// ---------------------------------------------------------------------------

describe('proxyLift', () => {
  it('forwards all yielded values from inner generator', async () => {
    const [germA, germB, germC] = [makeGerm('a'), makeGerm('b'), makeGerm('c')];
    const inner = async function* (): AsyncGenerator<G, void, unknown[]> {
      yield germA;
      yield germB;
      yield germC;
    };

    const { yielded } = await driveToExhaustion(() => proxyLift(inner()), []);
    expect(yielded).toStrictEqual([germA, germB, germC]);
  });

  it('forwards error arrays down to inner generator', async () => {
    const [germA, germB] = [makeGerm('a'), makeGerm('b')];
    const receivedByInner: unknown[][] = [];

    const inner = async function* (): AsyncGenerator<G, void, unknown[]> {
      const errors1: unknown[] = yield germA;
      receivedByInner.push(errors1);
      const errors2: unknown[] = yield germB;
      receivedByInner.push(errors2);
    };

    await driveToExhaustion(() => proxyLift(inner()), []);

    expect(receivedByInner).toHaveLength(2);
    expect(receivedByInner[0]).toHaveLength(1); // one error after first attempt
    expect(receivedByInner[1]).toHaveLength(2); // two errors after second attempt
  });

  it('stops when inner generator is done', async () => {
    const inner = async function* (): AsyncGenerator<G, void, unknown[]> {
      // immediately done
    };

    const { yielded } = await driveToExhaustion(() => proxyLift(inner()), []);
    expect(yielded).toHaveLength(0);
  });

  it('allows inner generator to stop early based on errors', async () => {
    const [germA, germB, germC] = [makeGerm('a'), makeGerm('b'), makeGerm('c')];

    const inner = async function* (): AsyncGenerator<G, void, unknown[]> {
      let errors: unknown[] = yield germA;
      // stop after first failure
      if (errors.length > 0) {
        return;
      }
      errors = yield germB;
      if (errors.length > 0) {
        return;
      }
      yield germC;
    };

    const { yielded } = await driveToExhaustion(() => proxyLift(inner()), []);
    // Only 'a' yielded — inner stops after receiving the first error
    expect(yielded).toStrictEqual([germA]);
  });
});

// ---------------------------------------------------------------------------
// withFilter
// ---------------------------------------------------------------------------

describe('withFilter', () => {
  it('passes only matching germs to the inner lift', async () => {
    const germs = [makeGerm('a', 1), makeGerm('b', 2), makeGerm('c', 3)];
    const received = vi.fn();

    const inner: Lift<Meta> = async function* (allGerms) {
      received(allGerms.map((item) => item.metadata.id));
      yield* allGerms;
    };

    const lift = withFilter<Meta>((germ) => (germ.metadata.cost ?? 0) >= 2)(
      inner,
    );
    await driveToExhaustion(lift, germs);

    expect(received).toHaveBeenCalledWith(['b', 'c']);
  });

  it('passes context to the predicate', async () => {
    const germs = [makeGerm('alice'), makeGerm('bob')];
    const contextUsed: LiftContext<Meta>[] = [];

    const lift = withFilter<Meta>((_germ, liftContext) => {
      contextUsed.push(liftContext);
      return true;
    })(async function* (allGerms) {
      yield* allGerms;
    });

    await driveToExhaustion(lift, germs);

    expect(contextUsed.length).toBeGreaterThan(0);
    expect(contextUsed[0]).toStrictEqual(ctx);
  });

  it('yields nothing when no germs match', async () => {
    const germs = [makeGerm('a', 1)];
    const lift = withFilter<Meta>(() => false)(async function* (allGerms) {
      yield* allGerms;
    });

    const { yielded } = await driveToExhaustion(lift, germs);
    expect(yielded).toHaveLength(0);
  });

  it('returns the inner lift generator directly (no extra wrapping)', () => {
    // withFilter is a pure input transform — it returns the inner lift's
    // generator, not a new proxy generator.
    const innerGen = {} as AsyncGenerator<G, void, unknown[]>;
    const inner: Lift<Meta> = vi.fn(() => innerGen);
    const lift = withFilter<Meta>(() => true)(inner);

    const result = lift([], ctx);
    expect(result).toBe(innerGen);
  });
});

// ---------------------------------------------------------------------------
// withRanking
// ---------------------------------------------------------------------------

describe('withRanking', () => {
  it('sorts germs before passing to inner lift', async () => {
    const germs = [makeGerm('a', 3), makeGerm('b', 1), makeGerm('c', 2)];
    const received = vi.fn();

    const inner: Lift<Meta> = async function* (allGerms) {
      received(allGerms.map((item) => item.metadata.id));
      yield* allGerms;
    };

    const lift = withRanking<Meta>(
      (a, b) => (a.metadata.cost ?? 0) - (b.metadata.cost ?? 0),
    )(inner);
    await driveToExhaustion(lift, germs);

    expect(received).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('does not mutate the original germs array', async () => {
    const germs = [makeGerm('a', 3), makeGerm('b', 1)];
    const original = [...germs];

    const lift = withRanking<Meta>(
      (a, b) => (a.metadata.cost ?? 0) - (b.metadata.cost ?? 0),
    )(async function* (allGerms) {
      yield* allGerms;
    });

    await driveToExhaustion(lift, germs);
    expect(germs).toStrictEqual(original);
  });

  it('returns the inner lift generator directly (no extra wrapping)', () => {
    const innerGen = {} as AsyncGenerator<G, void, unknown[]>;
    const inner: Lift<Meta> = vi.fn(() => innerGen);
    const lift = withRanking<Meta>(() => 0)(inner);

    const result = lift([], ctx);
    expect(result).toBe(innerGen);
  });
});

// ---------------------------------------------------------------------------
// fallthrough
// ---------------------------------------------------------------------------

describe('fallthrough', () => {
  it('yields all candidates from liftA then liftB', async () => {
    const [a1, a2, b1, b2] = [
      makeGerm('a1'),
      makeGerm('a2'),
      makeGerm('b1'),
      makeGerm('b2'),
    ];

    const liftA: Lift<Meta> = async function* () {
      yield a1;
      yield a2;
    };
    const liftB: Lift<Meta> = async function* () {
      yield b1;
      yield b2;
    };

    const { yielded } = await driveToExhaustion(fallthrough(liftA, liftB), []);
    expect(yielded).toStrictEqual([a1, a2, b1, b2]);
  });

  it('stops at liftA winner and does not invoke liftB', async () => {
    const [a1, a2] = [makeGerm('a1'), makeGerm('a2')];
    const liftBInvoked = vi.fn();

    const liftA: Lift<Meta> = async function* () {
      yield a1;
      yield a2;
    };
    const liftB: Lift<Meta> = async function* () {
      liftBInvoked();
      yield makeGerm('b1');
    };

    // Succeed on first candidate
    const winner = await driveWithSuccessOn(fallthrough(liftA, liftB), [], 1);
    expect(winner).toBe(a1);
    expect(liftBInvoked).not.toHaveBeenCalled();
  });

  it('falls through to liftB when liftA is exhausted', async () => {
    const [a1, b1] = [makeGerm('a1'), makeGerm('b1')];

    const liftA: Lift<Meta> = async function* () {
      yield a1;
    };
    const liftB: Lift<Meta> = async function* () {
      yield b1;
    };

    // liftA has one candidate (a1), fail it, then liftB kicks in
    const winner = await driveWithSuccessOn(fallthrough(liftA, liftB), [], 2);
    expect(winner).toBe(b1);
  });

  it('forwards error arrays through yield* to each inner lift', async () => {
    const [a1, b1] = [makeGerm('a1'), makeGerm('b1')];
    const errorsReceivedByA: unknown[][] = [];
    const errorsReceivedByB: unknown[][] = [];

    const liftA: Lift<Meta> = async function* () {
      const errors: unknown[] = yield a1;
      errorsReceivedByA.push(errors);
    };
    const liftB: Lift<Meta> = async function* () {
      const errors: unknown[] = yield b1;
      errorsReceivedByB.push(errors);
    };

    await driveToExhaustion(fallthrough(liftA, liftB), []);

    // liftA's first yield received one error (a1 failed)
    expect(errorsReceivedByA[0]).toHaveLength(1);
    // liftB's first yield received two errors (a1 + b1 both failed)
    expect(errorsReceivedByB[0]).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Composition: withFilter + withRanking + fallthrough
// ---------------------------------------------------------------------------

describe('composition', () => {
  it('withFilter composed with withRanking applies both transforms', async () => {
    const germs = [
      makeGerm('a', 3),
      makeGerm('b', 1),
      makeGerm('c', 2),
      makeGerm('d', 4), // filtered out (cost > 3)
    ];
    const received = vi.fn();

    const base: Lift<Meta> = async function* (allGerms) {
      received(allGerms.map((item) => item.metadata.id));
      yield* allGerms;
    };

    const lift = withFilter<Meta>((germ) => (germ.metadata.cost ?? 0) <= 3)(
      withRanking<Meta>(
        (a, b) => (a.metadata.cost ?? 0) - (b.metadata.cost ?? 0),
      )(base),
    );

    await driveToExhaustion(lift, germs);
    // filtered to a/b/c, sorted by cost ascending
    expect(received).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('proxyLift wrapping fallthrough threads errors through both layers', async () => {
    const [a1, b1] = [makeGerm('a1'), makeGerm('b1')];
    const inner: Lift<Meta> = fallthrough(
      async function* () {
        yield a1;
      },
      async function* () {
        yield b1;
      },
    );

    // proxyLift wrapping the whole fallthrough
    const lift: Lift<Meta> = () => proxyLift(inner([], ctx));

    const { yielded } = await driveToExhaustion(lift, []);
    expect(yielded).toStrictEqual([a1, b1]);
  });
});
