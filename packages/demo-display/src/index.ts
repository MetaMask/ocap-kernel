export { loadConfig, type DemoDisplayConfig } from './config.ts';
export { makeDaemonCaller, type DaemonCaller } from './daemon-caller.ts';
export { makeEventLog, type EventLog } from './event-log.ts';
export { startMatcherPoller, type MatcherPoller } from './matcher-poller.ts';
export { startServer, type ServerHandle } from './server.ts';
export type {
  DisplayEvent,
  ServiceDescriptionPayload,
  ServiceEvictedEvent,
  ServiceRegisteredEvent,
} from './types.ts';
