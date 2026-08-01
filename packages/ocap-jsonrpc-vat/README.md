# `@ocap/ocap-jsonrpc-vat`

Ocap kernel vat that exposes access to kernel objects via a JSON-RPC
interface on a Unix-domain socket. Intended as the routine path for
local, non-vat processes (e.g. LLM tool plugins) to redeem OCAP URLs
and send messages to the resulting objects, replacing ad-hoc use of
the kernel-cli's `queueMessage` RPC.

## Protocol

The vat serves a line-delimited JSON-RPC 2.0 interface on the socket.
Two methods:

- `redeemURL({ url: string }) -> "@@j<n>"`

  Redeems `url` through the kernel's `ocapURLRedemptionService` and
  returns a sigil name of the form `"@@j1"`, `"@@j2"`, ... referring
  to the resulting live reference. Callable at any time.

- `send({ target: string, method: string, args?: unknown[] }) -> unknown`

  Invokes `E(target)[method](...args)`. The `target` and any nested
  `"@@j<n>"` string in `args` is expanded to its live remotable
  before dispatch. The awaited result is walked and every remotable
  it contains (previously known or newly encountered) is replaced by
  its `"@@j<n>"` name in the response.

Object identity is preserved: an object the caller has already seen
keeps the same `@@j<n>` name across `redeemURL` and `send` calls.

## Session lifecycle

The naming table lives in memory only. On socket disconnect the vat
resets its state and awaits a new client; the new client's names
start at `o1` again.

Restarting the daemon likewise resets the session — this is the
common case, since restart is typically how the operator triggers a
fresh state.
