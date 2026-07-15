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
 *   3. Include a build-phase hint in its interaction text — "all
 *      inputs in, build run starting" vs. "still awaiting boards" —
 *      so the audience sees the assembler's state of completeness
 *      progress through the dashboard's events log.
 */
export type ShipmentAcknowledgement = {
  acknowledged: true;
  /** Provider tag of the assembler that received this shipment. */
  receiverTag: string;
  /**
   * Short human-readable status text the supplier folds into its
   * `interactions` description for the dashboard event. Indicates
   * whether the receive endpoint considers the assembler's inputs
   * complete, or still pending one or more shipments. When the
   * endpoint was not configured with an expected-shipment list,
   * the field is a generic "shipment received" string.
   */
  buildPhase: string;
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
 * If the caller supplies `expectedKinds`, the endpoint tracks which
 * of those kinds have been received and reports a phase-of-build
 * hint in each `receiveShipment` ack. Suppliers can then fold the
 * hint into the dashboard event so the audience sees "parts received,
 * still awaiting boards" → "all inputs in, build run starting" as
 * shipments arrive. If `expectedKinds` is omitted the ack just says
 * the shipment was received.
 *
 * @param options - Construction options.
 * @param options.receiverTag - Provider tag of the assembler that
 *   will appear in `ShipmentAcknowledgement.receiverTag`. Used by
 *   suppliers for their `interactions` field's `to` label.
 * @param options.expectedKinds - Shipment kinds the assembler is
 *   waiting on before the build run can proceed (e.g.
 *   `['parts shipment', 'bare boards shipment']`). Order does not
 *   matter; each kind is checked off the first time a matching
 *   manifest arrives. Optional.
 * @returns The endpoint exo plus a way to inspect received shipments
 *   (the latter not currently used by anyone).
 */
export function makeReceiveShipmentEndpoint(options: {
  receiverTag: string;
  expectedKinds?: readonly string[];
}): {
  endpoint: ReceiveShipmentEndpoint;
  shipmentsReceived: () => readonly ShipmentManifest[];
} {
  const { receiverTag, expectedKinds } = options;
  const received: ShipmentManifest[] = [];
  // Lower-cased copy for case-insensitive matching against incoming
  // kinds; preserves the original strings for the human-readable
  // status text.
  const expectedSet = new Set<string>(
    (expectedKinds ?? []).map((kind) => kind.toLowerCase()),
  );
  const stillPending = new Set<string>(
    (expectedKinds ?? []).map((kind) => kind.toLowerCase()),
  );

  const endpoint = makeDefaultExo(`${receiverTag}ReceiveShipmentEndpoint`, {
    async receiveShipment(
      manifest: ShipmentManifest,
    ): Promise<ShipmentAcknowledgement> {
      received.push(manifest);
      const kindLower = manifest.kind.toLowerCase();
      if (expectedSet.has(kindLower)) {
        stillPending.delete(kindLower);
      }
      const buildPhase = describeBuildPhase({
        expectedKinds: expectedKinds ?? [],
        stillPending,
        receiverTag,
      });
      return harden({
        acknowledged: true as const,
        receiverTag,
        buildPhase,
      });
    },
  }) as unknown as ReceiveShipmentEndpoint;

  return {
    endpoint,
    shipmentsReceived: () => received.slice(),
  };
}

/**
 * Compose the short status text the supplier folds into its
 * dashboard interaction. Spelled out as a separate helper so the
 * branching logic is easy to read.
 *
 * @param options - Status inputs.
 * @param options.expectedKinds - The full set of kinds the assembler
 *   is waiting on (used to label the "still pending" list).
 * @param options.stillPending - The lower-cased kinds not yet
 *   received.
 * @param options.receiverTag - The assembler's provider tag.
 * @returns A human-readable status string.
 */
function describeBuildPhase(options: {
  expectedKinds: readonly string[];
  stillPending: Set<string>;
  receiverTag: string;
}): string {
  const { expectedKinds, stillPending, receiverTag } = options;
  if (expectedKinds.length === 0) {
    return 'shipment received';
  }
  if (stillPending.size === 0) {
    return `all inputs received at ${receiverTag}; build run starting`;
  }
  // List the pending kinds in their originally-supplied casing so
  // the audience sees the human-readable label, not the lower-cased
  // matching form.
  const pending = expectedKinds.filter((kind) =>
    stillPending.has(kind.toLowerCase()),
  );
  return `${receiverTag} still awaiting ${pending.join(' + ')}`;
}
