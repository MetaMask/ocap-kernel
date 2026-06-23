import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * A manifest describing a supplier-to-assembler shipment. Suppliers
 * fill this in when they call the assembler's receive-shipment exo
 * via ocap URL redemption. Loose-typed so different supplier flavours
 * (parts, bare boards, etc.) can plug into the same receiver.
 */
export type ShipmentManifest = {
  /** Provider tag of the supplier sending the shipment. */
  from: string;
  /** Short human-readable description ("parts shipment", "bare boards"). */
  kind: string;
  /** Quantity / batch label, e.g. "15 units worth of components". */
  items: string;
  /** Free-text notes (carrier, lead time, line items, etc.). */
  notes?: string;
};

/**
 * What the receive exo reports back when a supplier calls it. The
 * supplier uses this to:
 *   1. Confirm the shipment was acknowledged.
 *   2. Pick the right `to:` label for the `interactions` field the
 *      supplier attaches to its returned receipt artifact (so the
 *      dashboard's service.interaction event shows the assembler's
 *      provider tag instead of an opaque ref).
 */
export type ShipmentAcknowledgement = {
  acknowledged: true;
  /** Provider tag of the assembler that received this shipment. */
  receiverTag: string;
};

/**
 * The receive-shipment endpoint exo's external interface — the shape
 * suppliers actually call across the ocap-URL handshake.
 */
export type ReceiveShipmentEndpoint = {
  receiveShipment(manifest: ShipmentManifest): Promise<ShipmentAcknowledgement>;
};

/**
 * Build a receive-shipment exo for an assembler-like service. The exo
 * is published via OcapURLIssuerService; suppliers redeem the URL,
 * call `receiveShipment(manifest)`, and the exo logs the manifest in
 * a closure-held list that the assembler can consult later.
 *
 * The closure-held log is intentionally never exposed — it exists
 * mainly so an assembler could implement "refuse to build until parts
 * and boards have arrived" semantics. For V1 the build commit just
 * proceeds; the log is hygiene against the day we want to enforce.
 *
 * @param options - Construction options.
 * @param options.receiverTag - Provider tag of the assembler that
 *   will appear in `ShipmentAcknowledgement.receiverTag`. Used by
 *   suppliers for their `interactions` field's `to` label.
 * @returns The endpoint exo plus a way to inspect received shipments
 *   (the latter not currently used by anyone).
 */
export function makeReceiveShipmentEndpoint(options: { receiverTag: string }): {
  endpoint: ReceiveShipmentEndpoint;
  shipmentsReceived: () => readonly ShipmentManifest[];
} {
  const { receiverTag } = options;
  const received: ShipmentManifest[] = [];

  const endpoint = makeDefaultExo(`${receiverTag}ReceiveShipmentEndpoint`, {
    async receiveShipment(
      manifest: ShipmentManifest,
    ): Promise<ShipmentAcknowledgement> {
      received.push(manifest);
      return harden({
        acknowledged: true as const,
        receiverTag,
      });
    },
  }) as unknown as ReceiveShipmentEndpoint;

  return {
    endpoint,
    shipmentsReceived: () => received.slice(),
  };
}
