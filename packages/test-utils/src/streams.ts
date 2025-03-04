// We want to export the TestDuplexStream without exposing it via the streams package.
// We make this export here instead of index.ts to avoid creating circular dependencies
// in the tests of the streams package.
export {
  TestDuplexStream,
  TrackedTestDuplexStream,
} from '../../streams/test/stream-mocks.ts';
