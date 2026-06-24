import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  OcapURLIssuerService,
  OcapURLRedemptionService,
} from '@metamask/ocap-kernel';
import type { ServicePoint } from '@metamask/service-discovery-types';

import {
  BENCH_BUILD_PRICE_USD,
  BENCH_BUILD_PROVIDER_TAG,
  BENCH_BUILD_SERVICE_DESCRIPTION,
  makeBenchBuildService,
} from './service.ts';
import {
  getRemotableSpec,
  makeContactEndpoint,
  makeReceiveShipmentEndpoint,
  makeRegistrationToken,
  registerServicesWithMatcher,
} from '../vat-lib/index.ts';

const SERVICE_NAME = 'BenchBuildService';

type Services = {
  ocapURLIssuerService: OcapURLIssuerService;
  ocapURLRedemptionService: OcapURLRedemptionService;
};

/**
 * Build the BenchBuild service vat root.
 *
 * @param _vatPowers - Vat powers (unused).
 * @param parameters - Vat parameters; `matcherUrl` is read at bootstrap.
 * @param _baggage - Vat baggage (unused).
 * @returns The vat root exo.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  _vatPowers: unknown,
  parameters: Record<string, unknown>,
  _baggage: Baggage,
) {
  const matcherUrl =
    typeof parameters?.matcherUrl === 'string' ? parameters.matcherUrl : '';
  let contactUrl = '';
  let receiveShipmentUrl = '';

  return makeDefaultExo(`${SERVICE_NAME}VatRoot`, {
    async bootstrap(_vats: Record<string, unknown>, services: Services) {
      // Stand up the receive-shipment endpoint so pcb-wizards has
      // somewhere to ship the sample bare boards once the agent
      // engages proto-pros and threads the URL through.
      const receiveEndpoint = makeReceiveShipmentEndpoint({
        receiverTag: BENCH_BUILD_PROVIDER_TAG,
        // pcb-wizards.shipSampleBoards's manifest uses "sample boards
        // shipment". When that lands the endpoint reports "all inputs
        // received" — proto-pros only needs the boards before the
        // bench build can proceed; parts come from distributor shelf
        // stock and don't go through the receive endpoint.
        expectedKinds: ['sample boards shipment'],
      });
      receiveShipmentUrl = await E(services.ocapURLIssuerService).issue(
        receiveEndpoint.endpoint,
      );

      const serviceExo = makeBenchBuildService({
        getReceiveShipmentUrl: () => receiveShipmentUrl,
      });
      const remotableSpec = await getRemotableSpec(
        serviceExo,
        BENCH_BUILD_SERVICE_DESCRIPTION,
      );
      const registrationToken = makeRegistrationToken();
      const contact = makeContactEndpoint({
        name: SERVICE_NAME,
        service: serviceExo as unknown as ServicePoint,
        description: BENCH_BUILD_SERVICE_DESCRIPTION,
        remotableSpec,
        getContactUrl: () => contactUrl,
        expectedToken: registrationToken,
        providerTag: BENCH_BUILD_PROVIDER_TAG,
        priceUsd: BENCH_BUILD_PRICE_USD,
      });
      contactUrl = await E(services.ocapURLIssuerService).issue(contact);

      await registerServicesWithMatcher({
        matcherUrl,
        ocapURLRedemptionService: services.ocapURLRedemptionService,
        entries: [{ name: SERVICE_NAME, contact, registrationToken }],
      });

      return harden({ name: SERVICE_NAME, contactUrl });
    },

    getContactUrl() {
      return contactUrl;
    },
  });
}
