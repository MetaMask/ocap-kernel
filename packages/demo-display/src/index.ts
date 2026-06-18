export { loadConfig, type DemoDisplayConfig } from './config.ts';
export { makeEventLog, type EventLog } from './event-log.ts';
export { startServer, type ServerHandle } from './server.ts';
export type {
  DisplayEvent,
  ServiceDescriptionPayload,
  ServiceEvictedEvent,
  ServiceRegisteredEvent,
} from './types.ts';
