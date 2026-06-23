import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  OcapURLIssuerService,
  OcapURLRedemptionService,
} from '@metamask/ocap-kernel';
import type { ServicePoint } from '@metamask/service-discovery-types';

import {
  DEVICE_ASSEMBLY_PRICE_USD,
  DEVICE_ASSEMBLY_PROVIDER_TAG,
  DEVICE_ASSEMBLY_SERVICE_DESCRIPTION,
  makeDeviceAssemblyService,
} from './service.ts';
import {
  getRemotableSpec,
  makeContactEndpoint,
  makeReceiveShipmentEndpoint,
  makeRegistrationToken,
  registerServicesWithMatcher,
} from '../vat-lib/index.ts';

const SERVICE_NAME = 'DeviceAssemblyService';

type Services = {
  ocapURLIssuerService: OcapURLIssuerService;
  ocapURLRedemptionService: OcapURLRedemptionService;
};

/**
 * Build the DeviceAssembly service vat root.
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
      // Stand up the receive-shipment endpoint first and issue its
      // URL so the service exo can return it as part of `assemble`.
      // Suppliers (shenzhen-direct, pcb-wizards) redeem the URL when
      // the agent passes it as their `shipToUrl` argument and call
      // `receiveShipment(manifest)` to hand off parts and boards.
      const receiveEndpoint = makeReceiveShipmentEndpoint({
        receiverTag: DEVICE_ASSEMBLY_PROVIDER_TAG,
      });
      receiveShipmentUrl = await E(services.ocapURLIssuerService).issue(
        receiveEndpoint.endpoint,
      );

      const serviceExo = makeDeviceAssemblyService({
        getReceiveShipmentUrl: () => receiveShipmentUrl,
      });
      const remotableSpec = await getRemotableSpec(
        serviceExo,
        DEVICE_ASSEMBLY_SERVICE_DESCRIPTION,
      );
      const registrationToken = makeRegistrationToken();
      const contact = makeContactEndpoint({
        name: SERVICE_NAME,
        service: serviceExo as unknown as ServicePoint,
        description: DEVICE_ASSEMBLY_SERVICE_DESCRIPTION,
        remotableSpec,
        getContactUrl: () => contactUrl,
        expectedToken: registrationToken,
        providerTag: DEVICE_ASSEMBLY_PROVIDER_TAG,
        priceUsd: DEVICE_ASSEMBLY_PRICE_USD,
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
