import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  OcapURLIssuerService,
  OcapURLRedemptionService,
} from '@metamask/ocap-kernel';
import type { ServicePoint } from '@metamask/service-discovery-types';

import {
  MECHANICAL_DESIGN_PRICE_USD,
  MECHANICAL_DESIGN_PROVIDER_TAG,
  MECHANICAL_DESIGN_SERVICE_DESCRIPTION,
  makeMechanicalDesignService,
} from './service.ts';
import {
  getRemotableSpec,
  makeContactEndpoint,
  makeRegistrationToken,
  registerServicesWithMatcher,
} from '../vat-lib/index.ts';

const SERVICE_NAME = 'MechanicalDesignService';

type Services = {
  ocapURLIssuerService: OcapURLIssuerService;
  ocapURLRedemptionService: OcapURLRedemptionService;
};

/**
 * Build the MechanicalDesign service vat root.
 *
 * @param _vatPowers - Vat powers (unused).
 * @param parameters - Vat parameters; `matcherUrl` read at bootstrap.
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
      const serviceExo = makeMechanicalDesignService();
      const remotableSpec = await getRemotableSpec(
        serviceExo,
        MECHANICAL_DESIGN_SERVICE_DESCRIPTION,
      );
      const registrationToken = makeRegistrationToken();
      const contact = makeContactEndpoint({
        name: SERVICE_NAME,
        service: serviceExo as unknown as ServicePoint,
        description: MECHANICAL_DESIGN_SERVICE_DESCRIPTION,
        remotableSpec,
        getContactUrl: () => contactUrl,
        expectedToken: registrationToken,
        providerTag: MECHANICAL_DESIGN_PROVIDER_TAG,
        priceUsd: MECHANICAL_DESIGN_PRICE_USD,
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
