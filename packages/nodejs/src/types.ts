import type { ERef } from '@endo/eventual-send';
import type { FarRef } from '@endo/far';
import type { Passable } from '@endo/pass-style';
import type { Reader, Writer, Stream } from '@endo/stream';

export type SomehowAsyncIterable<Item> =
  | AsyncIterable<Item>
  | Iterable<Item>
  | { next: () => IteratorResult<Item> };

export type Config = {
  statePath: string;
  ephemeralStatePath: string;
  cachePath: string;
  sockPath: string;
};

export type Sha512 = {
  update: (chunk: Uint8Array) => void;
  updateText: (chunk: string) => void;
  digestHex: () => string;
};

export type Connection = {
  reader: Reader<Uint8Array>;
  writer: Writer<Uint8Array>;
  closed: Promise<void>;
};

export type HttpRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  content: AsyncIterable<string | Uint8Array> | string | Uint8Array | undefined;
};

export type HttpRespond = (request: HttpRequest) => Promise<HttpResponse>;
export type HttpConnect = (
  connection: Connection,
  request: HttpRequest,
) => void;

export type MignonicPowers = {
  connection: {
    reader: Reader<Uint8Array>;
    writer: Writer<Uint8Array>;
  };
};

type IdRecord = {
  number: string;
  node: string;
};

type EndoFormula = {
  type: 'endo';
  networks: string;
  peers: string;
  host: string;
  leastAuthority: string;
};

type LoopbackNetworkFormula = {
  type: 'loopback-network';
};

type WorkerFormula = {
  type: 'worker';
};

export type WorkerDeferredTaskParams = {
  workerId: string;
};

/**
 * Deferred tasks parameters for `host` and `guest` formulas.
 */
export type AgentDeferredTaskParams = {
  agentId: string;
  handleId: string;
};

type HostFormula = {
  type: 'host';
  handle: string;
  worker: string;
  inspector: string;
  petStore: string;
  endo: string;
  networks: string;
};

type GuestFormula = {
  type: 'guest';
  handle: string;
  hostHandle: string;
  hostAgent: string;
  petStore: string;
  worker: string;
};

type LeastAuthorityFormula = {
  type: 'least-authority';
};

type MarshalFormula = {
  type: 'marshal';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  slots: string[];
};

type EvalFormula = {
  type: 'eval';
  worker: string;
  source: string;
  names: string[]; // lexical names
  values: string[]; // formula identifiers
  // TODO formula slots
};

export type MarshalDeferredTaskParams = {
  marshalFormulaNumber: string;
  marshalId: string;
};

export type EvalDeferredTaskParams = {
  endowmentIds: string[];
  evalId: string;
  workerId: string;
};

type ReadableBlobFormula = {
  type: 'readable-blob';
  content: string;
};

export type ReadableBlobDeferredTaskParams = {
  readableBlobId: string;
};

type LookupFormula = {
  type: 'lookup';

  /**
   * The formula identifier of the naming hub to call lookup on.
   * A "naming hub" is an object with a variadic `lookup()` method.
   */
  hub: string;

  /**
   * The pet name path.
   */
  path: string[];
};

type MakeUnconfinedFormula = {
  type: 'make-unconfined';
  worker: string;
  powers: string;
  specifier: string;
  // TODO formula slots
};

type MakeBundleFormula = {
  type: 'make-bundle';
  worker: string;
  powers: string;
  bundle: string;
  // TODO formula slots
};

export type MakeCapletDeferredTaskParams = {
  capletId: string;
  powersId: string;
  workerId: string;
};

type PeerFormula = {
  type: 'peer';
  networks: string;
  node: string;
  addresses: string[];
};

type HandleFormula = {
  type: 'handle';
  agent: string;
};

type KnownPeersStoreFormula = {
  type: 'known-peers-store';
};

type PetStoreFormula = {
  type: 'pet-store';
};

type PetInspectorFormula = {
  type: 'pet-inspector';
  petStore: string;
};

type DirectoryFormula = {
  type: 'directory';
  petStore: string;
};

type InvitationFormula = {
  type: 'invitation';
  hostAgent: string; // identifier
  hostHandle: string; // identifier
  guestName: string;
};

export type InvitationDeferredTaskParams = {
  invitationId: string;
};

export type Formula =
  | EndoFormula
  | LoopbackNetworkFormula
  | WorkerFormula
  | HostFormula
  | GuestFormula
  | LeastAuthorityFormula
  | MarshalFormula
  | EvalFormula
  | ReadableBlobFormula
  | LookupFormula
  | MakeUnconfinedFormula
  | MakeBundleFormula
  | HandleFormula
  | PetInspectorFormula
  | KnownPeersStoreFormula
  | PetStoreFormula
  | DirectoryFormula
  | PeerFormula
  | InvitationFormula;

export type Builtins = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  NONE: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  MAIN: string;
};

export type Specials = {
  [specialName: string]: (builtins: Builtins) => Formula;
};

export type Responder = {
  respondId(id: string | Promise<string>): void;
};

export type Request = {
  type: 'request';
  description: string;
  responder: ERef<Responder>;
  settled: Promise<'fulfilled' | 'rejected'>;
};

export type Package = {
  type: 'package';
  strings: string[]; // text that appears before, between, and after named formulas.
  names: string[]; // edge names
  ids: string[]; // formula identifiers
};

export type Message = Request | Package;

export type EnvelopedMessage = Message & {
  to: string;
  from: string;
};

export type Dismisser = {
  dismiss(): void;
};

export type StampedMessage = EnvelopedMessage & {
  number: number;
  date: string;
  dismissed: Promise<void>;
  dismisser: ERef<Dismisser>;
};

export type Invitation = {
  accept(guestHandleId: string): Promise<void>;
};

export type Topic<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
> = {
  publisher: Stream<TWrite, TRead, TWriteReturn, TReadReturn>;
  subscribe(): Stream<TRead, TWrite, TReadReturn, TWriteReturn>;
};

/**
 * The cancellation context of a live value associated with a formula.
 */
export type Context = {
  /**
   * The identifier for the associated formula.
   */
  id: string;
  /**
   * Cancel the value, preparing it for garbage collection. Cancellation
   * propagates to all values that depend on this value.
   *
   * @param reason - The reason for the cancellation.
   * @param logPrefix - The prefix to use within the log.
   * @returns A promise that is resolved when the value is cancelled and
   * can be garbage collected.
   */
  cancel: (reason?: Error, logPrefix?: string) => Promise<void>;

  /**
   * A promise that is rejected when the context is cancelled.
   * Once rejected, the cancelled value may initiate any teardown procedures.
   */
  cancelled: Promise<never>;

  /**
   * A promise that is resolved when the context is disposed. This occurs
   * after the `cancelled` promise is rejected, and after all disposal hooks
   * have been run.
   * Once resolved, the value may be garbage collected at any time.
   */
  disposed: Promise<void>;

  /**
   * @param id - The formula identifier of the value whose
   * cancellation should cause this value to be cancelled.
   */
  thisDiesIfThatDies: (id: string) => void;

  /**
   * @param id - The formula identifier of the value that should
   * be cancelled if this value is cancelled.
   */
  thatDiesIfThisDies: (id: string) => void;

  /**
   * @param hook - A hook to run when the value is cancelled.
   */
  onCancel: (hook: () => void | Promise<void>) => void;
};

export type FarContext = {
  id: () => string;
  cancel: (reason: Error) => Promise<void>;
  whenCancelled: () => Promise<never>;
  whenDisposed: () => Promise<void>;
  addDisposalHook: Context['onCancel'];
};

export type Controller<Value = unknown> = {
  value: Promise<Value>;
  context: Context;
};

export type FormulaMaker<ThisFormula extends Formula> = (
  formula: ThisFormula,
  context: Context,
  id: string,
  number: string,
) => unknown;

export type FormulaMakerTable = {
  [T in Formula['type']]: FormulaMaker<{ type: T } & Formula>;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Envelope = {};

export type Handle = {
  receive(envelope: Envelope, allegedFromId: string): void;
  open(envelope: Envelope): EnvelopedMessage;
};

export type MakeSha512 = () => Sha512;

export type PetStoreNameChange =
  | { add: string; value: IdRecord }
  | { remove: string };

export type PetStoreIdNameChange =
  | { add: IdRecord; names: string[] }
  | { remove: IdRecord; names?: string[] };

export type NameChangesTopic = Topic<PetStoreNameChange>;

export type IdChangesTopic = Topic<PetStoreIdNameChange>;

export type PetStore = {
  has(petName: string): boolean;
  identifyLocal(petName: string): string | undefined;
  list(): string[];
  /**
   * Subscribe to all name changes. First publishes all existing names in alphabetical order.
   * Then publishes diffs as names are added and removed.
   */
  followNameChanges(): AsyncGenerator<PetStoreNameChange, undefined, undefined>;
  /**
   * Subscribe to name changes for the specified id. First publishes the existing names for the id.
   * Then publishes diffs as names are added and removed, or if the id is itself removed.
   *
   * @throws If attempting to follow an id with no names.
   */
  followIdNameChanges(
    id: string,
  ): AsyncGenerator<PetStoreIdNameChange, undefined, undefined>;
  write(petName: string, id: string): Promise<void>;
  remove(petName: string): Promise<void>;
  rename(fromPetName: string, toPetName: string): Promise<void>;
  /**
   * @param id The formula identifier to look up.
   * @returns The formula identifier for the given pet name, or `undefined` if the pet name is not found.
   */
  reverseIdentify(id: string): string[];
};

/**
 * `add` and `remove` are locators.
 */
export type LocatorNameChange =
  | { add: string; names: string[] }
  | { remove: string; names?: string[] };

export type NameHub = {
  has(...petNamePath: string[]): Promise<boolean>;
  identify(...petNamePath: string[]): Promise<string | undefined>;
  locate(...petNamePath: string[]): Promise<string | undefined>;
  reverseLocate(locator: string): Promise<string[]>;
  followLocatorNameChanges(
    locator: string,
  ): AsyncGenerator<LocatorNameChange, undefined, undefined>;
  list(...petNamePath: string[]): Promise<string[]>;
  listIdentifiers(...petNamePath: string[]): Promise<string[]>;
  followNameChanges(
    ...petNamePath: string[]
  ): AsyncGenerator<PetStoreNameChange, undefined, undefined>;
  lookup(petNamePath: string | string[]): Promise<unknown>;
  reverseLookup(value: unknown): string[];
  write(petNamePath: string | string[], id: string): Promise<void>;
  remove(...petNamePath: string[]): Promise<void>;
  move(fromPetName: string[], toPetName: string[]): Promise<void>;
  copy(fromPetName: string[], toPetName: string[]): Promise<void>;
};

export type EndoDirectory = {
  makeDirectory(petNamePath: string[]): Promise<EndoDirectory>;
} & NameHub;

export type MakeDirectoryNode = (petStore: PetStore) => EndoDirectory;

export type Mail = {
  handle: () => Handle;
  // Partial inheritance from PetStore:
  petStore: PetStore;
  // Mail operations:
  listMessages(): Promise<StampedMessage[]>;
  followMessages(): AsyncGenerator<StampedMessage, undefined, undefined>;
  resolve(messageNumber: number, resolutionName: string): Promise<void>;
  reject(messageNumber: number, message?: string): Promise<void>;
  adopt(
    messageNumber: number,
    edgeName: string,
    petName: string[],
  ): Promise<void>;
  dismiss(messageNumber: number): Promise<void>;
  request(
    recipientName: string,
    what: string,
    responseName: string,
  ): Promise<unknown>;
  send(
    recipientName: string,
    strings: string[],
    edgeNames: string[],
    petNames: string[],
  ): Promise<void>;
  deliver(message: EnvelopedMessage): void;
};

export type MakeMailbox = (args: {
  selfId: string;
  petStore: PetStore;
  directory: EndoDirectory;
  context: Context;
}) => Mail;

export type RequestFn = (
  what: string,
  responseName: string,
  guestId: string,
  guestPetStore: PetStore,
) => Promise<unknown>;

export type EndoReadable = {
  sha512(): string;
  streamBase64(): FarRef<Reader<string>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type EndoWorker = {};

export type MakeHostOrGuestOptions = {
  agentName?: string;
  introducedNames?: Record<string, string>;
};

export type EndoPeer = {
  provide: (id: string) => Promise<unknown>;
};

export type EndoGateway = {
  provide: (id: string) => Promise<unknown>;
};

export type EndoGreeter = {
  hello: (
    remoteNodeKey: string,
    remoteGateway: Promise<EndoGateway>,
    cancel: (error: Error) => void,
    cancelled: Promise<never>,
  ) => Promise<EndoGateway>;
};

export type PeerInfo = {
  node: string;
  addresses: string[];
};

export type EndoNetwork = {
  supports: (network: string) => boolean;
  addresses: () => string[];
  connect: (address: string, farContext: FarContext) => Promise<EndoGateway>;
};

export type EndoAgent = {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  handle: () => {};
  listMessages: Mail['listMessages'];
  followMessages: Mail['followMessages'];
  resolve: Mail['resolve'];
  reject: Mail['reject'];
  adopt: Mail['adopt'];
  dismiss: Mail['dismiss'];
  request: Mail['request'];
  send: Mail['send'];
  deliver: Mail['deliver'];
  /**
   * @param id The formula identifier to look up.
   * @returns The formula identifier for the given pet name, or `undefined` if the pet name is not found.
   */
  reverseIdentify(id: string): string[];
} & EndoDirectory;

export type EndoGuest = {} & EndoAgent;

export type FarEndoGuest = FarRef<EndoGuest>;

export type EndoHost = {
  storeBlob(
    readerRef: ERef<AsyncIterableIterator<string>>,
    petName: string,
  ): Promise<FarRef<EndoReadable>>;
  storeValue<Value extends Passable>(
    value: Value,
    petName: string | string[],
  ): Promise<void>;
  provideGuest(
    petName?: string,
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoGuest>;
  provideHost(
    petName?: string,
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoHost>;
  makeDirectory(petNamePath: string[]): Promise<EndoDirectory>;
  provideWorker(petNamePath: string[]): Promise<EndoWorker>;
  evaluate(
    workerPetName: string | undefined,
    source: string,
    codeNames: string[],
    petNames: string[],
    resultName?: string[],
  ): Promise<unknown>;
  makeUnconfined(
    workerName: string | undefined | 'MAIN',
    specifier: string,
    powersName: string | 'NONE' | 'SELF' | 'ENDO',
    resultName?: string,
  ): Promise<unknown>;
  makeBundle(
    workerPetName: string | undefined,
    bundleName: string,
    powersName: string,
    resultName?: string,
  ): Promise<unknown>;
  cancel(petName: string, reason: Error): Promise<void>;
  greeter(): Promise<EndoGreeter>;
  gateway(): Promise<EndoGateway>;
  getPeerInfo(): Promise<PeerInfo>;
  addPeerInfo(peerInfo: PeerInfo): Promise<void>;
  invite(guestName: string): Promise<Invitation>;
  accept(
    invitationId: string,
    guestHandleId: string,
    guestName: string,
  ): Promise<void>;
} & EndoAgent;

export type EndoHostController = {} & Controller<FarRef<EndoHost>>;

export type EndoInspector<Record = string> = {
  lookup: (petName: Record) => Promise<unknown>;
  list: () => Record[];
};

export type KnownEndoInspectors = {
  eval: EndoInspector<'endowments' | 'source' | 'worker'>;
  'make-unconfined': EndoInspector<'host'>;
  'make-bundle': EndoInspector<'bundle' | 'powers' | 'worker'>;
  guest: EndoInspector<'bundle' | 'powers'>;
} & Record<string, EndoInspector>;

export type EndoBootstrap = {
  ping: () => Promise<string>;
  terminate: () => Promise<void>;
  host: () => Promise<EndoHost>;
  leastAuthority: () => Promise<EndoGuest>;
  greeter: () => Promise<EndoGreeter>;
  gateway: () => Promise<EndoGateway>;
  reviveNetworks: () => Promise<void>;
  addPeerInfo: (peerInfo: PeerInfo) => Promise<void>;
};

export type CryptoPowers = {
  makeSha512: () => Sha512;
  randomHex512: () => Promise<string>;
};

export type FilePowers = {
  makeFileReader: (path: string) => Reader<Uint8Array>;
  makeFileWriter: (path: string) => Writer<Uint8Array>;
  writeFileText: (path: string, text: string) => Promise<void>;
  readFileText: (path: string) => Promise<string>;
  maybeReadFileText: (path: string) => Promise<string | undefined>;
  readDirectory: (path: string) => Promise<string[]>;
  makePath: (path: string) => Promise<void>;
  joinPath: (...components: string[]) => string;
  removePath: (path: string) => Promise<void>;
  renamePath: (source: string, target: string) => Promise<void>;
};

export type AssertValidNameFn = (name: string) => void;

export type PetStorePowers = {
  makeIdentifiedPetStore: (
    id: string,
    formulaType: 'pet-store' | 'known-peers-store',
    assertValidName: AssertValidNameFn,
  ) => Promise<PetStore>;
};

export type SocketPowers = {
  servePort: (args: {
    port: number;
    host?: string;
    cancelled: Promise<never>;
  }) => Promise<{
    port: number;
    connections: Reader<Connection>;
  }>;
  connectPort: (args: {
    port: number;
    host?: string;
    cancelled: Promise<never>;
  }) => Promise<Connection>;
  servePath: (args: {
    path: string;
    cancelled: Promise<never>;
  }) => Promise<AsyncIterableIterator<Connection>>;
};

export type NetworkPowers = SocketPowers & {
  makePrivatePathService: (
    endoBootstrap: FarRef<EndoBootstrap>,
    sockPath: string,
    cancelled: Promise<never>,
    exitWithError: (error: Error) => void,
  ) => { started: Promise<void>; stopped: Promise<void> };
};

export type DaemonicPersistencePowers = {
  initializePersistence: () => Promise<void>;
  provideRootNonce: () => Promise<{
    rootNonce: string;
    isNewlyCreated: boolean;
  }>;
  makeContentSha512Store: () => {
    store: (readable: AsyncIterable<Uint8Array>) => Promise<string>;
    fetch: (sha512: string) => EndoReadable;
  };
  readFormula: (formulaNumber: string) => Promise<Formula>;
  writeFormula: (formulaNumber: string, formula: Formula) => Promise<void>;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type DaemonWorkerFacet = {};

export type WorkerDaemonFacet = {
  terminate(): Promise<void>;
  evaluate(
    source: string,
    names: string[],
    values: unknown[],
    id: string,
    cancelled: Promise<never>,
  ): Promise<unknown>;
  makeBundle(
    bundle: ERef<EndoReadable>,
    powers: ERef<unknown>,
    context: ERef<FarContext>,
  ): Promise<unknown>;
  makeUnconfined(
    path: string,
    powers: ERef<unknown>,
    context: ERef<FarContext>,
  ): Promise<unknown>;
};

export type DaemonicControlPowers = {
  makeWorker: (
    id: string,
    daemonWorkerFacet: DaemonWorkerFacet,
    cancelled: Promise<never>,
  ) => Promise<{
    workerTerminated: Promise<void>;
    workerDaemonFacet: ERef<WorkerDaemonFacet>;
  }>;
};

export type DaemonicPowers = {
  crypto: CryptoPowers;
  petStore: PetStorePowers;
  persistence: DaemonicPersistencePowers;
  control: DaemonicControlPowers;
};

type FormulateResult<Item> = Promise<{
  id: string;
  value: Item;
}>;

export type DeferredTask<Item extends Record<string, string | string[]>> = (
  ids: Readonly<Item>,
) => Promise<void>;

/**
 * A collection of deferred tasks (i.e. async functions) that can be executed in
 * parallel.
 */
export type DeferredTasks<Item extends Record<string, string | string[]>> = {
  execute(identifiers: Readonly<Item>): Promise<void>;
  push(value: DeferredTask<Item>): void;
};

type FormulateNumberedGuestParams = {
  guestFormulaNumber: string;
  handleId: string;
  guestId: string;
  hostAgentId: string;
  hostHandleId: string;
  storeId: string;
  workerId: string;
};

type FormulateHostDependenciesParams = {
  endoId: string;
  networksDirectoryId: string;
  specifiedWorkerId?: string;
};

type FormulateNumberedHostParams = {
  hostFormulaNumber: string;
  hostId: string;
  handleId: string;
  workerId: string;
  storeId: string;
  inspectorId: string;
  endoId: string;
  networksDirectoryId: string;
};

export type FormulaValueTypes = {
  directory: EndoDirectory;
  network: EndoNetwork;
  peer: EndoGateway;
  'pet-store': PetStore;
  'readable-blob': EndoReadable;
  endo: EndoBootstrap;
  guest: EndoGuest;
  handle: Handle;
  host: EndoHost;
  invitation: Invitation;
  worker: EndoWorker;
};

export type ProvideTypes = FormulaValueTypes & {
  agent: EndoAgent;
  hub: NameHub;
};

export type Provide = <
  Type extends keyof ProvideTypes,
  Provided extends ProvideTypes[Type],
>(
  id: string,
  expectedType?: Type,
) => Promise<Provided>;

export type DaemonCore = {
  cancelValue: (id: string, reason: Error) => Promise<void>;

  formulate: (
    formulaNumber: string,
    formula: Formula,
  ) => Promise<{
    id: string;
    value: unknown;
  }>;

  formulateBundle: (
    hostAgentId: string,
    hostHandleId: string,
    bundleId: string,
    deferredTasks: DeferredTasks<MakeCapletDeferredTaskParams>,
    specifiedWorkerId?: string,
    specifiedPowersId?: string,
  ) => FormulateResult<unknown>;

  formulateDirectory: () => FormulateResult<EndoDirectory>;

  formulateEndo: (
    specifiedFormulaNumber: string,
  ) => FormulateResult<FarRef<EndoBootstrap>>;

  formulateMarshalValue: (
    value: Passable,
    deferredTasks: DeferredTasks<MarshalDeferredTaskParams>,
  ) => FormulateResult<void>;

  formulateEval: (
    nameHubId: string,
    source: string,
    codeNames: string[],
    endowmentIdsOrPaths: (string | string[])[],
    deferredTasks: DeferredTasks<EvalDeferredTaskParams>,
    specifiedWorkerId?: string,
  ) => FormulateResult<unknown>;

  formulateGuest: (
    hostId: string,
    hostHandleId: string,
    deferredTasks: DeferredTasks<AgentDeferredTaskParams>,
  ) => FormulateResult<EndoGuest>;

  /**
   * Helper for callers of {@link formulateNumberedGuest}.
   *
   * @param hostId - The formula identifier of the host to formulate a guest for.
   * @returns The formula identifiers for the guest formulation's dependencies.
   */
  formulateGuestDependencies: (
    hostAgentId: string,
    hostHandleId: string,
  ) => Promise<Readonly<FormulateNumberedGuestParams>>;

  formulateHost: (
    endoId: string,
    networksDirectoryId: string,
    deferredTasks: DeferredTasks<AgentDeferredTaskParams>,
    specifiedWorkerId?: string | undefined,
  ) => FormulateResult<EndoHost>;

  /**
   * Helper for callers of {@link formulateNumberedHost}.
   *
   * @param specifiedIdentifiers - The existing formula identifiers specified to the host formulation.
   * @returns The formula identifiers for all of the host formulation's dependencies.
   */
  formulateHostDependencies: (
    specifiedIdentifiers: FormulateHostDependenciesParams,
  ) => Promise<Readonly<FormulateNumberedHostParams>>;

  formulateLoopbackNetwork: () => FormulateResult<EndoNetwork>;

  formulateNetworksDirectory: () => FormulateResult<EndoDirectory>;

  formulateNumberedGuest: (
    identifiers: FormulateNumberedGuestParams,
  ) => FormulateResult<EndoGuest>;

  formulateNumberedHost: (
    identifiers: FormulateNumberedHostParams,
  ) => FormulateResult<EndoHost>;

  formulatePeer: (
    networksId: string,
    nodeId: string,
    addresses: string[],
  ) => FormulateResult<EndoPeer>;

  formulateReadableBlob: (
    readerRef: ERef<AsyncIterableIterator<string>>,
    deferredTasks: DeferredTasks<ReadableBlobDeferredTaskParams>,
  ) => FormulateResult<FarRef<EndoReadable>>;

  formulateInvitation: (
    hostAgentId: string,
    hostHandleId: string,
    guestName: string,
    deferredTasks: DeferredTasks<InvitationDeferredTaskParams>,
  ) => FormulateResult<Invitation>;

  formulateUnconfined: (
    hostAgentId: string,
    hostHandleId: string,
    specifier: string,
    deferredTasks: DeferredTasks<MakeCapletDeferredTaskParams>,
    specifiedWorkerId?: string,
    specifiedPowersId?: string,
  ) => FormulateResult<unknown>;

  formulateWorker: (
    deferredTasks: DeferredTasks<WorkerDeferredTaskParams>,
  ) => FormulateResult<EndoWorker>;

  getAllNetworkAddresses: (networksDirectoryId: string) => Promise<string[]>;

  getIdForRef: (ref: unknown) => string | undefined;

  getTypeForId: (id: string) => Promise<string>;

  makeDirectoryNode: MakeDirectoryNode;

  makeMailbox: MakeMailbox;

  provide: Provide;

  provideController: (id: string) => Controller;

  provideAgentForHandle: (id: string) => Promise<ERef<EndoAgent>>;
};

export type DaemonCoreExternal = {
  formulateEndo: DaemonCore['formulateEndo'];
  nodeId: string;
  provide: DaemonCore['provide'];
};

export type SerialJobs = {
  enqueue: <Item>(asyncFn?: () => Promise<Item>) => Promise<Item>;
};

export type Multimap<Key, Value> = {
  /**
   * @param key - The key to add a value for.
   * @param value - The value to add.
   */
  add(key: Key, value: Value): void;

  /**
   * @param key - The key whose value to delete.
   * @param value - The value to delete.
   * @returns `true` if the key was found and the value was deleted, `false` otherwise.
   */
  delete(key: Key, value: Value): boolean;

  /**
   * @param key - The key whose values to delete
   * @returns `true` if the key was found and its values were deleted, `false` otherwise.
   */
  deleteAll(key: Key): boolean;

  /**
   * @param key - The key whose first value to retrieve
   * @returns The first value associated with the key.
   */
  get(key: Key): Value | undefined;

  /**
   * @param key - The key whose values to retrieve.
   * @returns An array of all values associated with the key.
   */
  getAllFor(key: Key): Value[];

  /**
   * @param key - The key whose presence to check for.
   * @returns `true` if the key is present and `false` otherwise.
   */
  has(key: Key): boolean;
};

/**
 * A multimap backed by a WeakMap.
 */
export type WeakMultimap<Key extends WeakKey, Value> = Multimap<Key, Value>;

export type BidirectionalMultimap<Key, Value> = {
  /**
   * @param key - The key to add a value for.
   * @param value - The value to add.
   * @throws If the value has already been added for a different key.
   */
  add(key: Key, value: Value): void;

  /**
   * @param key - The key whose value to delete.
   * @param value - The value to delete.
   * @returns `true` if the key was found and the value was deleted, `false` otherwise.
   */
  delete(key: Key, value: Value): boolean;

  /**
   * @param key - The key whose values to delete.
   * @returns `true` if the key was found and its values were deleted, `false` otherwise.
   */
  deleteAll(key: Key): boolean;

  /**
   * @param key - The key whose presence to check for.
   * @returns `true` if the key is present and `false` otherwise.
   */
  has(key: Key): boolean;

  /**
   * @param value - The value whose presence to check for.
   * @returns `true` if the value is present and `false` otherwise.
   */
  hasValue(value: Value): boolean;

  /**
   * @param key - The key whose first value to retrieve.
   * @returns The first value associated with the key.
   */
  get(key: Key): Value | undefined;

  /**
   * @param value - The value whose key to retrieve.
   * @returns The key associated with the value.
   */
  getKey(value: Value): Key | undefined;

  /**
   * @returns An array of all values, for all keys.
   */
  getAll(): Value[];

  /**
   * @param key - The key whose values to retrieve.
   * @returns An array of all values associated with the key.
   */
  getAllFor(key: Key): Value[];
};

export type RemoteControl = {
  accept(
    remoteGateway: Promise<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose?: () => void,
  ): void;
  connect(
    getRemoteGateway: () => Promise<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose?: () => void,
  ): Promise<EndoGateway>;
};

export type RemoteControlState = {
  accept(
    remoteGateway: Promise<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose: () => void,
  ): RemoteControlState;
  connect(
    getRemoteGateway: () => Promise<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose: () => void,
  ): { state: RemoteControlState; remoteGateway: Promise<EndoGateway> };
};
