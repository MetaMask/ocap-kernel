// Primitives
type NN = `${number}`;
type Dir = '+' | '-';

// Endpoint IDs
export type VatId = `v${NN}`;
export type RemoteId = `r${NN}`;
export type EndpointId = VatId | RemoteId;

// Kernel Refs
export type KOId = `ko${NN}`;
export type KPId = `kp${NN}`;
export type KRef = KOId | KPId;

// Remote Refs
export type ROId = `ro${Dir}${NN}`;
export type RPId = `rp${Dir}${NN}`;
export type RRef = ROId | RPId;

// Vat Refs
export type VOId = `o${Dir}${NN}`;
export type VPId = `p${Dir}${NN}`;
export type VRef = VOId | VPId;

// Export and Import Refs
export type XRef = `o+${NN}`;
export type MRef = `o-${NN}`;

// Object and Promise Refs
export type ORef = KOId | ROId | VOId;
export type PRef = KPId | RPId | VPId;

// Aggregate Types
export type ERef = VRef | RRef;
export type Ref = KRef | ERef;
