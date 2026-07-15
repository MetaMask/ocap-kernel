import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  OcapURLIssuerService,
  OcapURLRedemptionService,
} from '@metamask/ocap-kernel';
import type { ServicePoint } from '@metamask/service-discovery-types';

import {
  FIRMWARE_PRICE_USD,
  FIRMWARE_PROVIDER_TAG,
  FIRMWARE_SERVICE_DESCRIPTION,
  makeFirmwareService,
} from './service.ts';
import {
  getRemotableSpec,
  makeContactEndpoint,
  makeRegistrationToken,
  registerServicesWithMatcher,
} from '../vat-lib/index.ts';

const SERVICE_NAME = 'FirmwareService';

type Services = {
  ocapURLIssuerService: OcapURLIssuerService;
  ocapURLRedemptionService: OcapURLRedemptionService;
};

/**
 * Build the Firmware service vat root.
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

  return makeDefaultExo(`${SERVICE_NAME}VatRoot`, {
    async bootstrap(_vats: Record<string, unknown>, services: Services) {
      const serviceExo = makeFirmwareService();
      const remotableSpec = await getRemotableSpec(
        serviceExo,
        FIRMWARE_SERVICE_DESCRIPTION,
      );
      const registrationToken = makeRegistrationToken();
      const contact = makeContactEndpoint({
        name: SERVICE_NAME,
        service: serviceExo as unknown as ServicePoint,
        description: FIRMWARE_SERVICE_DESCRIPTION,
        remotableSpec,
        getContactUrl: () => contactUrl,
        expectedToken: registrationToken,
        providerTag: FIRMWARE_PROVIDER_TAG,
        priceUsd: FIRMWARE_PRICE_USD,
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
