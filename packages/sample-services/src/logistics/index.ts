import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  OcapURLIssuerService,
  OcapURLRedemptionService,
} from '@metamask/ocap-kernel';
import type { ServicePoint } from '@metamask/service-discovery-types';

import {
  LOGISTICS_PRICE_USD,
  LOGISTICS_PROVIDER_TAG,
  LOGISTICS_SERVICE_DESCRIPTION,
  makeLogisticsService,
} from './service.ts';
import {
  getRemotableSpec,
  makeContactEndpoint,
  makeReceiveShipmentEndpoint,
  makeRegistrationToken,
  registerServicesWithMatcher,
} from '../vat-lib/index.ts';

const SERVICE_NAME = 'LogisticsService';

type Services = {
  ocapURLIssuerService: OcapURLIssuerService;
  ocapURLRedemptionService: OcapURLRedemptionService;
};

/**
 * Build the Logistics service vat root.
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
      // Stand up the receive-shipment endpoint so the assembler can
      // ship the finished units to pacific-fulfillment for trial
      // distribution. The agent threads this URL from arrange's reply
      // into assembly-coop.shipFinishedUnits.
      const receiveEndpoint = makeReceiveShipmentEndpoint({
        receiverTag: LOGISTICS_PROVIDER_TAG,
      });
      receiveShipmentUrl = await E(services.ocapURLIssuerService).issue(
        receiveEndpoint.endpoint,
      );

      const serviceExo = makeLogisticsService({
        getReceiveShipmentUrl: () => receiveShipmentUrl,
      });
      const remotableSpec = await getRemotableSpec(
        serviceExo,
        LOGISTICS_SERVICE_DESCRIPTION,
      );
      const registrationToken = makeRegistrationToken();
      const contact = makeContactEndpoint({
        name: SERVICE_NAME,
        service: serviceExo as unknown as ServicePoint,
        description: LOGISTICS_SERVICE_DESCRIPTION,
        remotableSpec,
        getContactUrl: () => contactUrl,
        expectedToken: registrationToken,
        providerTag: LOGISTICS_PROVIDER_TAG,
        priceUsd: LOGISTICS_PRICE_USD,
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
