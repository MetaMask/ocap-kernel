/**
 * Service matcher interface.
 *
 * A {@link ServiceMatcher} aggregates service descriptions and helps
 * consumers find services that satisfy their needs. The matcher is a
 * remotable; its JSON-serializable inputs and outputs have runtime
 * validators.
 */

import { array, exactOptional, object, string } from '@metamask/superstruct';
import type { Infer, Struct } from '@metamask/superstruct';

import type { ContactPoint, RegistrationToken } from './contact.ts';
import { ServiceDescriptionStruct } from './service-description.ts';
import type { ServiceDescription } from './service-description.ts';

/**
 * A consumer's expression of what it is looking for. Intentionally loose —
 * the matcher determines how this is interpreted.
 */
export type ServiceQuery = {
  description: string;
};

export const ServiceQueryStruct: Struct<ServiceQuery> = object({
  description: string(),
});

/**
 * A candidate service returned by a matcher query.
 */
export type ServiceMatch = {
  description: ServiceDescription;
  /** Matcher's natural-language rationale for this match. */
  rationale?: string;
};

export const ServiceMatchStruct: Struct<ServiceMatch> = object({
  description: ServiceDescriptionStruct,
  rationale: exactOptional(string()),
});

export const ServiceMatchListStruct: Struct<ServiceMatch[]> =
  array(ServiceMatchStruct);

export type ServiceMatchList = Infer<typeof ServiceMatchListStruct>;

/**
 * The matcher's public interface.
 *
 * Registration callers present a `registrationToken` which the matcher uses
 * to call back into `ContactPoint.confirmServiceRegistration` on the
 * service's contact endpoint, verifying the registration is legitimate
 * before accepting it.
 */
export type ServiceMatcher = {
  /** Register a service by supplying its description directly. */
  registerService(
    description: ServiceDescription,
    registrationToken: RegistrationToken,
  ): Promise<void>;

  /**
   * Register a service by contact URL; the matcher resolves the URL and
   * fetches the description itself.
   */
  registerServiceByUrl(
    contactUrl: string,
    registrationToken: RegistrationToken,
  ): Promise<void>;

  /**
   * Register a service by direct ocap reference; the matcher calls
   * `getServiceDescription()` on the contact endpoint.
   */
  registerServiceByRef(
    contact: ContactPoint,
    registrationToken: RegistrationToken,
  ): Promise<void>;

  /**
   * Query the matcher for services satisfying a described need. Returns a
   * (possibly empty) ranked list of candidate matches.
   */
  findServices(query: ServiceQuery): Promise<ServiceMatch[]>;
};
